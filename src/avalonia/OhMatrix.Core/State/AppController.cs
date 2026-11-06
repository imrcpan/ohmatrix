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
    IProfileEngine? profiles = null
) {
    /// <summary>How long a zoom is tried before it goes back by itself.</summary>
    public static readonly TimeSpan ZoomTrialTime = TimeSpan.FromSeconds(15);

    private readonly TimeProvider time = clock ?? TimeProvider.System;
    private ITimer? zoomTimer;

    // The engine tells of changes from its own threads; the store is changed on the thread the controller was made on (the UI thread).
    private readonly SynchronizationContext? context = SynchronizationContext.Current;
    private bool roomsHooked;
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
                        Timeline = items
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
                Timeline = now
            });
            _ = Quietly(session.MarkRead);
        } catch (Exception) {
            // The chat stays empty; choosing it again tries again.
        }
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
            _ => Store.Update(s => s with {
                ZoomTrial = null
            }),
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

    private void StartRooms()
    {
        _ = LoadProfile();
        if (rooms is null)
            return;
        if (!roomsHooked) {
            roomsHooked = true;
            rooms.RoomsChanged += list => Post(() => Store.Update(s => s with {
                Rooms = Order(list)
            }));
            rooms.SyncChanged += state => Post(() => Store.Update(s => s with {
                SyncState = state
            }));
        }

        _ = Quietly(rooms.StartSync);
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
        Store.Update(s => s with {
            Rooms = [],
            RoomInfoOpen = false,
            Details = null,
            Profile = null,
            SidebarPage = SidebarPage.Chats,
            SyncState = SyncState.Stopped,
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
        } catch {
            return default;
        }
    }

    private static async Task<bool> Quietly(Func<Task> run)
    {
        try {
            await run();
            return true;
        } catch {
            return false;
        }
    }
}
