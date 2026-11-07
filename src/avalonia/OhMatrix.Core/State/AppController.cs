using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.Ui;

namespace OhMatrix.Core.State;

/// <summary>The controller of one account: it changes the <see cref="Store"/> and talks to the engine (<c>AppController</c> of the TypeScript state).</summary>
public sealed class AppController(
    IAuthEngine engine,
    ISessionStore sessions,
    IPreferencesStore? preferences = null,
    TimeProvider? clock = null,
    IRoomsEngine? rooms = null,
    IChatEngine? chats = null,
    IMediaEngine? media = null,
    IProfileEngine? profiles = null,
    IDevicesEngine? devices = null,
    ILinkPreviewEngine? links = null,
    ISecurityEngine? security = null,
    INotifier? notifier = null,
    IVerificationEngine? verification = null,
    ICallsEngine? callsEngine = null,
    ICallPlatform? callPlatform = null,
    Calls.ICallSounds? callSounds = null,
    IStickersEngine? stickersEngine = null
) {
    /// <summary>How long a zoom is tried before it goes back by itself.</summary>
    public static readonly TimeSpan ZoomTrialTime = TimeSpan.FromSeconds(15);

    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private ITimer? zoomTimer;

    // The engine tells of changes from its own threads; the store is changed on the thread the controller was made on (the UI thread).
    private readonly SynchronizationContext? context = SynchronizationContext.Current;
    private bool roomsHooked;
    private bool verifyHooked;
    private bool callsHooked;
    private Calls.CallSignalling? signalling;
    private ITimer? callEndedTimer;
    private IChatSession? chat;
    private int chatOpening;

    public Store<AppState> Store { get; } = new(new AppState());

    /// <summary>The pictures of rooms and people.</summary>
    public Pictures Pictures { get; } = new(media);

    /// <summary>Restores the saved session, if there is one. Called once at the start.</summary>
    public async Task Bootstrap()
    {
        try {
            if (preferences is not null) {
                var saved = await Quietly(preferences.Load);
                if (saved is not null)
                    Store.Update(s => s with {
                        Prefs = saved
                    });
            }

            var session = await sessions.Load();
            if (session is null) {
                SignedOut();
                return;
            }

            await engine.Restore(session);
            Store.Update(s => s with {
                Auth = AuthStatus.SignedIn,
                UserId = session.UserId,
                Homeserver = session.Homeserver,
            });
            StartRooms();
        } catch (Exception e) {
            var code = (e as EngineException)?.Code;
            // A session the server no longer takes, or whose keys are gone, is not kept.
            if (code is EngineErrorCode.Unauthorized or EngineErrorCode.KeysLost)
                await sessions.Clear();
            SignedOut(code == EngineErrorCode.Unauthorized ? null : e.Message, code);
        }
    }

    public Task Login(string homeserver, string username, string password)
    {
        return SignIn(homeserver, () => engine.LoginWithPassword(homeserver, username, password));
    }

    /// <summary>Creates an account on the server and signs in as it (see <see cref="IAuthEngine.Register"/>).</summary>
    public Task Register(string homeserver, string username, string password, string? token = null)
    {
        return SignIn(homeserver, () => engine.Register(homeserver, username, password, token));
    }

    public async Task Logout()
    {
        try {
            CloseChat();
            if (rooms is not null)
                await Quietly(rooms.StopSync);
            await engine.Logout();
        } finally {
            await sessions.Clear();
            SignedOut();
        }
    }

    /// <summary>Opens a chat, or closes the open one with null.</summary>
    public void SelectRoom(string? roomId)
    {
        CloseChat();
        Store.Update(s => s with {
            SelectedRoomId = roomId,
            Timeline = [],
            TimelineReady = false,
            Typing = [],
            ReplyTo = null,
            Editing = null,
            Details = null,
        });
        if (roomId is not null && Store.Value.RoomInfoOpen)
            _ = LoadDetails(roomId);
        if (roomId is not null && chats is not null)
            _ = OpenChat(roomId);
    }

    /// <summary>Joins a room and opens it. Failures are <see cref="EngineException"/>.</summary>
    public async Task JoinRoom(string idOrAlias)
    {
        var id = await rooms!.JoinRoom(idOrAlias.Trim());
        SelectRoom(id);
    }

    /// <summary>
    /// Joins a room of the public directory behind a row of the chat list that says so; the failure is in <see cref="AppState.JoinError"/>. The
    /// caller does not wait: the page can go away at once.
    /// </summary>
    public async Task JoinPublicRoom(PublicRoom room)
    {
        if (Store.Value.Joining.Any(j => j.Id == room.RoomId))
            return;
        var joining = new JoiningRoom(room.RoomId, room.Name, room.AvatarUrl, time.GetUtcNow());
        Store.Update(s => s with {
            Joining = [joining, .. s.Joining],
            JoinError = null
        });
        try {
            await JoinRoom(room.Alias ?? room.RoomId);
        } catch (EngineException e) {
            Store.Update(s => s with {
                JoinError = e.Message
            });
        } finally {
            Store.Update(s => s with {
                Joining = s.Joining.Where(j => j.Id != room.RoomId).ToList()
            });
        }
    }

    public void DismissJoinError()
    {
        Store.Update(s => s with {
            JoinError = null
        });
    }

    /// <summary>Starts a one-to-one chat with a person and opens it.</summary>
    public async Task StartDirectChat(string userId)
    {
        var id = await rooms!.CreateRoom(null, true, [userId.Trim()]);
        SelectRoom(id);
    }

    /// <summary>Makes a group, inviting the people, and opens it.</summary>
    public async Task CreateGroup(string name, IReadOnlyList<string> invite)
    {
        var id = await rooms!.CreateRoom(name.Trim(), false, invite);
        SelectRoom(id);
    }

    /// <summary>Accepts an invitation and opens the chat.</summary>
    public async Task AcceptInvite(string roomId)
    {
        await rooms!.AcceptInvite(roomId);
        SelectRoom(roomId);
    }

    public Task DeclineInvite(string roomId)
    {
        return rooms!.DeclineInvite(roomId);
    }

    public Task SetPinned(string roomId, bool pinned)
    {
        return rooms!.SetPinned(roomId, pinned);
    }

    public Task SetRoomMuted(string roomId, bool muted)
    {
        return rooms!.SetMuted(roomId, muted);
    }

    public Task SetMarkedUnread(string roomId, bool unread)
    {
        return rooms!.SetMarkedUnread(roomId, unread);
    }

    public Task MarkRoomRead(string roomId)
    {
        return rooms!.MarkRoomRead(roomId);
    }

    /// <summary>Renames a group. Failures (not allowed to) are <see cref="EngineException"/>.</summary>
    public Task SetRoomName(string roomId, string name)
    {
        return rooms!.SetRoomName(roomId, name.Trim());
    }

    /// <summary>Changes the description of a group, and shows the new one in the info panel.</summary>
    public async Task SetRoomTopic(string roomId, string topic)
    {
        await rooms!.SetRoomTopic(roomId, topic.Trim());
        await LoadDetails(roomId);
    }

    public Task<IReadOnlyList<PersonInfo>> SearchPeople(string term)
    {
        return rooms is null
            ? Task.FromResult<IReadOnlyList<PersonInfo>>([])
            : rooms.SearchPeople(term);
    }

    /// <summary>Invites people to a group, and shows them in the info panel.</summary>
    public async Task InviteToRoom(string roomId, IReadOnlyList<string> userIds)
    {
        await rooms!.InviteToRoom(roomId, userIds);
        await LoadDetails(roomId);
    }

    /// <summary>Changes the role of a person in a group, and shows it in the info panel.</summary>
    public async Task SetMemberRole(string roomId, string userId, MemberRole role)
    {
        await rooms!.SetMemberRole(roomId, userId, role);
        await LoadDetails(roomId);
    }

    /// <summary>Removes a person from a group.</summary>
    public async Task RemoveMember(string roomId, string userId)
    {
        await rooms!.RemoveMember(roomId, userId);
        await LoadDetails(roomId);
    }

    /// <summary>Bans a person from a group.</summary>
    public async Task BanMember(string roomId, string userId, string? reason)
    {
        await rooms!.BanMember(roomId, userId, string.IsNullOrWhiteSpace(reason) ? null : reason);
        await LoadDetails(roomId);
    }

    private readonly Dictionary<string, Task<LinkPreview?>> previews = [];

    /// <summary>The preview of a link, asked once and kept; null when there is none.</summary>
    public Task<LinkPreview?> LinkPreview(string url)
    {
        if (links is null)
            return Task.FromResult<LinkPreview?>(null);
        if (!previews.TryGetValue(url, out var task)) {
            task = Quietly(() => links.Preview(url));
            previews[url] = task;
        }

        return task;
    }

    /// <summary>Asks the engine where the account stands with its keys; it comes a little after sign-in, so it is asked again on request.</summary>
    public async Task RefreshSecurity()
    {
        if (security is null)
            return;
        var state = await Quietly(security.State);
        if (state is { } now)
            Post(() => Store.Update(s => s with {
                Security = now
            }));
    }

    /// <summary>Sets the encryption of the account up with the password; gives the recovery key to keep. Failures (a wrong password) are <see cref="EngineException"/>.</summary>
    public async Task<string> SetUpEncryption(string password)
    {
        var key = await security!.SetUp(password);
        await RefreshSecurity();
        return key;
    }

    /// <summary>Unlocks the encrypted history with the recovery key. Failures (a wrong key) are <see cref="EngineException"/>.</summary>
    public async Task RestoreWithRecoveryKey(string key)
    {
        await security!.RestoreWithRecoveryKey(key);
        await RefreshSecurity();
    }

    /// <summary>This machine and this build can make calls.</summary>
    public bool CallsSupported => callsEngine is not null && callPlatform is { Available: true };

    /// <summary>How long a call that has ended stays on screen, saying how it ended.</summary>
    public static readonly TimeSpan CallEndedStays = TimeSpan.FromMilliseconds(1800);

    private Calls.CallSignalling Signalling()
    {
        return signalling ??= new Calls.CallSignalling(
            new Calls.CallTransport(callsEngine!, callPlatform!, time, Post),
            () => Store.Value.UserId ?? "",
            info => {
                var before = Store.Value.Call;
                Store.Update(s => s with {
                    Call = info
                });
                CallHeard(before, info);
                // An ended call goes by itself after a moment.
                callEndedTimer?.Dispose();
                if (info is { Phase: Calls.CallPhase.Ended })
                    callEndedTimer = time.CreateTimer(_ => Post(() => signalling?.Dismiss()), null,
                        CallEndedStays, Timeout.InfiniteTimeSpan);
            }
        );
    }

    /// <summary>The sound and the notification of a call: it rings while it is ringing, and a short sound ends it.</summary>
    private void CallHeard(Calls.CallInfo? before, Calls.CallInfo? now)
    {
        var ringing = now is { Phase: Calls.CallPhase.Ringing };
        var wasRinging = before is { Phase: Calls.CallPhase.Ringing } &&
                         before.CallId == now?.CallId;
        if (ringing && !wasRinging) {
            callSounds?.Ring(now!.Incoming);
            if (now!.Incoming && notifier is not null && Store.Value.Prefs.Notifications) {
                var room = Store.Value.Rooms.FirstOrDefault(r => r.Id == now.RoomId);
                notifier.Notify(new Notification(now.RoomId, room?.Name ?? now.Peer,
                    Strings.T(Store.Value.Locale,
                        now.Video ? "call.incoming.video" : "call.incoming.voice"),
                    false));
            }
        } else if (!ringing && wasRinging)
            callSounds?.Stop();

        if (now is { Phase: Calls.CallPhase.Ended } &&
            before is not { Phase: Calls.CallPhase.Ended })
            callSounds?.Ended();
    }

    private async Task ListenForCalls()
    {
        if (callsEngine is null || callPlatform is null)
            return;
        if (!callsHooked) {
            callsHooked = true;
            callsEngine.CallEvent += e => Post(() => {
                // An event of the room I am in as I am signed in; a failure inside the conversation must not reach the engine's thread.
                _ = Receive(e);
            });
        }

        await Quietly(callsEngine.Listen);
    }

    private async Task Receive(Calls.CallEvent e)
    {
        try {
            await Signalling().Receive(e);
        } catch (Exception ex) {
            AppLog.Error("call event: " + ex.Message);
        }
    }

    /// <summary>
    /// Calls the other person of a one-to-one chat. Throws <see cref="InvalidOperationException"/> with "busy" (a call is on), "no_media" (the
    /// devices are refused), "direct" (the chat is not one-to-one) or "unsupported".
    /// </summary>
    public async Task PlaceCall(string roomId, bool video)
    {
        if (!CallsSupported)
            throw new InvalidOperationException("unsupported");
        var room = Store.Value.Rooms.FirstOrDefault(r => r.Id == roomId);
        var details = rooms is null ? null : await rooms.Details(roomId);
        var other = details?.Members.FirstOrDefault(m => m.UserId != Store.Value.UserId);
        if (room is not { IsDirect: true } || other is null)
            throw new InvalidOperationException("direct");
        await Signalling().Place(roomId, other.UserId, video);
    }

    /// <summary>The newest picture of the other side of a video call, if one has come; see <see cref="ICallPlatform.TakeRemoteFrame"/>.</summary>
    public bool TakeCallFrame(Action<IntPtr, int, int> copy)
    {
        return callPlatform?.TakeRemoteFrame(copy) == true;
    }

    /// <summary>My own camera in a video call, small; see <see cref="ICallPlatform.TakeLocalFrame"/>.</summary>
    public bool TakeLocalCallFrame(Action<IntPtr, int, int> copy)
    {
        return callPlatform?.TakeLocalFrame(copy) == true;
    }

    /// <summary>The microphones and cameras of the machine, the ones in use marked; empty where calls are not supported.</summary>
    public Calls.CallDevices CallDevices()
    {
        return callPlatform?.Media.Devices() ?? new Calls.CallDevices([], []);
    }

    /// <summary>Changes the microphone (or camera) of the call and the ones after it.</summary>
    public void UseCallDevice(bool camera, string id)
    {
        callPlatform?.Media.UseDevice(camera, id);
    }

    public Task AnswerCall()
    {
        return Signalling().Answer(Store.Value.Call?.Video == true);
    }

    public Task HangupCall()
    {
        return Signalling().Hangup();
    }

    public void SetCallMuted(bool muted)
    {
        Signalling().SetMuted(muted);
    }

    public void SetCallCameraOff(bool off)
    {
        Signalling().SetCameraOff(off);
    }

    /// <summary>Asks my other sessions to verify this one; the progress is in <see cref="AppState.Verification"/>.</summary>
    public async Task RequestVerification()
    {
        if (verification is null)
            return;
        Store.Update(s => s with {
            Verification = new VerifyFlow(VerifyPhase.Requested, false)
        });
        try {
            await verification.Request();
        } catch (Exception) {
            Store.Update(s => s with {
                Verification = new VerifyFlow(VerifyPhase.Failed, false)
            });
        }
    }

    public Task AcceptVerification()
    {
        return Quietly(() => verification!.Accept());
    }

    /// <summary>Says whether the seven pictures matched.</summary>
    public Task ConfirmVerification(bool match)
    {
        return Quietly(() => verification!.Confirm(match));
    }

    /// <summary>Stops the verification (when it is still going) and takes it off the screen; a finished one also refreshes the keys' state.</summary>
    public async Task DismissVerification()
    {
        var flow = Store.Value.Verification;
        if (flow is null)
            return;
        Store.Update(s => s with {
            Verification = null
        });
        if (verification is not null && !flow.Ended)
            await Quietly(() => verification.Cancel());
        if (flow.Phase == VerifyPhase.Done)
            await RefreshSecurity();
    }

    /// <summary>My sessions, this one first. Failures are <see cref="EngineException"/>.</summary>
    public Task<IReadOnlyList<DeviceInfo>> ListDevices()
    {
        return devices is null
            ? Task.FromResult<IReadOnlyList<DeviceInfo>>([])
            : devices.ListDevices();
    }

    /// <summary>Signs other sessions out; the server wants the password.</summary>
    public Task RemoveDevices(IReadOnlyList<string> ids, string password)
    {
        return devices!.RemoveDevices(ids, password);
    }

    /// <summary>Searches the public rooms of the homeserver (or of <paramref name="server"/>).</summary>
    public Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(string filter, string? server = null)
    {
        return rooms is null
            ? Task.FromResult<IReadOnlyList<PublicRoom>>([])
            : rooms.SearchPublicRooms(filter, server);
    }

    /// <summary>Leaves a chat and closes it.</summary>
    public async Task LeaveRoom(string roomId)
    {
        await rooms!.LeaveRoom(roomId);
        if (Store.Value.SelectedRoomId == roomId)
            SelectRoom(null);
    }

    /// <summary>Opens a space in the left pane: the rooms it lists.</summary>
    public void OpenSpace(string spaceId)
    {
        Store.Update(s => s with {
            SidebarPage = SidebarPage.Space,
            OpenSpaceId = spaceId
        });
    }

    /// <summary>The rooms and spaces a space lists. Failures are <see cref="EngineException"/>.</summary>
    public Task<IReadOnlyList<SpaceChild>> SpaceChildren(string spaceId)
    {
        return rooms is null
            ? Task.FromResult<IReadOnlyList<SpaceChild>>([])
            : rooms.SpaceChildren(spaceId);
    }

    /// <summary>Shows a page in the left pane.</summary>
    public void OpenSidebarPage(SidebarPage page)
    {
        Store.Update(s => s with {
            SidebarPage = page
        });
    }

    /// <summary>Sends text to the open chat. Nothing is sent for an empty text.</summary>
    public Task Send(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0 || chat is null)
            return Task.CompletedTask;
        if (Store.Value.Editing is { } editing) {
            StartEdit(null);
            return chat.Edit(editing.Id, trimmed);
        }

        var reply = Store.Value.ReplyTo?.EventId;
        if (reply is not null)
            SetReplyTo(null);
        return chat.Send(trimmed, reply);
    }

    /// <summary>Answers a message in the open chat: the next text sent quotes it. Null cancels.</summary>
    public void SetReplyTo(TimelineItem? item)
    {
        Store.Update(s => s with {
            ReplyTo = item,
            Editing = item is null ? Store.Value.Editing : null,
        });
    }

    /// <summary>Shows or hides the info panel of the open chat.</summary>
    public void OpenRoomInfo(bool open)
    {
        Store.Update(s => s with {
            RoomInfoOpen = open
        });
        if (open && Store.Value.SelectedRoomId is { } id)
            _ = LoadDetails(id);
    }

    private async Task LoadDetails(string roomId)
    {
        if (rooms is null)
            return;
        try {
            var details = await rooms.Details(roomId);
            Post(() => {
                if (Store.Value.SelectedRoomId == roomId)
                    Store.Update(s => s with {
                        Details = details
                    });
            });
        } catch (Exception) {
            // The panel shows what it has; opening it again tries again.
        }
    }

    /// <summary>Sends a file from disk to the open chat (a picture as a picture). Failures are <see cref="EngineException"/>.</summary>
    public async Task SendAttachment(string path)
    {
        if (chat is null)
            return;
        var mime = MimeTypes.For(path);
        int? width = null;
        int? height = null;
        if (MimeTypes.IsImage(mime)) {
            try {
                using var stream = File.OpenRead(path);
                using var bitmap = new Avalonia.Media.Imaging.Bitmap(stream);
                width = bitmap.PixelSize.Width;
                height = bitmap.PixelSize.Height;
            } catch (Exception) {
                // A picture whose size cannot be read is sent without one.
            }
        }

        await chat.SendAttachment(path, mime, width, height);
    }

    private ITimer? noticeTimer;
    private long noticeSerial;

    /// <summary>Shows a message at the top of the screen, over whatever is showing.</summary>
    public void ShowNotice(string message, NoticeKind kind = NoticeKind.Success,
        TimeSpan? stay = null)
    {
        noticeTimer?.Dispose();
        noticeTimer = null;
        var serial = ++noticeSerial;
        Store.Update(s => s with {
            Notice = new Notice(message, kind, serial)
        });
        var wait = stay ?? kind switch {
            NoticeKind.Progress => (TimeSpan?)null,
            NoticeKind.Error => TimeSpan.FromSeconds(4),
            _ => TimeSpan.FromSeconds(2.5),
        };
        if (wait is { } w)
            noticeTimer = time.CreateTimer(_ => Post(() => {
                if (Store.Value.Notice?.Serial == serial)
                    Store.Update(s => s with {
                        Notice = null
                    });
            }), null, w, Timeout.InfiniteTimeSpan);
    }

    /// <summary>Sends a message of the open chat on to another chat.</summary>
    public Task ForwardMessage(TimelineItem item, string roomId)
    {
        var content = Forward.Content(item) ?? throw new EngineException(
            EngineErrorCode.Unsupported, "This cannot be forwarded.");
        return chats is null ? Task.CompletedTask : chats.SendMessageContent(roomId, content);
    }

    /// <summary>Whether this account can keep a sticker pack (the picker has a stickers tab).</summary>
    public bool CanStickers => stickersEngine is not null;

    /// <summary>Reads my stickers and their groups from the account into the state.</summary>
    public async Task LoadStickers()
    {
        if (stickersEngine is null)
            return;
        var (stickers, groups) = await stickersEngine.Load();
        Store.Update(s => s with {
            Stickers = stickers,
            StickerGroups = groups
        });
    }

    /// <summary>Puts a picture file in my pack (in a group, when given), and gives the name it got.</summary>
    public async Task<string> AddSticker(string path, string? groupId = null)
    {
        var upload = ReadUpload(path);
        var code = await stickersEngine!.Add(upload, groupId);
        await LoadStickers();
        return code;
    }

    /// <summary>Puts the picture of a message in my pack, in a group.</summary>
    public async Task AddStickerFrom(TimelineItem item, string groupId)
    {
        var picture = item.Image ?? throw new EngineException(EngineErrorCode.Unsupported,
            "Not a picture.");
        if (!picture.Source.StartsWith("mxc://", StringComparison.Ordinal))
            throw new EngineException(EngineErrorCode.Unsupported,
                "A picture in a private room cannot be added without downloading it.");
        var mime = StickerPack.Mime(picture.FileName, MimeTypes.For(picture.FileName));
        await stickersEngine!.AddExisting(new Sticker(picture.FileName, picture.Source, mime,
            picture.Width, picture.Height), groupId);
        await LoadStickers();
    }

    private static StickerUpload ReadUpload(string path)
    {
        var name = Path.GetFileName(path);
        var mime = StickerPack.Check(name, MimeTypes.For(path), new FileInfo(path).Length);
        var data = File.ReadAllBytes(path);
        int? width = null;
        int? height = null;
        try {
            using var bitmap = new Avalonia.Media.Imaging.Bitmap(new MemoryStream(data));
            width = bitmap.PixelSize.Width;
            height = bitmap.PixelSize.Height;
        } catch (Exception) {
            // A picture whose size cannot be read is kept without one.
        }

        return new StickerUpload(name, mime, data, width, height);
    }

    /// <summary>Takes stickers out of my pack.</summary>
    public async Task RemoveStickers(IReadOnlyList<string> shortcodes)
    {
        await stickersEngine!.Remove(shortcodes);
        await LoadStickers();
    }

    /// <summary>Replaces my sticker groups.</summary>
    public async Task SetStickerGroups(IReadOnlyList<StickerGroup> groups)
    {
        await stickersEngine!.SetGroups(groups);
        Store.Update(s => s with {
            StickerGroups = groups
        });
    }

    /// <summary>Uploads a picture file to be the cover of a group.</summary>
    public Task<StickerIcon> UploadGroupIcon(string path)
    {
        return stickersEngine!.UploadGroupIcon(ReadUpload(path));
    }

    /// <summary>Sends one of my stickers to the open chat.</summary>
    public Task SendSticker(string shortcode)
    {
        return Store.Value.SelectedRoomId is { } room && stickersEngine is not null
            ? stickersEngine.Send(room, shortcode)
            : Task.CompletedTask;
    }

    /// <summary>Starts changing one of my messages: the composer takes its text, and the next send replaces it. Null cancels.</summary>
    public void StartEdit(TimelineItem? item)
    {
        Store.Update(s => s with {
            Editing = item,
            ReplyTo = null
        });
    }

    /// <summary>Pins a message of the open chat, or takes the pin away.</summary>
    public Task SetMessagePinned(string itemId, bool pinned)
    {
        return chat is null ? Task.CompletedTask : chat.SetPinned(itemId, pinned);
    }

    /// <summary>Removes one of my messages for everyone.</summary>
    public Task DeleteMessage(string itemId)
    {
        return chat is null ? Task.CompletedTask : chat.Delete(itemId);
    }

    /// <summary>Tries again to send a message that could not be sent.</summary>
    public Task ResendMessage(string itemId)
    {
        return chat is null ? Task.CompletedTask : chat.Resend(itemId);
    }

    /// <summary>Drops a message that could not be sent.</summary>
    public Task DiscardMessage(string itemId)
    {
        return chat is null ? Task.CompletedTask : chat.Discard(itemId);
    }

    /// <summary>Adds my reaction to a message, or takes it away.</summary>
    public Task ToggleReaction(string itemId, string key)
    {
        return chat is null ? Task.CompletedTask : chat.ToggleReaction(itemId, key);
    }

    /// <summary>Loads older messages of the open chat.</summary>
    public async Task<bool> LoadOlder()
    {
        return chat is not null && await chat.LoadOlder();
    }

    private async Task OpenChat(string roomId)
    {
        var ticket = ++chatOpening;
        try {
            var session = await chats!.Open(roomId);
            // Another chat was chosen while this one was opening.
            if (ticket != chatOpening) {
                session.Dispose();
                return;
            }

            chat = session;
            session.Changed += items => Post(() => {
                if (ReferenceEquals(chat, session))
                    Store.Update(s => s with {
                        Timeline = items,
                        TimelineReady = true,
                        Rooms = WithPreview(s.Rooms, roomId, items),
                    });
            });
            session.TypingChanged += names => Post(() => {
                if (ReferenceEquals(chat, session))
                    Store.Update(s => s with {
                        Typing = names
                    });
            });
            var now = session.Items;
            Store.Update(s => s with {
                Timeline = now,
                TimelineReady = true,
                Rooms = WithPreview(s.Rooms, roomId, now),
            });
            _ = Quietly(session.MarkRead);
        } catch (Exception) {
            // The chat stays empty; choosing it again tries again.
        }
    }

    /// <summary>
    /// The engine does not always know the newest message of a room it has not opened; once the chat is open its own messages give the row's
    /// text and time, when the row has none.
    /// </summary>
    public static IReadOnlyList<RoomSummary> WithPreview(
        IReadOnlyList<RoomSummary> rooms,
        string roomId,
        IReadOnlyList<TimelineItem> items
    )
    {
        var last = items.LastOrDefault(i => !i.Sending
                                            && (i.Kind == TimelineKind.Message
                                                || (i.Kind == TimelineKind.Service
                                                    && i.Body != TimelineItem.Undecryptable)));
        var index = -1;
        for (var i = 0; i < rooms.Count; i++) {
            if (rooms[i].Id == roomId)
                index = i;
        }

        if (last is null || index < 0 || rooms[index].LastActivityTs != 0)
            return rooms;
        var text = last.Body.Length > 0 ? last.Body
            : last.Image is not null ? last.Image.FileName
            : last.File?.Name;
        var copy = rooms.ToList();
        copy[index] = copy[index] with {
            LastMessage = text,
            LastSender = last.IsOwn || last.Kind == TimelineKind.Service ? null : last.SenderName,
            LastIsLine = last.Kind == TimelineKind.Service,
            LastActivityTs = last.Ts,
        };
        return Order(copy);
    }

    private void CloseChat()
    {
        chatOpening++;
        chat?.Dispose();
        chat = null;
    }

    /// <summary>Changes the preferences and keeps them.</summary>
    public void SetPreferences(Func<Preferences, Preferences> change)
    {
        Store.Update(s => s with {
            Prefs = change(s.Prefs)
        });
        SavePreferences();
    }

    /// <summary>
    /// Draws the interface at <paramref name="scale"/> without keeping it: it goes back by itself after <see cref="ZoomTrialTime"/> unless
    /// <see cref="KeepZoom"/> is called. The size already kept ends any trial.
    /// </summary>
    public void TryZoom(double scale)
    {
        var from = Store.Value.Prefs.UiScale;
        StopZoomTimer();
        if (scale == from) {
            Store.Update(s => s with {
                ZoomTrial = null
            });
            return;
        }

        var until = time.GetUtcNow() + ZoomTrialTime;
        Store.Update(s => s with {
            ZoomTrial = new ZoomTrial(from, scale, until)
        });
        zoomTimer = time.CreateTimer(
            _ => Post(() => Store.Update(s => s with {
                ZoomTrial = null
            })),
            null,
            ZoomTrialTime,
            Timeout.InfiniteTimeSpan
        );
    }

    /// <summary>Keeps the size being tried: it is saved as the preference.</summary>
    public void KeepZoom()
    {
        var trial = Store.Value.ZoomTrial;
        if (trial is null)
            return;
        StopZoomTimer();
        Store.Update(s => s with {
            ZoomTrial = null
        });
        SetPreferences(p => p with {
            UiScale = trial.To
        });
    }

    /// <summary>Goes back to the size that was kept.</summary>
    public void RevertZoom()
    {
        StopZoomTimer();
        Store.Update(s => s with {
            ZoomTrial = null
        });
    }

    private void StopZoomTimer()
    {
        zoomTimer?.Dispose();
        zoomTimer = null;
    }

    // Signing in and registering end the same way: keep the session, remember the server.
    private async Task SignIn(string homeserver, Func<Task<Session>> start)
    {
        Store.Update(s => s with {
            Auth = AuthStatus.SigningIn,
            AuthError = null,
            AuthErrorCode = null,
        });
        try {
            var session = await start();
            await sessions.Save(session);
            Store.Update(s => s with {
                Auth = AuthStatus.SignedIn,
                UserId = session.UserId,
                Homeserver = session.Homeserver,
            });
            StartRooms();
            // Offered again the next time the sign-in screen is shown (after signing out, or on another account).
            var typed = homeserver.Trim();
            if (Store.Value.Prefs.LastHomeserver != typed) {
                Store.Update(s => s with {
                    Prefs = s.Prefs with {
                        LastHomeserver = typed
                    }
                });
                SavePreferences();
            }
        } catch (Exception e) {
            SignedOut(e.Message, (e as EngineException)?.Code);
        }
    }

    /// <summary>Fetches the file of a message to disk and gives its path; null when it cannot be fetched.</summary>
    public async Task<string?> DownloadFile(FileAttachment file)
    {
        if (media is null || file.Source.Length == 0)
            return null;
        return await media.Download(file.Source, file.Name, file.Mime);
    }

    /// <summary>Makes a picture file my picture. Failures are <see cref="EngineException"/>.</summary>
    public async Task SetAvatar(string path)
    {
        var data = await File.ReadAllBytesAsync(path);
        await profiles!.SetAvatar(MimeTypes.For(path), data);
        await LoadProfile();
    }

    /// <summary>Makes a picture file the picture of a group.</summary>
    public async Task SetRoomAvatar(string roomId, string path)
    {
        var data = await File.ReadAllBytesAsync(path);
        await rooms!.SetRoomAvatar(roomId, MimeTypes.For(path), data);
    }

    /// <summary>Sets my status line; the profile shows it at once. Failures are <see cref="EngineException"/>.</summary>
    public async Task SetStatus(string status)
    {
        var trimmed = status.Trim();
        await profiles!.SetStatus(trimmed);
        Store.Update(s => s with {
            Profile = s.Profile is null
                ? null
                : s.Profile with {
                    Status = trimmed.Length == 0 ? null : trimmed
                }
        });
    }

    /// <summary>Changes my name; the profile shows the new one at once. Failures are <see cref="EngineException"/>.</summary>
    public async Task SetDisplayName(string name)
    {
        var trimmed = name.Trim();
        await profiles!.SetDisplayName(trimmed);
        Store.Update(s => s with {
            Profile = s.Profile is null
                ? null
                : s.Profile with {
                    DisplayName = trimmed
                }
        });
    }

    private async Task LoadProfile()
    {
        if (profiles is null)
            return;
        try {
            var profile = await profiles.Load();
            Post(() => Store.Update(s => s with {
                Profile = profile
            }));
        } catch (Exception) {
            // The name stays what it was until the next sign-in.
        }
    }

    // Right after sign-in the SDK has not found the keys of the account yet: the state is asked a few times.
    private async Task WatchSecurity()
    {
        for (var i = 0; i < 6; i++) {
            await RefreshSecurity();
            if (Store.Value.Security != SecurityState.Unavailable
                && Store.Value.Security != SecurityState.NeedsSetup)
                return;
            await Task.Delay(TimeSpan.FromSeconds(5));
        }
    }

    private async Task ListenForVerification()
    {
        if (verification is null)
            return;
        if (!verifyHooked) {
            verifyHooked = true;
            verification.Changed += next => Post(() => Store.Update(s => s with {
                Verification = VerifyFlow.After(s.Verification, next)
            }));
        }

        await Quietly(verification.Listen);
    }

    private void StartRooms()
    {
        _ = LoadProfile();
        _ = WatchSecurity();
        _ = ListenForVerification();
        _ = ListenForCalls();
        if (rooms is null)
            return;
        if (!roomsHooked) {
            roomsHooked = true;
            rooms.RoomsChanged += list => Post(() => {
                var before = Store.Value.Rooms;
                Store.Update(s => s with {
                    Rooms = Order(list)
                });
                Announce(before, Store.Value.Rooms);
                if (Store.Value is { SyncState: SyncState.Syncing, RoomsSettled: false })
                    Settle(false);
            });
            rooms.SyncChanged += state => Post(() => {
                Store.Update(s => s with {
                    SyncState = state
                });
                if (state == SyncState.Syncing && !Store.Value.RoomsSettled)
                    Settle(true);
            });
        }

        _ = Quietly(rooms.StartSync);
    }

    private CancellationTokenSource? settleQuiet;
    private CancellationTokenSource? settleCap;

    /// <summary>The first load is over when the list has been still for 700 ms once syncing, or after 6 s at most.</summary>
    private void Settle(bool start)
    {
        settleQuiet?.Cancel();
        settleQuiet = new CancellationTokenSource();
        _ = SettleAfter(TimeSpan.FromMilliseconds(700), settleQuiet.Token);
        if (start && settleCap is null) {
            settleCap = new CancellationTokenSource();
            _ = SettleAfter(TimeSpan.FromSeconds(6), settleCap.Token);
        }
    }

    private void Unsettle()
    {
        settleQuiet?.Cancel();
        settleCap?.Cancel();
        settleQuiet = null;
        settleCap = null;
    }

    private async Task SettleAfter(TimeSpan wait, CancellationToken token)
    {
        try {
            await Task.Delay(wait, time, token);
        } catch (OperationCanceledException) {
            return;
        }

        Post(() => {
            if (!Store.Value.RoomsSettled)
                Store.Update(s => s with {
                    RoomsSettled = true
                });
        });
    }

    /// <summary>
    /// Tells of the messages that came in since the list was last seen: a chat whose unread count went up, that is not muted. The first list (the
    /// start-up) and a chat not known before are not announced.
    /// </summary>
    private void Announce(IReadOnlyList<RoomSummary> before, IReadOnlyList<RoomSummary> now)
    {
        var prefs = Store.Value.Prefs;
        if (notifier is null || !prefs.Notifications || before.Count == 0)
            return;
        var known = before.ToDictionary(r => r.Id);
        var locale = Store.Value.Locale;
        foreach (var room in now) {
            if (room.Muted || room.Invite || room.UnreadCount == 0
                || !known.TryGetValue(room.Id, out var was) || room.UnreadCount <= was.UnreadCount)
                continue;
            var text = room.LastMessage is null
                ? ""
                : string.Join(" ",
                    room.LastMessage.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
            var body = !prefs.NotificationPreview || text.Length == 0
                ? I18n.Strings.T(locale, "notif.new")
                : room.LastSender is { Length: > 0 } who && !room.IsDirect
                    ? $"{who}: {text}"
                    : text;
            notifier.Notify(new Notification(room.Id, room.Name, body,
                Store.Value.SelectedRoomId == room.Id));
        }
    }

    private void Post(Action change)
    {
        if (context is null)
            change();
        else
            context.Post(_ => change(), null);
    }

    /// <summary>Pinned chats first, then the latest activity first.</summary>
    public static IReadOnlyList<RoomSummary> Order(IEnumerable<RoomSummary> list)
    {
        return list.OrderByDescending(r => r.Pinned).ThenByDescending(r => r.LastActivityTs)
            .ToList();
    }

    private void SignedOut(string? error = null, EngineErrorCode? code = null)
    {
        Unsettle();
        Store.Update(s => s with {
            Rooms = [],
            RoomsSettled = false,
            TimelineReady = false,
            RoomInfoOpen = false,
            Details = null,
            Profile = null,
            SidebarPage = SidebarPage.Chats,
            SyncState = SyncState.Stopped,
            Security = SecurityState.Unavailable,
            Verification = null,
            Call = null,
            Joining = [],
            JoinError = null,
            SelectedRoomId = null,
            Auth = AuthStatus.SignedOut,
            AuthError = error,
            AuthErrorCode = code,
            UserId = null,
            Homeserver = null,
        });
    }

    // A preference that cannot be saved is not worth stopping for: it is what the person has set until the app is closed.
    private void SavePreferences()
    {
        if (preferences is null)
            return;
        var now = Store.Value.Prefs;
        _ = Quietly(() => preferences.Save(now));
    }

    private static async Task<T?> Quietly<T>(Func<Task<T>> run)
    {
        try {
            return await run();
        } catch (Exception e) {
            AppLog.Error(e.Message);
            return default;
        }
    }

    private static async Task<bool> Quietly(Func<Task> run)
    {
        try {
            await run();
            return true;
        } catch (Exception e) {
            AppLog.Error(e.Message);
            return false;
        }
    }
}
