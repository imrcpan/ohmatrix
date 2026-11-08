using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.Calls;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public partial class ChatPaneTests {
    private static readonly long Now =
        new DateTimeOffset(2026, 11, 7, 12, 30, 0, TimeSpan.Zero)
            .ToUnixTimeMilliseconds();

    private sealed class FakeChat(IReadOnlyList<TimelineItem> first)
        : IChatSession {
        public event Action<IReadOnlyList<TimelineItem>>? Changed;
        public IReadOnlyList<TimelineItem> Items { get; private set; } = first;
        public readonly List<bool> Typed = [];

        public Task SetTyping(bool typing)
        {
            Typed.Add(typing);
            return Task.CompletedTask;
        }

        public readonly List<string> Sent = [];
        public bool Disposed;

        public event Action<IReadOnlyList<string>>? TypingChanged;
        public readonly List<string> Replies = [];
        public readonly List<string> Reacted = [];

        public void Type(params string[] names)
        {
            TypingChanged?.Invoke(names);
        }

        public readonly List<string> Attached = [];

        public Task SendAttachment(string path, string mimeType, int? width,
            int? height)
        {
            Attached.Add(
                $"{Path.GetFileName(path)} {mimeType} {width}x{height}");
            return Task.CompletedTask;
        }

        public readonly List<string> Pins = [];

        public Task SetPinned(string itemId, bool pinned)
        {
            Pins.Add($"{itemId} {pinned}");
            return Task.CompletedTask;
        }

        public readonly List<string> Edits = [];
        public readonly List<string> Deleted = [];

        public Task Edit(string itemId, string text)
        {
            Edits.Add(itemId + ":" + text);
            return Task.CompletedTask;
        }

        public Task Delete(string itemId)
        {
            Deleted.Add(itemId);
            return Task.CompletedTask;
        }

        public readonly List<string> Retried = [];

        public Task Resend(string itemId)
        {
            Retried.Add("resend " + itemId);
            return Task.CompletedTask;
        }

        public Task Discard(string itemId)
        {
            Retried.Add("discard " + itemId);
            return Task.CompletedTask;
        }

        public Task ToggleReaction(string itemId, string key)
        {
            Reacted.Add(itemId + key);
            return Task.CompletedTask;
        }

        public readonly List<string> Mentioned = [];

        public Task Send(string text, string? replyToEventId = null,
            IReadOnlyList<string>? mentions = null)
        {
            if (replyToEventId is not null)
                Replies.Add(replyToEventId);
            Sent.Add(text);
            Mentioned.AddRange(mentions ?? []);
            Items = [
                .. Items,
                new TimelineItem {
                    Id = "n" + Sent.Count,
                    Body = text,
                    IsOwn = true,
                    SenderId = "@me",
                    Ts = Now,
                    Sending = true,
                },
            ];
            Changed?.Invoke(Items);
            return Task.CompletedTask;
        }

        public Task<bool> LoadOlder()
        {
            return Task.FromResult(true);
        }

        public Task MarkRead()
        {
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            Disposed = true;
        }
    }

    private sealed class Media : IMediaEngine {
        public readonly List<string> Asked = [];

        public Task<string?> Download(string source, string fileName,
            string mimeType)
        {
            Asked.Add($"download {source} {fileName} {mimeType}");
            return Task.FromResult<string?>("/tmp/" + fileName);
        }

        public Task<byte[]?> Thumbnail(string mxc, int width, int height)
        {
            Asked.Add($"{mxc} {width}x{height}");
            using var target = new Avalonia.Media.Imaging.RenderTargetBitmap(
                new Avalonia.PixelSize(width, height)
            );
            using (var ctx = target.CreateDrawingContext()) {
                ctx.DrawRectangle(
                    Avalonia.Media.Brushes.Orange,
                    null,
                    new Avalonia.Rect(0, 0, width, height)
                );
            }

            using var stream = new MemoryStream();
            target.Save(stream);
            return Task.FromResult<byte[]?>(stream.ToArray());
        }
    }

    private sealed class Devices : IDevicesEngine {
        public readonly List<string> Removed = [];
        private bool gone;

        public Task<IReadOnlyList<DeviceInfo>> ListDevices()
        {
            IReadOnlyList<DeviceInfo> all = gone
                ? [new DeviceInfo("D1", "This laptop", Now, null, true)]
                : [
                    new DeviceInfo("D1", "This laptop", Now, null, true),
                    new DeviceInfo("D2", "Phone", Now - 3 * 86_400_000L,
                        "10.0.0.7", false),
                    new DeviceInfo("D3", "Old tablet", null, null, false),
                ];
            return Task.FromResult(all);
        }

        public Task RemoveDevices(IReadOnlyList<string> ids, string password)
        {
            if (password != "pw")
                throw new EngineException(EngineErrorCode.Forbidden,
                    "Invalid password");
            Removed.AddRange(ids);
            gone = true;
            return Task.CompletedTask;
        }
    }

    private sealed class Security : ISecurityEngine {
        public SecurityState Current = SecurityState.NeedsRecovery;
        public readonly List<string> Keys = [];

        public Task<SecurityState> State() => Task.FromResult(Current);

        public Task<string> SetUp(string password)
        {
            if (password != "pw")
                throw new EngineException(EngineErrorCode.Forbidden,
                    "Wrong password");
            Current = SecurityState.Ready;
            return Task.FromResult("EsTc new key");
        }

        public Task RestoreWithRecoveryKey(string key)
        {
            if (key != "EsTc good key")
                throw new EngineException(EngineErrorCode.Forbidden,
                    "Wrong recovery key");
            Keys.Add(key);
            Current = SecurityState.Ready;
            return Task.CompletedTask;
        }
    }

    private static readonly Security Keys = new();

    private sealed class StickersFake : IStickersEngine {
        public List<Sticker> Pack = [
            new("cat", "mxc://s/cat", "image/png", 64, 64, 900),
            new("dog", "mxc://s/dog", "image/png", 64, 64, 900),
            new("owl", "mxc://s/owl", "image/png", 64, 64, 900),
        ];

        public IReadOnlyList<StickerGroup> Groups = [];
        public readonly List<string> Calls = [];

        public Task<(IReadOnlyList<Sticker> Stickers,
            IReadOnlyList<StickerGroup> Groups)> Load()
        {
            return Task
                .FromResult<(IReadOnlyList<Sticker>, IReadOnlyList<StickerGroup>
                    )>((Pack,
                    Groups));
        }

        public Task<string> Add(StickerUpload file, string? groupId)
        {
            var code =
                StickerPack.NewShortcode(file.Name,
                    Pack.Select(p => p.Shortcode).ToHashSet());
            Pack.Add(new Sticker(code, "mxc://s/" + code, file.MimeType,
                file.Width, file.Height));
            Calls.Add("add " + code);
            return Task.FromResult(code);
        }

        public Task<string> AddExisting(Sticker picture, string? groupId)
        {
            var code = StickerPack.NewShortcode(picture.Shortcode,
                Pack.Select(p => p.Shortcode).ToHashSet());
            Pack.Add(picture with {
                Shortcode = code
            });
            Calls.Add("existing " + code + " " + groupId);
            return Task.FromResult(code);
        }

        public Task Remove(IReadOnlyList<string> shortcodes)
        {
            Pack.RemoveAll(p => shortcodes.Contains(p.Shortcode));
            Groups = StickerPack.Without(Groups, shortcodes);
            Calls.Add("remove " + string.Join(",", shortcodes));
            return Task.CompletedTask;
        }

        public Task SetGroups(IReadOnlyList<StickerGroup> groups)
        {
            Groups = groups;
            Calls.Add("groups " + groups.Count);
            return Task.CompletedTask;
        }

        public Task<StickerIcon> UploadGroupIcon(StickerUpload file)
        {
            return Task.FromResult(StickerIcon.OfImage("mxc://s/icon",
                file.MimeType));
        }

        public Task Send(string roomId, string shortcode)
        {
            Calls.Add($"send {roomId} {shortcode}");
            return Task.CompletedTask;
        }
    }

    private static readonly StickersFake Stickers = new();
    private static readonly Verifier Verify = new();

    private sealed class CallsFake : ICallsEngine {
        public event Action<OhMatrix.Core.Calls.CallEvent>? CallEvent;

        public readonly List<(string Room, string Type,
                System.Text.Json.Nodes.JsonObject Content)>
            Sent = [];

        public Task Listen() => Task.CompletedTask;

        public Task SendCallEvent(string roomId, string type,
            System.Text.Json.Nodes.JsonObject content)
        {
            Sent.Add((roomId, type,
                System.Text.Json.Nodes.JsonNode.Parse(content.ToJsonString())!
                    .AsObject()));
            return Task.CompletedTask;
        }

        public Task<IReadOnlyList<OhMatrix.Core.Calls.IceServer>>
            TurnServers() =>
            Task.FromResult<IReadOnlyList<OhMatrix.Core.Calls.IceServer>>([]);

        public void Deliver(string type, string sender,
            System.Text.Json.Nodes.JsonObject content) =>
            CallEvent?.Invoke(
                new OhMatrix.Core.Calls.CallEvent("!d", type, sender, "$e", 0,
                    content));
    }

    private sealed class PlatformFake : ICallPlatform {
        public bool Available => true;
        public readonly List<string> Log = [];
        public ICallMedia Media { get; }

        public bool TakeRemoteFrame(Action<IntPtr, int, int> copy) => false;

        public bool TakeLocalFrame(Action<IntPtr, int, int> copy) => false;

        public PlatformFake() => Media = new MediaFake(Log);

        public OhMatrix.Core.Calls.IPeer NewPeer(
            IReadOnlyList<OhMatrix.Core.Calls.IceServer> servers) =>
            new PeerFake();

        private sealed class MediaFake(List<string> log) : ICallMedia {
            public string? StreamId => "s1";

            public CallDevices Devices() => new(
                [
                    new CallDevice("m1", "Built-in microphone", true),
                    new CallDevice("m2", "Headset", false)
                ],
                [new CallDevice("c1", "Webcam", true)]);

            public void UseDevice(bool camera, string id) =>
                log.Add($"use {camera} {id}");

            public Task Start(OhMatrix.Core.Calls.IPeer peer, bool video)
            {
                log.Add("start " + video);
                return Task.CompletedTask;
            }

            public void SetMuted(bool muted) => log.Add("muted " + muted);
            public void SetCameraOff(bool off) => log.Add("camera " + off);
            public void Stop() => log.Add("stop");
        }

        private sealed class PeerFake : OhMatrix.Core.Calls.IPeer {
            private bool local, remote;
            public event Action<OhMatrix.Core.Calls.IceCandidate?>? Candidate;
            public event Action<OhMatrix.Core.Calls.PeerState>? Connection;

            public Task<OhMatrix.Core.Calls.SessionDescription> CreateOffer() =>
                Task.FromResult(
                    new OhMatrix.Core.Calls.SessionDescription("offer",
                        "v=0\nm=audio"));

            public Task<OhMatrix.Core.Calls.SessionDescription>
                CreateAnswer() =>
                Task.FromResult(
                    new OhMatrix.Core.Calls.SessionDescription("answer",
                        "v=0\nm=audio"));

            public Task SetLocalDescription(
                OhMatrix.Core.Calls.SessionDescription d)
            {
                local = true;
                Check();
                return Task.CompletedTask;
            }

            public Task SetRemoteDescription(
                OhMatrix.Core.Calls.SessionDescription d)
            {
                remote = true;
                Check();
                return Task.CompletedTask;
            }

            public Task AddIceCandidate(OhMatrix.Core.Calls.IceCandidate c) =>
                Task.CompletedTask;

            public void Close() { }

            private void Check()
            {
                if (local && remote)
                    Connection?.Invoke(OhMatrix.Core.Calls.PeerState.Connected);
            }
        }
    }

    private sealed class SoundsFake : ICallSounds {
        public readonly List<string> Log = [];

        public void Ring(bool incoming) =>
            Log.Add(incoming ? "ring" : "ringback");

        public void Stop() => Log.Add("stop");

        public void Ended() => Log.Add("ended");
    }

    private static readonly SoundsFake CallSound = new();
    private static readonly Notes CallNotes = new();
    private static readonly CallsFake CallLine = new();
    private static readonly PlatformFake CallMedia = new();

    private sealed class Verifier : IVerificationEngine {
        public event Action<VerifyFlow>? Changed;
        public readonly List<string> Calls = [];

        public Task Listen() => Task.CompletedTask;

        public Task RequestUser(string userId) => Task.CompletedTask;

        public Task Request()
        {
            Calls.Add("request");
            return Task.CompletedTask;
        }

        public Task Accept()
        {
            Calls.Add("accept");
            return Task.CompletedTask;
        }

        public Task Confirm(bool match)
        {
            Calls.Add(match ? "match" : "mismatch");
            return Task.CompletedTask;
        }

        public Task Cancel()
        {
            Calls.Add("cancel");
            return Task.CompletedTask;
        }

        public void Tell(VerifyFlow flow) => Changed?.Invoke(flow);
    }

    private sealed class Profiles : IProfileEngine {
        public Task<Profile> Load()
        {
            return Task.FromResult(new Profile("@me", "Mia Example", null));
        }

        public readonly List<string> Names = [];
        public readonly List<string> Statuses = [];

        public Task SetStatus(string status)
        {
            if (status == "refused")
                throw new EngineException(EngineErrorCode.Unsupported, "no");
            Statuses.Add(status);
            return Task.CompletedTask;
        }

        public readonly List<string> Avatars = [];

        public Task SetAvatar(string mimeType, byte[] data)
        {
            Avatars.Add($"{mimeType} {data.Length}");
            return Task.CompletedTask;
        }

        public Task SetDisplayName(string name)
        {
            Names.Add(name);
            return Task.CompletedTask;
        }
    }

    private sealed class Engine : IAuthEngine, IRoomsEngine, IChatEngine {
        public event Action<IReadOnlyList<RoomSummary>>? RoomsChanged;
        public event Action<SyncState>? SyncChanged;
        public readonly List<FakeChat> Opened = [];

        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password)
        {
            return Task.FromResult(new Session(homeserver, "@" + username, "D",
                "T"));
        }

        public Task<Session> Register(string homeserver, string username,
            string password,
            string? token)
        {
            return LoginWithPassword(homeserver, username, password);
        }

        public Task Restore(Session session)
        {
            return Task.CompletedTask;
        }

        public Task Logout()
        {
            return Task.CompletedTask;
        }

        public TaskCompletionSource<string>? JoinGate;

        public Task<string> JoinRoom(string idOrAlias)
        {
            if (JoinGate is { } gate)
                return gate.Task;
            return Task.FromResult("!joined");
        }

        public List<string> Created = [];

        public Task<string> CreateRoom(string? name, bool direct,
            IReadOnlyList<string> invite)
        {
            if (name == "bad")
                return Task.FromException<string>(new EngineException(
                    EngineErrorCode.Forbidden,
                    "Not allowed"));
            Created.Add($"{name}|{direct}|{string.Join(",", invite)}");
            return Task.FromResult("!made");
        }

        public List<string> Actions = [];

        public Task<RoomDetails> Details(string roomId)
        {
            return Task.FromResult(new RoomDetails(
                "We plan the demo here.",
                [
                    new RoomMemberInfo("@me:s", "Mia Example", null,
                        MemberRole.Admin),
                    new RoomMemberInfo("@alice:s", "Alice", null,
                        MemberRole.Moderator),
                    new RoomMemberInfo("@bob:s", "Bob", null,
                        MemberRole.Member),
                ],
                [],
                JoinRule.Invite,
                HistoryVisibility.Shared,
                new PowerThresholds(50, 50, 50, 50, 0, 50, 100),
                new RoomPermissions(true, true, true, true, true, true, true),
                false
            ));
        }

        public Task AcceptInvite(string roomId) => Log("accept " + roomId);
        public Task DeclineInvite(string roomId) => Log("decline " + roomId);

        public Task SetPinned(string roomId, bool pinned) =>
            Log($"pin {roomId} {pinned}");

        public Task SetMuted(string roomId, bool muted) =>
            Log($"mute {roomId} {muted}");

        public Task SetMarkedUnread(string roomId, bool unread) =>
            Log($"unread {roomId} {unread}");

        public Task MarkRoomRead(string roomId) => Log("read " + roomId);

        public Task SetRoomName(string roomId, string name) =>
            Log($"name {roomId} {name}");

        public Task SetRoomTopic(string roomId, string topic) =>
            Log($"topic {roomId} {topic}");

        public Task LeaveRoom(string roomId) => Log("leave " + roomId);
        public Task BlockUser(string userId) => Log("block " + userId);

        public Task<IReadOnlyList<SpaceChild>> SpaceChildren(string spaceId)
        {
            Actions.Add("space " + spaceId);
            return Task.FromResult<IReadOnlyList<SpaceChild>>([
                new SpaceChild("!d", "Alice", null, null, 2, false),
                new SpaceChild("!out", "Not joined room", "Come in", null, 40,
                    false),
                new SpaceChild("!sub", "Sub space", null, null, 5, true),
            ]);
        }

        public Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(string filter,
            string? server)
        {
            Actions.Add($"explore {filter} {server}");
            IReadOnlyList<PublicRoom> all = [
                new PublicRoom("!pub1:s", "Public Chat", "Talk about anything",
                    "#pub:s", null,
                    1200),
                new PublicRoom("!pub2:s", "Rust Fans", null, null, null, 1),
            ];
            return Task.FromResult<IReadOnlyList<PublicRoom>>(
            [
                .. all.Where(r =>
                    r.Name.Contains(filter, StringComparison.OrdinalIgnoreCase))
            ]);
        }

        public Task SetRoomAvatar(string roomId, string mimeType,
            byte[] data) =>
            Log($"avatar {roomId} {mimeType} {data.Length}");

        public Task SetMemberRole(string roomId, string userId,
            MemberRole role) =>
            Log($"role {roomId} {userId} {role}");

        public Task SetMemberPower(string roomId, string userId, int level) =>
            Log($"power {roomId} {userId} {level}");

        public Task UnbanMember(string roomId, string userId) =>
            Log($"unban {roomId} {userId}");

        public Task RemoveMember(string roomId, string userId) =>
            Log($"remove {roomId} {userId}");

        public Task BanMember(string roomId, string userId, string? reason) =>
            Log($"ban {roomId} {userId} {reason}");

        public Task SetJoinRule(string roomId, JoinRule rule) =>
            Log($"joinRule {roomId} {rule}");

        public Task SetHistoryVisibility(string roomId,
            HistoryVisibility visibility) =>
            Log($"history {roomId} {visibility}");

        public Task<bool> IsAliasAvailable(string alias) =>
            Task.FromResult(true);

        public Task AddRoomAlias(string roomId, string alias) =>
            Log($"addAlias {roomId} {alias}");

        public Task RemoveRoomAlias(string roomId, string alias) =>
            Log($"removeAlias {roomId} {alias}");

        public Task SetMainAlias(string roomId, string? alias) =>
            Log($"mainAlias {roomId} {alias}");

        public Task SetPowerThresholds(string roomId,
            PowerThresholds thresholds) =>
            Log($"thresholds {roomId}");

        public Task<IReadOnlyList<PersonInfo>> SearchPeople(string term)
        {
            IReadOnlyList<PersonInfo> all = [
                new PersonInfo("@ann:s", "Ann Lee", null),
                new PersonInfo("@anna:s", "Anna K", null)
            ];
            return Task.FromResult<IReadOnlyList<PersonInfo>>(
            [
                .. all.Where(p =>
                    p.Name.Contains(term, StringComparison.OrdinalIgnoreCase))
            ]);
        }

        public Task InviteToRoom(string roomId,
            IReadOnlyList<string> userIds) =>
            Log($"invite {roomId} {string.Join(",", userIds)}");

        private Task Log(string action)
        {
            Actions.Add(action);
            return Task.CompletedTask;
        }

        public Task StartSync()
        {
            SyncChanged?.Invoke(SyncState.Syncing);
            return Task.CompletedTask;
        }

        public Task StopSync()
        {
            return Task.CompletedTask;
        }

        public void Push(params RoomSummary[] rooms)
        {
            RoomsChanged?.Invoke(rooms);
        }

        public readonly List<string> Forwarded = [];

        public Task<SharedMediaPage> SharedMedia(string roomId, MediaKind kind,
            int offset,
            int want)
        {
            var all = Opened.LastOrDefault()?.Items
                .Where(i => MediaKinds.Of(i) == kind)
                .Reverse().ToList() ?? [];
            var more = all.Count > offset + want;
            return Task.FromResult(new SharedMediaPage(
                [.. all.Skip(offset).Take(want)],
                more ? offset + want : null));
        }

        public Task SendMessageContent(string roomId,
            System.Text.Json.Nodes.JsonObject content)
        {
            if (roomId == "!bad")
                throw new EngineException(EngineErrorCode.Network, "offline");
            Forwarded.Add($"{roomId} {content["msgtype"]} {content["body"]}");
            return Task.CompletedTask;
        }

        public Task<IChatSession> Open(string roomId)
        {
            var chat = new FakeChat(History(roomId));
            Opened.Add(chat);
            return Task.FromResult<IChatSession>(chat);
        }

        private static IReadOnlyList<TimelineItem> History(string roomId)
        {
            if (roomId != "!g")
                return [];
            return [
                new TimelineItem {
                    Id = "d1",
                    Kind = TimelineKind.Date,
                    Ts = Now - 86400_000
                },
                new TimelineItem {
                    Id = "1",
                    Body = "Hi there",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 86400_000,
                },
                new TimelineItem {
                    Id = "2",
                    EventId = "$2",
                    Body =
                        "Are we still on for the demo tomorrow? I can bring the slides and a few more details about the plan.",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 86400_000 + 60_000,
                },
                new TimelineItem {
                    Id = "3",
                    EventId = "$3",
                    Reply = new ReplyQuote("Alice",
                        "Are we still on for the demo tomorrow?", "$2"),
                    Reactions = [
                        new ReactionCount("👍", 2, true),
                        new ReactionCount("❤️", 1, false)
                    ],
                    Body = "Yes!",
                    SenderId = "@me",
                    IsOwn = true,
                    Read = true,
                    Ts = Now - 86400_000 + 120_000,
                },
                new TimelineItem {
                    Id = "img",
                    Body = "Look at this",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 900_000,
                    Image = new ImageAttachment("mxc://s/pic", 1600, 900,
                        "pic.jpg"),
                },
                new TimelineItem {
                    Id = "doc",
                    Body = "",
                    SenderId = "@me",
                    IsOwn = true,
                    Ts = Now - 700_000,
                    File = new FileAttachment("budget-2026.pdf", 1_450_000,
                        "mxc://s/doc",
                        "application/pdf"),
                },
                new TimelineItem {
                    Id = "voice",
                    Body = "",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 650_000,
                    File = new FileAttachment("voice.ogg", 48_000,
                        "mxc://s/voice", "audio/ogg",
                        FileKind.Audio, TimeSpan.FromSeconds(75)),
                },
                new TimelineItem {
                    Id = "clip",
                    Body = "The demo",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 640_000,
                    File = new FileAttachment("demo.mp4", 9_000_000,
                        "mxc://s/clip", "video/mp4",
                        FileKind.Video, TimeSpan.FromSeconds(3725)),
                },
                new TimelineItem {
                    Id = "d2",
                    Kind = TimelineKind.Date,
                    Ts = Now
                },
                new TimelineItem {
                    Id = "4",
                    Body = "Morning",
                    SenderId = "@bob",
                    SenderName = "Bob",
                    Ts = Now - 600_000,
                },
                new TimelineItem {
                    Id = "5",
                    Body = "Could not send this one",
                    SenderId = "@me",
                    IsOwn = true,
                    Ts = Now,
                    Failed = true,
                },
            ];
        }
    }

    private sealed class NoSessions : ISessionStore {
        public Task<Session?> Load()
        {
            return Task.FromResult<Session?>(null);
        }

        public Task Save(Session session)
        {
            return Task.CompletedTask;
        }

        public Task Clear()
        {
            return Task.CompletedTask;
        }
    }

    private static readonly Devices Sessions = new();

    private static async Task<(Window Window, AppController Controller, Engine
            Engine, MainScreen
            Screen)>
        Open(string theme, double width, bool withStickers = false)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(), null, null,
            engine, engine,
            new Media(), new Profiles(), Sessions, null, Keys, CallNotes,
            Verify, CallLine,
            CallMedia, CallSound, withStickers ? Stickers : null);
        controller.SetPreferences(p => p with {
            Locale = "en",
            Theme = theme
        });
        var screen = new MainScreen(controller);
        var window = new Window {
            Content = screen,
            Width = width,
            Height = 700
        };
        ThemeScope.SetColors(window, Themes.Get(theme)!.Colors);
        window.Show();
        await controller.Login("matrix.org", "me", "pw");
        engine.Push(
            new RoomSummary {
                Id = "!g",
                Name = "Demo team",
                MemberCount = 4,
                LastActivityTs = Now,
                PinnedEventIds = ["$2", "$3"],
            },
            new RoomSummary {
                Id = "!d",
                Name = "Alice",
                IsDirect = true,
                LastActivityTs = Now - 1000
            }
        );
        Dispatcher.UIThread.RunJobs();
        return (window, controller, engine, screen);
    }

    private static void Save(Window window, string name)
    {
        var path = Environment.GetEnvironmentVariable("OHMATRIX_CHAT_SHEET");
        if (string.IsNullOrEmpty(path))
            return;
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        frame.Save(path.Replace(".png", $"-{name}.png"),
            new PngBitmapEncoderOptions());
    }

    // "Bob" is only the name above a message in the history of "!g".
    private static bool ShowsSender(ChatPane pane)
    {
        return pane.Messages.GetVisualDescendants().OfType<TextBlock>()
            .Any(t => t.Text == "Bob" && t.IsEffectivelyVisible);
    }

    private static async Task RoomsArrive()
    {
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
    }

    [AvaloniaFact]
    public async Task A_summary_that_comes_after_the_chat_is_selected_is_used()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        engine.Push(new RoomSummary {
            Id = "!d",
            Name = "Alice",
            IsDirect = true,
            LastActivityTs = Now - 1000
        });
        Dispatcher.UIThread.RunJobs();
        controller.SelectRoom("!g");
        await RoomsArrive();
        var pane = FindPane(screen);
        Assert.False(ShowsSender(pane));

        engine.Push(new RoomSummary {
            Id = "!g",
            Name = "Demo team",
            MemberCount = 4,
            LastActivityTs = Now
        });
        await RoomsArrive();
        window.UpdateLayout();
        Assert.True(ShowsSender(pane));
    }

    [AvaloniaFact]
    public async Task A_room_that_changes_between_direct_and_group_follows()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await RoomsArrive();
        var pane = FindPane(screen);
        Assert.True(ShowsSender(pane));

        engine.Push(new RoomSummary {
            Id = "!g",
            Name = "Demo team",
            IsDirect = true,
            LastActivityTs = Now
        });
        await RoomsArrive();
        window.UpdateLayout();
        Assert.False(ShowsSender(pane));

        engine.Push(new RoomSummary {
            Id = "!g",
            Name = "Demo team",
            MemberCount = 4,
            LastActivityTs = Now
        });
        await RoomsArrive();
        window.UpdateLayout();
        Assert.True(ShowsSender(pane));
    }

    [AvaloniaFact]
    public async Task Opening_a_chat_shows_its_messages_and_dividers()
    {
        var (window, controller, engine, _) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(11, controller.Store.Value.Timeline.Count);
        Assert.True(controller.Store.Value.TimelineReady);
        Assert.Single(engine.Opened);
        Save(window, "light");
    }

    [AvaloniaFact]
    public async Task Dark_rows_that_are_not_selected_have_light_titles()
    {
        var (window, controller, _, _) = await Open("dark", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var colors = ThemeScope.GetColors(window);
        var titles = window.GetVisualDescendants().OfType<RoomRow>()
            .Where(r => !r.Selected)
            .SelectMany(r => r.GetVisualDescendants().OfType<TextBlock>())
            .Where(t => t.FontWeight == FontWeight.SemiBold && t.FontSize == 16)
            .ToList();
        Assert.NotEmpty(titles);
        Assert.All(titles,
            t => Assert.Equal(colors.Text,
                ((SolidColorBrush)t.Foreground!).Color));
        Save(window, "dark-wide");
    }

    [AvaloniaFact]
    public async Task Grey_bubbles_stand_over_a_chat_that_is_opening()
    {
        var (window, controller, _, _) = await Open("dark", 1000);
        // The chat is chosen but its messages have not come: the state says so, and after a moment the bubbles show.
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        controller.Store.Update(s => s with {
            TimelineReady = false
        });
        Dispatcher.UIThread.RunJobs();
        await Task.Delay(400);
        Dispatcher.UIThread.RunJobs();
        var pane = window.GetVisualDescendants().OfType<ChatPane>()
            .First(p => p.IsEffectivelyVisible);
        var all = pane.GetVisualDescendants().OfType<ChatSkeleton>().ToList();
        Assert.True(all.Count == 1,
            $"count {all.Count} room {controller.Store.Value.SelectedRoomId} ready {controller.Store.Value.TimelineReady}");
        Assert.True(all[0].IsEffectivelyVisible,
            "hidden: " +
            string.Join(" < ",
                all[0].GetVisualAncestors().Take(4)
                    .Select(a =>
                        a.GetType().Name + (a.IsVisible ? "" : "(off)"))) +
            " pane " +
            pane.IsEffectivelyVisible);
        Save(window, "skeleton");
        controller.Store.Update(s => s with {
            TimelineReady = true
        });
        Dispatcher.UIThread.RunJobs();
        Assert.Empty(pane.GetVisualDescendants().OfType<ChatSkeleton>()
            .Where(k => k.IsEffectivelyVisible));
    }

    [AvaloniaFact]
    public async Task Dark_theme_and_narrow_window()
    {
        var (window, controller, _, _) = await Open("dark", 420);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Save(window, "dark-narrow");
    }

    [AvaloniaFact]
    public async Task Sending_goes_to_the_chat_and_clears_the_field()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        pane.Input.Text = "  hello world  ";
        pane.Submit();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["hello world"], engine.Opened[0].Sent);
        Assert.Equal("", pane.Input.Text);
        Assert.Equal("hello world", controller.Store.Value.Timeline[^1].Body);
        Save(window, "sent");
    }

    [AvaloniaFact]
    public async Task An_empty_message_is_not_sent()
    {
        var (_, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        pane.Input.Text = "   ";
        pane.Submit();
        Assert.Empty(engine.Opened[0].Sent);
    }

    [AvaloniaFact]
    public async Task Switching_chats_closes_the_old_one()
    {
        var (_, controller, engine, _) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.SelectRoom("!d");
        await Task.Delay(50);
        Assert.True(engine.Opened[0].Disposed);
        Assert.Empty(controller.Store.Value.Timeline);
        controller.SelectRoom(null);
        Assert.True(engine.Opened[1].Disposed);
    }

    [AvaloniaFact]
    public async Task Back_in_a_narrow_window_returns_to_the_list()
    {
        var (window, controller, _, _) = await Open("light", 420);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.SelectRoom(null);
        Assert.Null(controller.Store.Value.SelectedRoomId);
        Save(window, "back");
    }

    [AvaloniaFact]
    public async Task The_settings_page_signs_out_after_asking()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        Assert.Same(screen.Profile, ((Border)screen.Children[0]).Child);
        Save(window, "profile");
        controller.OpenSidebarPage(SidebarPage.Settings);
        Dispatcher.UIThread.RunJobs();
        var page = screen.SettingsScreen;
        Assert.Same(page, ((Border)screen.Children[0]).Child);
        Save(window, "settings");
        page.AskSignOut();
        Assert.True(page.Confirm.IsOpen);
        Save(window, "signout-dialog");
        var yes = page.Confirm.Card.GetVisualDescendants()
            .OfType<PrimaryButton>().First();
        yes.RaiseClick();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(AuthStatus.SignedOut, controller.Store.Value.Auth);
        Assert.Equal(SidebarPage.Chats, controller.Store.Value.SidebarPage);
        Assert.False(page.Confirm.IsOpen);
    }

    [AvaloniaFact]
    public async Task The_plus_menu_joins_a_room_and_opens_it()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        screen.List.OpenAddMenu();
        Assert.True(screen.List.AddMenu.IsOpen);
        Assert.Equal(4, screen.List.AddMenu.Rows.Count);
        Save(window, "plus-menu");
        screen.List.AddMenu.Close();
        var prompt = screen.List.Prompt;
        // Press the third row: Join room.
        var row = (Border)screen.List.AddMenu.Rows[2];
        screen.List.OpenAddMenu();
        row.RaiseEvent(Release(row));
        Assert.True(prompt.Dialog.IsOpen);
        Assert.True(prompt.ConfirmButton.Disabled);
        prompt.Fields[0].Text = "#room:server";
        Assert.False(prompt.ConfirmButton.Disabled);
        Save(window, "join-dialog");
        prompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("!joined", controller.Store.Value.SelectedRoomId);
        Assert.False(prompt.Dialog.IsOpen);
    }

    [AvaloniaFact]
    public async Task
        People_are_searched_and_chosen_for_a_new_chat_and_for_an_invitation()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        screen.List.OpenAddMenu();
        var row = (Border)screen.List.AddMenu.Rows[0];
        row.RaiseEvent(Release(row));
        var picker = screen.List.People;
        Assert.True(picker.Dialog.IsOpen);
        Assert.True(picker.ConfirmButton.Disabled);
        picker.Field.Text = "ann";
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["@ann:s", "@anna:s"], picker.Found);
        picker.Toggle(new PersonInfo("@ann:s", "Ann Lee", null));
        picker.Toggle(new PersonInfo("@anna:s", "Anna K", null));
        Assert.Equal(["@anna:s"], picker.Chosen);
        Save(window, "people-picker");
        picker.ConfirmButton.RaiseClick();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("!made", controller.Store.Value.SelectedRoomId);
        Assert.False(picker.Dialog.IsOpen);

        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        panel.AskInvite(controller.Store.Value.Rooms.First(r => r.Id == "!g"));
        panel.Invite.Field.Text = "@zed:s";
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["@zed:s"], panel.Invite.Found);
        panel.Invite.Toggle(new PersonInfo("@zed:s", "zed", null));
        panel.Invite.Toggle(new PersonInfo("@ann:s", "Ann Lee", null));
        panel.Invite.ConfirmButton.RaiseClick();
        await Task.Delay(50);
        Assert.Contains("invite !g @zed:s,@ann:s", engine.Actions);
    }

    [AvaloniaFact]
    public async Task Explore_lists_public_rooms_and_joins_one()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        screen.List.OpenAddMenu();
        var row = (Border)screen.List.AddMenu.Rows[3];
        row.RaiseEvent(Release(row));
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SidebarPage.Explore, controller.Store.Value.SidebarPage);
        var page = screen.ExploreScreen;
        Assert.Equal(["Public Chat", "Rust Fans"], page.Names);
        Save(window, "explore");
        Assert.IsType<Avalonia.Controls.WrapPanel>(page.Rows.Children[0]);
        page.OpenFull(
            new PublicRoom("!pub1:s", "Public Chat", "Talk\n\nmore", "#pub:s",
                null, 1200), false);
        Assert.True(page.Full.IsOpen);
        Save(window, "explore-full");
        page.Full.Close();
        page.Field.Text = "rust";
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Rust Fans"], page.Names);
        page.Field.Text = "public";
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        page.AskJoin(new PublicRoom("!pub1:s", "Public Chat", "Talk", "#pub:s",
            null, 1200));
        Assert.True(page.JoinCard.Dialog.IsOpen);
        page.JoinCard.JoinButton!.RaiseClick();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SidebarPage.Chats, controller.Store.Value.SidebarPage);
        Assert.Equal("!joined", controller.Store.Value.SelectedRoomId);
    }

    [AvaloniaFact]
    public async Task
        A_room_being_joined_shows_in_the_list_until_the_join_ends()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Explore);
        Dispatcher.UIThread.RunJobs();
        var page = screen.ExploreScreen;
        engine.JoinGate = new TaskCompletionSource<string>();
        page.AskJoin(new PublicRoom("!pub1:s", "Public Chat", "Talk", "#pub:s",
            null, 1200));
        page.JoinCard.JoinButton!.RaiseClick();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SidebarPage.Chats, controller.Store.Value.SidebarPage);
        Assert.Single(controller.Store.Value.Joining);
        var first = (RoomRow)screen.List.Rows.Children[0];
        Assert.Equal("Public Chat", first.Title);
        Assert.StartsWith("Joining", first.Preview);
        Save(window, "joining");
        engine.JoinGate.SetException(
            new EngineException(EngineErrorCode.Forbidden, "No access"));
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Empty(controller.Store.Value.Joining);
        Assert.Equal("No access", controller.Store.Value.JoinError);
        controller.DismissJoinError();
        Assert.Null(controller.Store.Value.JoinError);
        engine.JoinGate = null;
    }

    [AvaloniaFact]
    public async Task Explore_asks_another_server_and_keeps_the_servers_added()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Explore);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var page = screen.ExploreScreen;
        // The homeserver is matrix.org here, so its own directory is the only one before the ones added.
        Assert.Equal(["matrix.org"], page.Servers().Select(x => x.Name));
        Assert.Null(page.Server);
        Assert.Contains("explore  ", engine.Actions);
        page.AskAddServer();
        page.AddPrompt.Fields[0].Text = "not a server!";
        page.AddPrompt.Confirm();
        await Task.Delay(50);
        Assert.Equal("That is not a server name.", page.AddPrompt.ErrorText);
        page.AddPrompt.Fields[0].Text = "https://KDE.org/rooms";
        page.AddPrompt.Confirm();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["kde.org"], controller.Store.Value.Prefs.ExploreServers);
        Assert.Equal("kde.org", page.Server);
        Assert.Contains("explore  kde.org", engine.Actions);
        Save(window, "explore-servers");
    }

    [Fact]
    public void A_server_name_is_cut_down_to_the_host()
    {
        Assert.Equal("kde.org", ServerName.Parse(" https://KDE.org/x?y "));
        Assert.Equal("matrix.org:8448", ServerName.Parse("matrix.org:8448"));
        Assert.Equal("example.com", ServerName.Parse("#room:example.com"));
        Assert.Null(ServerName.Parse("two words"));
        Assert.Null(ServerName.Parse(""));
    }

    [AvaloniaFact]
    public async Task A_group_is_made_with_its_people_and_a_refusal_is_shown()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        var prompt = screen.List.Prompt;
        screen.List.OpenAddMenu();
        var row = (Border)screen.List.AddMenu.Rows[1];
        row.RaiseEvent(Release(row));
        prompt.Fields[0].Text = "bad";
        prompt.Confirm();
        await Task.Delay(50);
        Assert.Equal("Not allowed", prompt.ErrorText);
        Assert.True(prompt.Dialog.IsOpen);
        Save(window, "group-error");
        prompt.Fields[0].Text = "Friends";
        prompt.Fields[1].Text = "@a:s, @b:s";
        prompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Friends|False|@a:s,@b:s"], engine.Created);
        Assert.Equal("!made", controller.Store.Value.SelectedRoomId);
    }

    [AvaloniaFact]
    public async Task The_profile_name_replaces_the_user_id()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Mia Example",
            controller.Store.Value.Profile!.DisplayName);
        Save(window, "named");
        controller.OpenSidebarPage(SidebarPage.Profile);
        Save(window, "profile-named");
    }

    [AvaloniaFact]
    public async Task The_theme_page_lists_every_theme_and_chooses_one()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Theme);
        Dispatcher.UIThread.RunJobs();
        var cards = screen.ThemeScreen.Cards.Children;
        Assert.Equal(Themes.All().Count + 1, cards.Count);
        Save(window, "themes");
        var press = (Control)cards[3];
        var target = Themes.All()[2].Id;
        press.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            press,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), press,
            new Avalonia.Point(10, 10), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None) {
            RoutedEvent = Avalonia.Input.InputElement.PointerPressedEvent,
        });
        Assert.Equal(target, controller.Store.Value.Prefs.Theme);
    }

    [AvaloniaFact]
    public async Task A_reply_quotes_and_is_sent_as_an_answer()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        var target = controller.Store.Value.Timeline.First(i => i.Id == "2");
        pane.OpenActions(pane.Messages, target);
        Assert.Equal(5, pane.Actions.Rows.Count);
        Assert.Equal(ChatPane.QuickReactions.Length, pane.Actions.Emojis.Count);
        Save(window, "actions");
        pane.Actions.Close();
        controller.SetReplyTo(target);
        Dispatcher.UIThread.RunJobs();
        Save(window, "reply");
        pane.Input.Text = "yes";
        pane.Submit();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["$2"], engine.Opened[0].Replies);
        Assert.Null(controller.Store.Value.ReplyTo);
    }

    [AvaloniaFact]
    public async Task Reactions_are_toggled_and_typing_is_shown_in_the_header()
    {
        var (window, controller, engine, _) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        await controller.ToggleReaction("3", "👍");
        Assert.Equal(["3👍"], engine.Opened[0].Reacted);
        engine.Opened[0].Type("alice", "bob", "carol");
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(3, controller.Store.Value.Typing.Count);
        Save(window, "typing");
        engine.Opened[0].Type();
        Dispatcher.UIThread.RunJobs();
        Assert.Empty(controller.Store.Value.Typing);
    }

    [AvaloniaFact]
    public async Task Only_my_messages_can_be_edited_or_deleted()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        var tl = controller.Store.Value.Timeline;
        pane.OpenActions(pane.Messages, tl.First(i => i.Id == "2"));
        Assert.Equal(5, pane.Actions.Rows.Count);
        Assert.Equal(ChatPane.QuickReactions.Length, pane.Actions.Emojis.Count);
        pane.OpenActions(pane.Messages, tl.First(i => i.Id == "3"));
        Assert.Equal(7, pane.Actions.Rows.Count);
        Save(window, "own-actions");
    }

    [AvaloniaFact]
    public async Task Editing_fills_the_field_and_sending_replaces_the_text()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        controller.StartEdit(
            controller.Store.Value.Timeline.First(i => i.Id == "3"));
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Yes!", pane.Input.Text);
        Save(window, "editing");
        pane.Input.Text = "Yes, definitely";
        pane.Submit();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["3:Yes, definitely"], engine.Opened[0].Edits);
        Assert.Empty(engine.Opened[0].Sent);
        Assert.Null(controller.Store.Value.Editing);
    }

    [AvaloniaFact]
    public async Task Deleting_asks_first()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        pane.OpenActions(pane.Messages,
            controller.Store.Value.Timeline.First(i => i.Id == "3"));
        // The Delete row is the last of the menu: Copy, Reply, Edit, Pin, Forward, Select, Delete.
        var row = (Border)pane.Actions.Rows[6];
        row.RaiseEvent(Release(row));
        Assert.True(pane.DeleteDialog.IsOpen);
        Save(window, "delete-dialog");
        var yes = pane.DeleteDialog.Card.GetVisualDescendants()
            .OfType<PrimaryButton>().First();
        yes.RaiseClick();
        await Task.Delay(50);
        Assert.Equal(["3"], engine.Opened[0].Deleted);
        Assert.False(pane.DeleteDialog.IsOpen);
    }

    [AvaloniaFact]
    public async Task An_image_message_shows_its_picture_at_the_fitted_size()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        Assert.True(pane.ScrollToMessage("img"));
        LayoutTimeline(window);
        var picture = pane.Messages.GetVisualDescendants()
            .OfType<Image>().First();
        for (var i = 0; i < 20 && picture.Source is null; i++) {
            await Task.Delay(50);
            Dispatcher.UIThread.RunJobs();
        }

        Assert.NotNull(picture.Source);
        Assert.Equal(300, picture.Width);
        Assert.Equal(169, picture.Height);
        Save(window, "image-loaded");
    }

    [AvaloniaFact]
    public async Task The_language_page_switches_the_interface_language()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Language);
        Dispatcher.UIThread.RunJobs();
        var rows = screen.LanguageScreen.Rows.Children;
        Assert.Equal(OhMatrix.Core.I18n.Strings.Languages.Count, rows.Count);
        Save(window, "languages");
        var zh = OhMatrix.Core.I18n.Strings.Languages.ToList()
            .FindIndex(l => l.Id == "zh-CN");
        var press = (Control)rows[zh];
        press.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            press,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), press,
            new Avalonia.Point(10, 10), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None) {
            RoutedEvent = Avalonia.Input.InputElement.PointerPressedEvent,
        });
        Assert.Equal("zh-CN", controller.Store.Value.Locale);
        Save(window, "languages-zh");
    }

    [AvaloniaFact]
    public async Task Zoom_is_set_from_the_settings_page_with_the_keep_dialog()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Settings);
        Dispatcher.UIThread.RunJobs();
        var page = screen.SettingsScreen;
        page.Zoom.Open(page.ZoomRow);
        Assert.True(page.Zoom.Menu.IsOpen);
        Save(window, "zoom-menu");
        page.Zoom.Menu.Close();
        controller.TryZoom(1.5);
        Assert.True(page.Zoom.Dialog.IsOpen);
        Save(window, "zoom-trial");
        controller.KeepZoom();
        Assert.False(page.Zoom.Dialog.IsOpen);
        Assert.Equal(1.5, controller.Store.Value.Prefs.UiScale);
        Save(window, "zoom-kept");
    }

    [AvaloniaFact]
    public async Task
        The_settings_rows_change_the_room_through_menus_and_prompts()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        var texts = screen.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        Assert.Contains("Who can join", texts);
        Assert.Contains("Permissions", texts);
        Assert.Contains("Who can send messages", texts);
        Assert.Contains("Add address", texts);
        await controller.SetJoinRule("!g", JoinRule.Public);
        await controller.AddRoomAlias("!g", "#new:s");
        Assert.Contains("joinRule !g Public", engine.Actions);
        Assert.Contains("addAlias !g #new:s", engine.Actions);
        panel.AskAddAlias(
            controller.Store.Value.Rooms.First(r => r.Id == "!g"));
        Assert.Single(panel.MemberPrompt.Fields);
        Save(window, "settings");
    }

    [AvaloniaFact]
    public async Task A_share_is_offered_to_chats_ticked_and_confirmed()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        var page = new SharePage(controller);
        var host = new Window {
            Content = page,
            Width = 600,
            Height = 600
        };
        ThemeScope.SetColors(host,
            OhMatrix.Core.Theming.Themes.Get("light")!.Colors);
        host.Show();
        Assert.False(page.IsVisible);
        controller.SetIncomingShare(new SharedContent("hello there",
            ["/tmp/a.txt"]));
        Dispatcher.UIThread.RunJobs();
        Assert.True(page.IsVisible);
        var room = page.Postable[0];
        page.Toggle(room.Id);
        Assert.Contains(room.Id, page.Picked);
        page.Confirm();
        Assert.True(page.Confirmation.IsOpen);
        Assert.Contains(room.Id, page.Kept);
        Save(window, "share");
        page.Cancel();
        Assert.Null(controller.Store.Value.Share);
        Assert.Empty(page.Picked);
    }

    [Fact]
    public void A_share_is_described_by_its_files_and_text()
    {
        string T(string k, (string, object)[] v) =>
            OhMatrix.Core.I18n.Strings.T("en", k, v);

        Assert.Equal("2 files · hi",
            new SharedContent("hi", ["a", "b"]).Describe(T));
        Assert.Equal("Text", new SharedContent(null, []).Describe(T));
    }

    [AvaloniaFact]
    public async Task The_image_viewer_offers_save_only_when_asked()
    {
        var (window, controller, _, _) = await Open("light", 1000);
        var viewer = new ImageViewer();
        var saved = 0;
        viewer.Show(window, controller.Pictures, "mxc://x", "a.png", null,
            () => {
                saved++;
                return Task.CompletedTask;
            });
        Assert.True(viewer.SaveButton.IsVisible);
        viewer.SaveButton.RaiseClick();
        Assert.Equal(1, saved);
        viewer.Close();
        viewer.Show(window, controller.Pictures, "mxc://x", "a.png", null);
        Assert.False(viewer.SaveButton.IsVisible);
        viewer.Close();
    }

    [AvaloniaFact]
    public async Task
        The_recording_dialog_opens_and_says_so_when_there_is_no_device()
    {
        var (window, controller, _, _) = await Open("light", 1000);
        var dialog = new RecordingDialog(controller);
        dialog.Open(window, false);
        Assert.True(dialog.Dialog.IsOpen);
        dialog.Discard();
        dialog.Dialog.Close();
        Assert.False(dialog.Recording);
    }

    [AvaloniaFact]
    public async Task The_font_page_lists_fonts_and_choosing_one_is_kept()
    {
        var (_, controller, _, _) = await Open("light", 1000);
        var page = new FontPage(controller);
        var host = new Window {
            Content = page,
            Width = 400,
            Height = 600
        };
        ThemeScope.SetColors(host,
            OhMatrix.Core.Theming.Themes.Get("light")!.Colors);
        host.Show();
        Assert.True(page.Rows.Children.Count >= 2);
        controller.SetPreferences(p => p with {
            Font = "Serif"
        });
        Assert.Equal("Serif", controller.Store.Value.Prefs.Font);
        controller.SetPreferences(p => p with {
            Font = null
        });
        Assert.Null(controller.Store.Value.Prefs.Font);
    }

    [AvaloniaFact]
    public async Task The_pinned_list_opens_from_the_bar()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        pane.OpenPinnedList();
        Assert.True(pane.PinnedDialog.IsOpen);
        pane.PinnedDialog.Close();
    }

    [AvaloniaFact]
    public async Task Dropped_files_are_listed_before_they_are_sent()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        var file = Path.Combine(Path.GetTempPath(),
            "drop-" + Guid.NewGuid().ToString("N") + ".pdf");
        File.WriteAllText(file, "x");
        pane.OfferFiles([file]);
        Assert.True(pane.SendFiles.Dialog.IsOpen);
        Assert.NotNull(pane.SendFiles.SendButton);
        pane.SendFiles.Dialog.Close();
        Assert.Equal("send.files.file", SendFilesDialog.KindOf(file));
        Assert.Equal("photo", SendFilesDialog.KindOf("a.png"));
        File.Delete(file);
    }

    [Fact]
    public void An_at_sign_offers_people_and_the_ones_picked_are_mentioned()
    {
        Assert.Null(Mentions.TokenAt("mail me a@b", 11));
        Assert.Equal((4, "al"), Mentions.TokenAt("hi, @al", 7));
        Assert.Null(Mentions.TokenAt("hi @al lee", 10));
        RoomMemberInfo[] people = [
            new("@alice:s", "Alice", null, MemberRole.Member),
            new("@bob:s", "Bob", null, MemberRole.Member),
            new("@malik:s", "Malik", null, MemberRole.Member),
        ];
        Assert.Equal(["Alice", "Malik"],
            Mentions.Suggest(people, "al").Select(p => p.Name));
        var m = new Mentions();
        var (text, caret) = m.Apply(people[0], "hi @al", 6);
        Assert.Equal("hi @Alice ", text);
        Assert.Equal(10, caret);
        Assert.Equal(["@alice:s"], m.Resolve(text + "there", people));
        Assert.Empty(m.Resolve("hi Alice", people));
    }

    [AvaloniaFact]
    public async Task
        Typing_is_told_and_the_scroll_button_shows_up_in_the_history()
    {
        var (_, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        pane.Input.Text = "hello";
        Assert.Equal([true], engine.Opened[0].Typed);
        pane.Input.Text = "";
        Assert.Equal([true, false], engine.Opened[0].Typed);
        Assert.False(pane.ScrollToLatest.IsVisible);
    }

    [AvaloniaFact]
    public async Task A_message_that_is_not_there_is_said_not_to_be_found()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        await pane.Reveal("$nothing");
        Assert.Equal("That message could not be found",
            controller.Store.Value.Notice?.Message);
        var known = controller.Store.Value.Timeline
            .First(i => i.EventId is not null);
        await pane.Reveal(known.EventId!);
        Assert.Null(controller.Store.Value.Notice);
    }

    [AvaloniaFact]
    public async Task A_chat_that_is_gone_says_so_and_goes_back_to_the_list()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        var pane = FindPane(screen);
        Assert.False(pane.NotFound.IsVisible);
        controller.SelectRoom("!gone");
        Dispatcher.UIThread.RunJobs();
        // Not before the list is known: until then a room may still turn up.
        Assert.False(pane.NotFound.IsVisible);
        await Task.Delay(1200);
        Dispatcher.UIThread.RunJobs();
        Assert.True(controller.Store.Value.RoomsSettled);
        Assert.True(pane.NotFound.IsVisible);
        controller.SelectRoom(null);
        Dispatcher.UIThread.RunJobs();
        Assert.False(pane.NotFound.IsVisible);
        Assert.False(pane.DropHint.IsVisible);
    }

    [AvaloniaFact]
    public async Task People_chosen_to_invite_show_as_chips_that_remove_them()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        var picker = new PeoplePicker(controller);
        picker.Show(window, ThemeScope.GetColors(window), "Invite", "", true,
            n => n.ToString(), _ => Task.CompletedTask);
        Assert.False(picker.Chips.IsVisible);
        picker.Toggle(new PersonInfo("@ann:s", "Ann Lee", null));
        picker.Toggle(new PersonInfo("@bob:s", "Bob", null));
        Assert.Equal(2, picker.Chips.Children.Count);
        Assert.True(picker.Chips.IsVisible);
        picker.Toggle(new PersonInfo("@ann:s", "Ann Lee", null));
        Assert.Equal(["@bob:s"], picker.Chosen);
        Assert.Single(picker.Chips.Children);
    }

    [AvaloniaFact]
    public async Task A_key_in_the_message_box_does_not_rebuild_the_pane()
    {
        var (_, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var pane = FindPane(screen);
        var header = pane.Header.Child;
        var idle = pane.SendBackground;
        pane.Input.Text = "h";
        var ready = pane.SendBackground;
        // The send button takes the accent with the first character...
        Assert.NotSame(idle, ready);
        pane.Input.Text = "he";
        pane.Input.Text = "hel";
        // ...and nothing is made again while it stays so; the header is the
        // one the state made, not a new one for every key.
        Assert.Same(ready, pane.SendBackground);
        Assert.Same(header, pane.Header.Child);
        Assert.Equal([true], engine.Opened[0].Typed);
        pane.Input.Text = "";
        Assert.NotSame(ready, pane.SendBackground);
    }

    [AvaloniaFact]
    public async Task The_gallery_page_shows_the_media_of_a_kind_and_goes_back()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        panel.OpenGallery();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var gallery = Assert.IsType<SharedMediaView>(panel.Gallery);
        Assert.Equal(MediaKind.Image, gallery.Kind);
        Assert.Single(gallery.Shown);
        gallery.Select(MediaKind.File);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("budget-2026.pdf",
            Assert.Single(gallery.Shown).File!.Name);
        Save(window, "gallery");
        panel.LeaveGallery();
        Assert.Null(panel.Gallery);
    }

    [AvaloniaFact]
    public async Task The_info_panel_lists_topic_and_members()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(3, controller.Store.Value.Details!.Members.Count);
        var texts = screen.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        Assert.Contains("We plan the demo here.", texts);
        Assert.Contains("Admin", texts);
        Assert.Contains("Moderator", texts);
        Save(window, "info-wide");
        var panelShared = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        Assert.Single(panelShared.MediaThumbnails);
        Assert.Contains("budget-2026.pdf", texts);
        Assert.Contains("Shared media", texts);
        controller.OpenRoomInfo(false);
        Dispatcher.UIThread.RunJobs();
        Save(window, "info-closed");
    }

    [AvaloniaFact]
    public async Task The_info_panel_renames_changes_the_topic_and_leaves()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        Assert.NotNull(panel.EditNameButton);
        var room = controller.Store.Value.Rooms.First(r => r.Id == "!g");
        panel.AskName(room);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Demo team", panel.EditPrompt.Fields[0].Text);
        panel.EditPrompt.Fields[0].Text = " Demo crew ";
        panel.EditPrompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        panel.AskTopic(room, "We plan the demo here.");
        panel.EditPrompt.Fields[0].Text = "New topic";
        panel.EditPrompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Save(window, "info-manage");
        panel.AskLeave(room);
        Dispatcher.UIThread.RunJobs();
        Assert.True(panel.LeaveDialog.IsOpen);
        var yes = panel.LeaveDialog.Card.GetVisualDescendants()
            .OfType<PrimaryButton>().Single();
        yes.RaiseClick();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(
            ["name !g Demo crew", "topic !g New topic", "leave !g"],
            engine.Actions.Where(a => a.StartsWith("name") ||
                                      a.StartsWith("topic")
                                      || a.StartsWith("leave")));
        Assert.Null(controller.Store.Value.SelectedRoomId);
    }

    [AvaloniaFact]
    public async Task A_member_has_a_page_to_write_to_or_block()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        var bob =
            controller.Store.Value.Details!.Members.First(m => m.Name == "Bob");
        panel.ViewMember(bob);
        Assert.Equal(bob, panel.Viewing);
        // Copy link, copy address, write, block.
        Assert.Equal(5, panel.Content.Children.Count - 1);
        Save(window, "member-page");
        panel.AskBlockForTest(bob);
        panel.LeaveMember();
        Assert.Null(panel.Viewing);
    }

    [AvaloniaFact]
    public async Task
        Members_get_a_role_are_removed_or_banned_from_the_info_panel()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
            .First();
        var room = controller.Store.Value.Rooms.First(r => r.Id == "!g");
        var bob =
            controller.Store.Value.Details!.Members.First(m => m.Name == "Bob");
        var anchor = panel.Content.Children.OfType<Border>()
            .First(b => b.Cursor is not null);
        panel.OpenMemberMenu(anchor, room, bob);
        Assert.True(panel.MemberMenu.IsOpen);
        Assert.Equal(6, panel.MemberMenu.Rows.Count);
        Save(window, "member-menu");
        panel.MemberMenu.Close();
        panel.AskRole(room, bob, MemberRole.Moderator);
        panel.MemberPrompt.Confirm();
        await Task.Delay(50);
        panel.AskRemove(room, bob);
        panel.MemberPrompt.Confirm();
        await Task.Delay(50);
        panel.AskBan(room, bob);
        panel.MemberPrompt.Fields[0].Text = "spam";
        panel.MemberPrompt.Confirm();
        await Task.Delay(50);
        Assert.Equal(
            [
                "role !g @bob:s Moderator", "remove !g @bob:s",
                "ban !g @bob:s spam"
            ],
            engine.Actions.Where(a => a.StartsWith("role") ||
                                      a.StartsWith("remove")
                                      || a.StartsWith("ban")));
    }

    [AvaloniaFact]
    public async Task The_info_panel_covers_the_chat_in_a_narrow_window()
    {
        var (window, controller, _, _) = await Open("dark", 420);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Save(window, "info-narrow");
    }

    [AvaloniaFact]
    public async Task
        A_picture_from_disk_is_sent_with_its_size_and_a_file_without()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var dir = Path.Combine(Path.GetTempPath(),
            "ohm-att-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var png = Path.Combine(dir, "pic.png");
        using (var target =
               new Avalonia.Media.Imaging.RenderTargetBitmap(
                   new Avalonia.PixelSize(40, 20)))
        using (var stream = File.Create(png))
            target.Save(stream);
        var doc = Path.Combine(dir, "notes.pdf");
        File.WriteAllText(doc, "x");
        await controller.SendAttachment(png);
        await controller.SendAttachment(doc);
        Assert.Equal(["pic.png image/png 40x20", "notes.pdf application/pdf x"],
            engine.Opened[0].Attached);
        var pane = FindPane(screen);
        pane.OpenAttach();
        Assert.Equal(
            2 + (RecordingDialog.Available(false) ? 1 : 0) +
            (RecordingDialog.Available(true) ? 1 : 0),
            pane.AttachMenu.Rows.Count);
        Save(window, "attach");
    }

    [AvaloniaFact]
    public async Task
        The_emoji_button_opens_a_picker_that_fills_the_draft_and_remembers()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        pane.EmojiButton.RaiseClick();
        Dispatcher.UIThread.RunJobs();
        Assert.True(pane.Emoji.IsOpen);
        // Nothing used yet: no recent tab, and the first group is open.
        Assert.DoesNotContain("recent", pane.Emoji.TabIds);
        Assert.Equal(EmojiData.Groups[0].Emojis.Length, pane.Emoji.Tiles.Count);
        Save(window, "emoji");
        pane.Emoji.Search.Text = "🎉";
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["🎉"], pane.Emoji.Shown);
        pane.Input.Text = "hi ";
        pane.Input.CaretIndex = 3;
        pane.InsertEmoji("🎉");
        Assert.Equal("hi 🎉", pane.Input.Text);
        Assert.Equal(["🎉"], controller.Store.Value.Prefs.RecentEmoji);
        pane.InsertEmoji("😀");
        pane.InsertEmoji("🎉");
        Assert.Equal(["🎉", "😀"], controller.Store.Value.Prefs.RecentEmoji);
        // Opened again, the recent ones come first.
        pane.Emoji.Close();
        pane.EmojiButton.RaiseClick();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("recent", pane.Emoji.TabIds[0]);
        Assert.Equal(["🎉", "😀"], pane.Emoji.Shown);
        Save(window, "emoji-recent");
    }

    private static string Png(string name, int w, int h)
    {
        var dir = Path.Combine(Path.GetTempPath(), "ohmatrix-sticker-tests");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, name);
        using var target =
            new Avalonia.Media.Imaging.RenderTargetBitmap(
                new Avalonia.PixelSize(w, h));
        using var stream = File.Create(path);
        target.Save(stream);
        return path;
    }

    private static void Reset()
    {
        Stickers.Pack = [
            new("cat", "mxc://s/cat", "image/png", 64, 64, 900),
            new("dog", "mxc://s/dog", "image/png", 64, 64, 900),
            new("owl", "mxc://s/owl", "image/png", 64, 64, 900),
        ];
        Stickers.Groups = [];
        Stickers.Calls.Clear();
    }

    private static async Task Settle()
    {
        await Task.Delay(80);
        Dispatcher.UIThread.RunJobs();
    }

    [AvaloniaFact]
    public async Task The_sticker_pane_shows_the_pack_and_a_press_sends_one()
    {
        Reset();
        var (window, controller, _, screen) = await Open("light", 1000, true);
        controller.SelectRoom("!g");
        await Settle();
        var pane = FindPane(screen);
        pane.EmojiButton.RaiseClick();
        await Settle();
        Assert.True(pane.Emoji.IsOpen);
        var stickers = pane.Stickers!;
        // The add tile and the three stickers; the default group is the only tab, with the new-group tab after it.
        Assert.Equal(4, stickers.Tiles.Count);
        Assert.Equal(2, stickers.Tabs!.Children.Count);
        Save(window, "stickers");
        // A press on a sticker sends it and shuts the picker.
        ((Avalonia.Controls.Border)stickers.Tiles[2]).RaiseEvent(
            new Avalonia.Input.PointerPressedEventArgs(
                stickers.Tiles[2],
                new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                    true),
                (Avalonia.Visual)stickers.Tiles[2], default, 0,
                new Avalonia.Input.PointerPointProperties(
                    Avalonia.Input.RawInputModifiers.LeftMouseButton,
                    Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
                Avalonia.Input.KeyModifiers.None) {
                RoutedEvent = Avalonia.Input.InputElement.PointerPressedEvent
            });
        await Settle();
        Assert.Equal(["send !g dog"], Stickers.Calls);
        Assert.False(pane.Emoji.IsOpen);
    }

    [AvaloniaFact]
    public async Task Stickers_are_added_chosen_and_removed()
    {
        Reset();
        var (window, controller, _, screen) = await Open("dark", 1000, true);
        controller.SelectRoom("!g");
        await Settle();
        var pane = FindPane(screen);
        pane.EmojiButton.RaiseClick();
        await Settle();
        var stickers = pane.Stickers!;
        await stickers.Add([Png("fox.png", 40, 30), Png("fox2.txt", 10, 10)]);
        await Settle();
        // The picture was added; the other is not a picture the pack takes.
        Assert.Equal(["add fox", "groups 1"], Stickers.Calls);
        Assert.Equal(4, controller.Store.Value.Stickers.Count);
        Assert.Contains("fox",
            controller.Store.Value.StickerGroups.SelectMany(g => g.Stickers));
        Assert.Equal(NoticeKind.Error, controller.Store.Value.Notice!.Kind);
        Save(window, "stickers-added");
        // Choosing and deleting.
        stickers.SetMode(StickerPane.PaneMode.Choose);
        stickers.Choose("cat");
        stickers.Choose("owl");
        stickers.Choose("owl");
        Assert.Equal(["cat"], stickers.Chosen);
        Save(window, "stickers-choose");
        await stickers.RemoveChosen();
        await Settle();
        Assert.Equal(["dog", "fox", "owl"],
            controller.Store.Value.Stickers.Select(s => s.Shortcode).Order());
        Assert.Equal(StickerPane.PaneMode.Browse, stickers.Mode);
    }

    [AvaloniaFact]
    public async Task Groups_are_made_named_reordered_and_deleted()
    {
        Reset();
        var (window, controller, _, screen) = await Open("light", 1000, true);
        controller.SelectRoom("!g");
        await Settle();
        var pane = FindPane(screen);
        pane.EmojiButton.RaiseClick();
        await Settle();
        var stickers = pane.Stickers!;
        Assert.Equal(["Select to delete", "Reorder", "Set group name"],
            stickers.SettingsLabels);
        await controller.SetStickerGroups([new("g1", "Pets", null, ["owl"])]);
        await Settle();
        stickers.Show("g1");
        await Settle();
        Assert.Equal("g1", stickers.CurrentId);
        Assert.Equal("g1", controller.Store.Value.Prefs.StickerGroup);
        Assert.Equal(
            [
                "Select to delete", "Set group name", "Set group cover",
                "Delete group"
            ],
            stickers.SettingsLabels);
        Assert.Equal(2, stickers.Tiles.Count);
        Save(window, "stickers-group");
        await stickers.Move(0, 0);
        // Reordering in the default group.
        stickers.Show("default");
        await stickers.Move(0, 1);
        await Settle();
        var order = StickerPack.WithDefault(
            controller.Store.Value.StickerGroups,
            controller.Store.Value.Stickers)[0].Stickers;
        Assert.Equal(["dog", "cat"], order);
        // Deleting the group takes its stickers with it.
        stickers.Show("g1");
        await stickers.DeleteGroup();
        await Settle();
        Assert.DoesNotContain(controller.Store.Value.Stickers,
            s => s.Shortcode == "owl");
        Assert.DoesNotContain(controller.Store.Value.StickerGroups,
            g => g.Id == "g1");
        Assert.Equal("default", stickers.CurrentId);
    }

    [AvaloniaFact]
    public async Task Messages_are_chosen_and_forwarded_in_two_steps()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Settle();
        var pane = FindPane(screen);
        var items = controller.Store.Value.Timeline;
        var first = items.First(i =>
            i.Kind == TimelineKind.Message && i.Image is null &&
            i.File is null);
        pane.StartSelect(first);
        Assert.True(pane.Selecting);
        Assert.Equal(["" + first.Id], pane.Chosen);
        Save(window, "selecting");
        var second = items.Last(i =>
            i.Kind == TimelineKind.Message && i.Image is null &&
            i.File is null);
        pane.ToggleChosen(second.Id);
        Assert.Equal(2, pane.Chosen.Count);
        // Forward: the first step ticks chats, the second asks again.
        var forwarding = pane.Forwarding;
        forwarding.Show(window, [first, second]);
        Assert.True(forwarding.IsOpen);
        Assert.Equal(2, forwarding.Rows.Count);
        forwarding.Toggle("!d");
        forwarding.Toggle("!g");
        forwarding.Toggle("!g");
        Assert.Equal(["!d"], forwarding.Picked);
        forwarding.Confirm();
        Assert.True(forwarding.Confirming);
        Assert.Single(forwarding.Rows);
        Save(window, "forward-confirm");
        await forwarding.Send();
        await Settle();
        Assert.Equal(2, engine.Forwarded.Count);
        Assert.StartsWith("!d m.text", engine.Forwarded[0]);
        Assert.False(forwarding.IsOpen);
        pane.CancelSelect();
        Assert.False(pane.Selecting);
        Assert.Empty(pane.Chosen);
    }

    [AvaloniaFact]
    public async Task A_message_that_failed_can_be_sent_again_or_dropped()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Settle();
        var pane = FindPane(screen);
        var failed = controller.Store.Value.Timeline.First(i => i.Failed);
        pane.OpenActions(pane.Messages, failed);
        Assert.Empty(pane.Actions.Emojis);
        Assert.Equal(2, pane.Actions.Rows.Count);
        Save(window, "failed-menu");
        var send = (Border)pane.Actions.Rows[0];
        send.RaiseEvent(Release(send));
        pane.OpenActions(pane.Messages, failed);
        var drop = (Border)pane.Actions.Rows[1];
        drop.RaiseEvent(Release(drop));
        await Settle();
        Assert.Equal([$"resend {failed.Id}", $"discard {failed.Id}"],
            engine.Opened[0].Retried);
    }

    [Xunit.Theory]
    [Xunit.InlineData(0L, "")]
    [Xunit.InlineData(512L, "512 B")]
    [Xunit.InlineData(1_450_000L, "1.4 MB")]
    [Xunit.InlineData(52_000L, "51 KB")]
    public void Sizes_are_read_by_people(long n, string expected)
    {
        Assert.Equal(expected, Format.Bytes(n));
    }

    [AvaloniaFact]
    public async Task
        Pressing_a_picture_opens_the_viewer_that_zooms_and_closes()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        Assert.True(pane.ScrollToMessage("img"));
        LayoutTimeline(window);
        var picture = pane.Messages.GetVisualDescendants().OfType<Image>()
            .First();
        for (var i = 0; i < 20 && picture.Source is null; i++) {
            await Task.Delay(50);
            Dispatcher.UIThread.RunJobs();
        }

        picture.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            picture,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), picture,
            new Avalonia.Point(10, 10), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None) {
            RoutedEvent = Avalonia.Input.InputElement.PointerPressedEvent,
        });
        Assert.True(pane.Viewer.IsOpen);
        window.UpdateLayout();
        Save(window, "viewer");
        var centre = new Avalonia.Point(window.ClientSize.Width / 2,
            window.ClientSize.Height / 2);
        pane.Viewer.ZoomBy(2, centre);
        pane.Viewer.ZoomBy(2, centre);
        Assert.Equal(4, pane.Viewer.Zoom, 3);
        Save(window, "viewer-zoomed");
        pane.Viewer.ZoomBy(100, centre);
        Assert.Equal(ImageViewer.MaxZoom, pane.Viewer.Zoom);
        pane.Viewer.ZoomBy(0.001, centre);
        Assert.Equal(1, pane.Viewer.Zoom);
        window.KeyPress(Avalonia.Input.Key.Escape,
            Avalonia.Input.RawInputModifiers.None,
            Avalonia.Input.PhysicalKey.Escape, null);
        Assert.False(pane.Viewer.IsOpen);
    }

    [AvaloniaFact]
    public async Task Search_finds_loaded_messages_and_steps_through_them()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        pane.ToggleSearch();
        Assert.True(pane.Searching);
        pane.SearchInput.Text = "d";
        Assert.Empty(pane.Matches);
        pane.SearchInput.Text = "Ye";
        Assert.Equal(["3"], pane.Matches);
        pane.SearchInput.Text = "ing";
        // "Morning" and "Look at this" has none; "bring" is in the long message.
        Assert.Equal(["2", "4"], pane.Matches);
        Assert.Equal(1, pane.CurrentMatch);
        Save(window, "search");
        pane.SearchInput.Text = "zzzz";
        Assert.Empty(pane.Matches);
        Save(window, "search-none");
        pane.ToggleSearch();
        Assert.False(pane.Searching);
        Assert.Empty(pane.Matches);
    }

    [AvaloniaFact]
    public async Task The_pinned_bar_shows_the_newest_pin_and_goes_round()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        Assert.True(pane.PinnedBar.IsVisible);

        string Text()
        {
            return string.Join("|",
                pane.PinnedBar.GetVisualDescendants().OfType<TextBlock>()
                    .Select(t => t.Text));
        }

        Assert.Contains("Pinned messages 1/2", Text());
        Assert.Contains("Yes!", Text());
        Save(window, "pinned");
        pane.JumpToPinned();
        Assert.Contains("Pinned messages 2/2", Text());
        Assert.Contains("Are we still on for the demo", Text());
        pane.JumpToPinned();
        Assert.Contains("Pinned messages 1/2", Text());
        var target = controller.Store.Value.Timeline.First(i => i.Id == "4");
        Assert.Null(target.EventId);
        await controller.SetMessagePinned("3", false);
        Assert.Equal(["3 False"], engine.Opened[0].Pins);
    }

    [AvaloniaFact]
    public async Task A_message_somebody_read_shows_two_checks()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.True(FindPane(screen).ScrollToMessage("3"));
        LayoutTimeline(window);
        var glyphs = screen.GetVisualDescendants().OfType<Icon>()
            .Select(i => i.Glyph).ToList();
        Assert.Single(glyphs, "checks");
        Assert.Contains("check", glyphs);
        Save(window, "read");
    }

    [AvaloniaFact]
    public async Task A_picture_file_becomes_my_photo_and_the_photo_of_a_group()
    {
        var (_, controller, engine, screen) = await Open("light", 1000);
        var path = Path.Combine(Path.GetTempPath(),
            "ohm-photo-" + Guid.NewGuid().ToString("N") + ".png");
        await File.WriteAllBytesAsync(path, [1, 2, 3, 4]);
        try {
            controller.OpenSidebarPage(SidebarPage.Profile);
            Dispatcher.UIThread.RunJobs();
            var page = screen.GetVisualDescendants().OfType<ProfilePage>()
                .Single();
            await page.ChangePhoto(path);
            controller.SelectRoom("!g");
            await Task.Delay(50);
            controller.OpenRoomInfo(true);
            await Task.Delay(100);
            Dispatcher.UIThread.RunJobs();
            var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>()
                .First();
            Assert.NotNull(panel.PhotoButton);
            await panel.ChangePhoto(
                controller.Store.Value.Rooms.First(r => r.Id == "!g"), path);
            Assert.Contains("avatar !g image/png 4", engine.Actions);
        } finally {
            File.Delete(path);
        }
    }

    [AvaloniaFact]
    public async Task
        Audio_and_video_messages_show_their_length_and_files_are_fetched()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.True(FindPane(screen).ScrollToMessage("voice"));
        LayoutTimeline(window);
        var texts = screen.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        // An audio message plays in its own card: the name, a bar and its length.
        Assert.Contains("1:15", texts);
        Assert.Single(screen.GetVisualDescendants().OfType<AudioCard>());
        Assert.Contains(texts, t => t is not null && t.EndsWith("· 1:02:05"));
        var icons = screen.GetVisualDescendants().OfType<Icon>()
            .Select(i => i.Glyph).ToList();
        Assert.Contains("play", icons);
        Assert.Contains("video", icons);
        Save(window, "audio-video");
        var path = await controller.DownloadFile(
            new FileAttachment("a.pdf", 1, "mxc://s/a", "application/pdf"));
        Assert.Equal("/tmp/a.pdf", path);
        Assert.Null(
            await controller.DownloadFile(new FileAttachment("b.pdf", 1)));
    }

    [AvaloniaFact]
    public async Task
        The_settings_toggle_puts_my_messages_in_the_accent_colour_or_not()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Settings);
        Dispatcher.UIThread.RunJobs();
        var toggle = screen.SettingsScreen.AccentToggle;
        Assert.True(toggle.IsOn);
        toggle.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            toggle,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), toggle,
            new Avalonia.Point(5, 5), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None));
        Dispatcher.UIThread.RunJobs();
        Assert.False(controller.Store.Value.Prefs.OwnBubbleAccent);
        Assert.False(screen.SettingsScreen.AccentToggle.IsOn);
    }

    private sealed class Notes : INotifier {
        public readonly List<Notification> Sent = [];

        public void Notify(Notification notification) => Sent.Add(notification);
    }

    [AvaloniaFact]
    public async Task
        New_unread_messages_are_announced_except_at_start_up_when_muted_or_off()
    {
        var engine = new Engine();
        var notes = new Notes();
        var controller = new AppController(engine, new NoSessions(), null, null,
            engine, engine,
            new Media(), new Profiles(), Sessions, null, Keys, notes);
        controller.SetPreferences(p => p with {
            Locale = "en",
            Notifications = true
        });
        await controller.Login("matrix.org", "me", "pw");

        RoomSummary Room(string id, int unread, string text,
            bool muted = false) => new() {
            Id = id,
            Name = "Room " + id,
            UnreadCount = unread,
            LastMessage = text,
            LastSender = "Ann",
            LastActivityTs = Now,
            Muted = muted,
        };

        engine.Push(Room("!a", 1, "first"), Room("!b", 0, "x"),
            Room("!m", 0, "x", true));
        Dispatcher.UIThread.RunJobs();
        Assert.Empty(notes.Sent);
        engine.Push(Room("!a", 2, "hello   there"), Room("!b", 0, "x"),
            Room("!m", 3, "loud", true),
            Room("!new", 4, "unknown before"));
        Dispatcher.UIThread.RunJobs();
        var one = Assert.Single(notes.Sent);
        Assert.Equal(("!a", "Room !a", "Ann: hello there"),
            (one.RoomId, one.Title, one.Body));
        controller.SetPreferences(p => p with {
            NotificationPreview = false
        });
        engine.Push(Room("!a", 3, "secret"), Room("!b", 0, "x"),
            Room("!m", 3, "loud", true),
            Room("!new", 4, "unknown before"));
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("New message", notes.Sent[1].Body);
        controller.SetPreferences(p => p with {
            Notifications = false
        });
        engine.Push(Room("!a", 4, "more"), Room("!b", 0, "x"),
            Room("!m", 3, "loud", true),
            Room("!new", 4, "unknown before"));
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(2, notes.Sent.Count);
    }

    [AvaloniaFact]
    public async Task A_space_lists_its_rooms_and_joins_one_that_is_not_joined()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.OpenSpace("!g");
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SidebarPage.Space, controller.Store.Value.SidebarPage);
        var page = screen.SpaceScreen;
        Assert.Equal(["Alice", "Not joined room", "Sub space"],
            page.Children_.Select(c => c.Name));
        var texts = screen.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        Assert.Contains("Not joined yet", texts);
        Assert.Contains("Demo team", texts);
        Save(window, "space");
        page.AskJoin(page.Children_[1]);
        Assert.True(page.Card.Dialog.IsOpen);
        page.Card.JoinButton!.RaiseClick();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("!joined", controller.Store.Value.SelectedRoomId);
        Assert.Equal(SidebarPage.Chats, controller.Store.Value.SidebarPage);
    }

    [AvaloniaFact]
    public async Task
        The_encryption_page_unlocks_the_history_with_the_recovery_key()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        Keys.Current = SecurityState.NeedsRecovery;
        await controller.RefreshSecurity();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SecurityState.NeedsRecovery,
            controller.Store.Value.Security);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        Assert.Contains("Verify device",
            screen.GetVisualDescendants().OfType<TextBlock>()
                .Select(t => t.Text));
        controller.OpenSidebarPage(SidebarPage.Encryption);
        Dispatcher.UIThread.RunJobs();
        var page = screen.EncryptionScreen;
        Assert.NotNull(page.RecoveryRow);
        Save(window, "encryption");
        page.AskRecoveryKey();
        page.RecoveryPrompt.Fields[0].Text = "wrong";
        page.RecoveryPrompt.Confirm();
        await Task.Delay(50);
        Assert.Equal("Wrong recovery key", page.RecoveryPrompt.ErrorText);
        page.RecoveryPrompt.Fields[0].Text = "EsTc good key";
        page.RecoveryPrompt.Confirm();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SecurityState.Ready, controller.Store.Value.Security);
        Assert.Null(page.RecoveryRow);
        Keys.Current = SecurityState.NeedsRecovery;
    }

    [AvaloniaFact]
    public async Task
        The_encryption_page_sets_the_keys_up_and_shows_the_recovery_key_once()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        Keys.Current = SecurityState.NeedsSetup;
        await controller.RefreshSecurity();
        controller.OpenSidebarPage(SidebarPage.Encryption);
        Dispatcher.UIThread.RunJobs();
        var page = screen.EncryptionScreen;
        Assert.NotNull(page.SetupRow);
        page.AskSetup();
        page.SetupPrompt.Fields[0].Text = "wrong";
        page.SetupPrompt.Confirm();
        await Task.Delay(50);
        Assert.Equal("Wrong password", page.SetupPrompt.ErrorText);
        page.SetupPrompt.Fields[0].Text = "pw";
        page.SetupPrompt.Confirm();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("EsTc new key", page.ShownKey);
        Assert.True(page.KeyDialog.IsOpen);
        Assert.Equal(SecurityState.Ready, controller.Store.Value.Security);
        Save(window, "recovery-key");
        Keys.Current = SecurityState.NeedsRecovery;
    }

    [AvaloniaFact]
    public async Task
        A_call_is_placed_from_a_direct_chat_rings_connects_and_ends()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        CallLine.Sent.Clear();
        CallSound.Log.Clear();
        controller.SelectRoom("!g");
        await Task.Delay(50);
        // Only a one-to-one chat can be called.
        var group =
            await Assert.ThrowsAsync<InvalidOperationException>(() =>
                controller.PlaceCall("!g", false));
        Assert.Equal("direct", group.Message);
        await controller.PlaceCall("!d", false);
        Dispatcher.UIThread.RunJobs();
        Assert.True(screen.Call.IsVisible);
        Assert.Equal("Alice", screen.Call.PeerName);
        Assert.Equal("Calling…", screen.Call.Status);
        Assert.Equal("ringback", CallSound.Log.Last());
        Assert.Contains("call.hangup", screen.Call.Buttons.Keys);
        var invite = CallLine.Sent.Single(x => x.Type == "m.call.invite");
        Save(window, "call-calling");

        CallLine.Deliver("m.call.answer", "@alice:s",
            new System.Text.Json.Nodes.JsonObject {
                ["call_id"] = (string?)invite.Content["call_id"],
                ["party_id"] = "alice-1",
                ["answer"] = new System.Text.Json.Nodes.JsonObject {
                    ["type"] = "answer",
                    ["sdp"] = "v=0"
                },
            });
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(OhMatrix.Core.Calls.CallPhase.Connected,
            controller.Store.Value.Call!.Phase);
        Assert.Matches(@"^\d\d:\d\d$", screen.Call.Status);
        Assert.Contains("call.mic", screen.Call.Buttons.Keys);
        controller.SetCallMuted(true);
        Dispatcher.UIThread.RunJobs();
        Assert.Contains("call.mic", screen.Call.Buttons.Keys);
        Assert.Contains("muted True", CallMedia.Log);
        Save(window, "call-connected");
        screen.Call.OpenDevices();
        Assert.Equal(2, screen.Call.DevicesMenu.Rows.Count);
        Save(window, "call-devices");
        controller.UseCallDevice(false, "m2");
        Assert.Contains("use False m2", CallMedia.Log);
        screen.Call.DevicesMenu.Close();
        screen.Call.Minimize(true);
        Dispatcher.UIThread.RunJobs();
        Assert.True(screen.Call.IsMinimized);
        Assert.True(screen.Call.MiniWindow.IsVisible);
        Save(window, "call-minimized");
        screen.Call.Minimize(false);
        Dispatcher.UIThread.RunJobs();
        Assert.False(screen.Call.MiniWindow.IsVisible);

        await controller.HangupCall();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Call ended", screen.Call.Status);
        Assert.Empty(screen.Call.Buttons);
        await Task.Delay(2200);
        Dispatcher.UIThread.RunJobs();
        Assert.Null(controller.Store.Value.Call);
        Assert.False(screen.Call.IsVisible);
    }

    [AvaloniaFact]
    public async Task A_call_that_comes_in_is_accepted_or_declined()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        CallLine.Sent.Clear();
        controller.SetPreferences(p => p with {
            Notifications = true
        });
        CallLine.Deliver("m.call.invite", "@alice:s",
            new System.Text.Json.Nodes.JsonObject {
                ["call_id"] = "in-1",
                ["party_id"] = "alice-1",
                ["lifetime"] = 60000,
                ["offer"] = new System.Text.Json.Nodes.JsonObject {
                    ["type"] = "offer",
                    ["sdp"] = "v=0\nm=audio"
                },
            });
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.True(screen.Call.IsVisible);
        Assert.Equal("Incoming voice call", screen.Call.Status);
        Assert.Contains("call.accept", screen.Call.Buttons.Keys);
        Assert.Contains("call.decline", screen.Call.Buttons.Keys);
        Save(window, "call-incoming");
        Assert.Equal("ring", CallSound.Log.Last());
        Assert.Contains(CallNotes.Sent, n => n.Body == "Incoming voice call");
        await controller.AnswerCall();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(OhMatrix.Core.Calls.CallPhase.Connected,
            controller.Store.Value.Call!.Phase);
        Assert.Contains(CallLine.Sent, x => x.Type == "m.call.answer");
        Assert.Contains("stop", CallSound.Log);
        await controller.HangupCall();
        Assert.Equal("ended", CallSound.Log.Last());
        await Task.Delay(2200);
        Dispatcher.UIThread.RunJobs();
        Assert.Null(controller.Store.Value.Call);
    }

    [AvaloniaFact]
    public async Task
        The_log_is_reached_from_settings_and_follows_what_is_logged()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Settings);
        Dispatcher.UIThread.RunJobs();
        controller.OpenSidebarPage(SidebarPage.Advanced);
        Dispatcher.UIThread.RunJobs();
        controller.OpenSidebarPage(SidebarPage.Logs);
        AppLog.Clear();
        AppLog.Add(LogLevel.Info, "started");
        AppLog.Error("it broke");
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(2, screen.LogScreen.LineCount);
        Save(window, "log");
        AppLog.Clear();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(0, screen.LogScreen.LineCount);
    }

    [AvaloniaFact]
    public async Task Resetting_the_keys_warns_first_then_asks_the_password()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        Keys.Current = SecurityState.Ready;
        await controller.RefreshSecurity();
        controller.OpenSidebarPage(SidebarPage.Encryption);
        Dispatcher.UIThread.RunJobs();
        var page = screen.EncryptionScreen;
        Assert.NotNull(page.ResetRow);
        page.AskReset();
        Assert.True(page.ResetDialog.IsOpen);
        Save(window, "reset-keys");
        page.ResetDialog.Close();
        Keys.Current = SecurityState.NeedsRecovery;
    }

    [AvaloniaFact]
    public async Task
        A_device_is_verified_by_comparing_pictures_with_another_session()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        Keys.Current = SecurityState.NeedsRecovery;
        await controller.RefreshSecurity();
        controller.OpenSidebarPage(SidebarPage.Encryption);
        Dispatcher.UIThread.RunJobs();
        Verify.Calls.Clear();
        Assert.NotNull(screen.EncryptionScreen.VerifyRow);
        await controller.RequestVerification();
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["request"], Verify.Calls);
        Assert.True(screen.Verify.Dialog.IsOpen);
        Assert.Contains("verify.close", screen.Verify.Buttons.Keys);

        Verify.Tell(new VerifyFlow(VerifyPhase.Waiting, false));
        Verify.Tell(new VerifyFlow(VerifyPhase.Emojis, false, null,
        [
            new("🐶", "Dog"), new("🔥", "Fire"), new("🎩", "Hat"),
            new("🌹", "Rose"),
            new("🍎", "Apple"), new("🚀", "Rocket"), new("🔑", "Key")
        ]));
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(7, screen.Verify.Symbols.Count);
        Save(window, "verify-pictures");
        screen.Verify.Buttons["verify.match"].RaiseClick();
        await Task.Delay(50);
        Assert.Contains("match", Verify.Calls);

        Verify.Tell(new VerifyFlow(VerifyPhase.Done, false));
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(VerifyPhase.Done,
            controller.Store.Value.Verification!.Phase);
        Keys.Current = SecurityState.Ready;
        await controller.DismissVerification();
        Dispatcher.UIThread.RunJobs();
        Assert.False(screen.Verify.Dialog.IsOpen);
        Assert.Null(controller.Store.Value.Verification);
        Assert.Equal(SecurityState.Ready, controller.Store.Value.Security);
        Keys.Current = SecurityState.NeedsRecovery;
    }

    [AvaloniaFact]
    public async Task A_request_from_another_session_is_accepted_or_declined()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        Verify.Calls.Clear();
        Verify.Tell(new VerifyFlow(VerifyPhase.Requested, true, "Pixel 9"));
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.True(screen.Verify.Dialog.IsOpen);
        Assert.Contains("verify.accept", screen.Verify.Buttons.Keys);
        Save(window, "verify-request");
        await controller.AcceptVerification();
        Assert.Equal(["accept"], Verify.Calls);
        await controller.DismissVerification();
        Dispatcher.UIThread.RunJobs();
        Assert.False(screen.Verify.Dialog.IsOpen);
        Assert.Equal(["accept", "cancel"], Verify.Calls);
    }

    [Fact]
    public void An_ended_verification_stays_until_dismissed()
    {
        var done = new VerifyFlow(VerifyPhase.Done, false);
        Assert.Same(done,
            VerifyFlow.After(done,
                new VerifyFlow(VerifyPhase.Cancelled, false)));
        var cancelled = new VerifyFlow(VerifyPhase.Cancelled, true, "X");
        Assert.Same(cancelled,
            VerifyFlow.After(cancelled,
                new VerifyFlow(VerifyPhase.Waiting, true)));
        Assert.Null(VerifyFlow.After(null,
            new VerifyFlow(VerifyPhase.Waiting, false)));
        var next = VerifyFlow.After(
            new VerifyFlow(VerifyPhase.Requested, true, "X"),
            new VerifyFlow(VerifyPhase.Waiting, false)
        );
        Assert.Equal(new VerifyFlow(VerifyPhase.Waiting, true, "X"), next);
    }

    [Fact]
    public void The_security_state_follows_what_the_sdk_says()
    {
        Assert.Equal(SecurityState.Unavailable,
            new RawSecurity("Unknown", null, false).State());
        Assert.Equal(SecurityState.Ready,
            new RawSecurity("Enabled", true, true).State());
        Assert.Equal(SecurityState.NeedsSetup,
            new RawSecurity("Disabled", true, false).State());
        Assert.Equal(SecurityState.NeedsRecovery,
            new RawSecurity("Enabled", false, false).State());
        Assert.Equal(SecurityState.NeedsRecovery,
            new RawSecurity("Disabled", false, true).State());
        Assert.Equal(SecurityState.NeedsSetup,
            new RawSecurity("Disabled", false, false).State());
    }

    [AvaloniaFact]
    public async Task
        The_sessions_page_lists_devices_and_signs_one_out_with_the_password()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Sessions);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var page = screen.SessionsScreen;
        Assert.Equal(["D1", "D2", "D3"], page.Devices.Select(d => d.Id));
        var texts = screen.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        Assert.Contains("This device", texts);
        Assert.Contains("Other sessions", texts);
        Assert.Contains("No recent activity", texts);
        Save(window, "sessions");
        page.AskSignOut(["D2"], false);
        page.Confirm.Fields[0].Text = "wrong";
        page.Confirm.Confirm();
        await Task.Delay(50);
        Assert.Equal("Wrong password.", page.Confirm.ErrorText);
        page.Confirm.Fields[0].Text = "pw";
        page.Confirm.Confirm();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["D2"], Sessions.Removed);
        Assert.Single(page.Devices);
    }

    [AvaloniaFact]
    public async Task
        The_profile_page_sets_a_status_and_tells_when_the_server_cannot()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        var page = screen.GetVisualDescendants().OfType<ProfilePage>().Single();
        page.AskStatus();
        Dispatcher.UIThread.RunJobs();
        page.StatusPrompt.Fields[0].Text = "refused";
        page.StatusPrompt.Confirm();
        await Task.Delay(50);
        Assert.Equal("This server does not support statuses.",
            page.StatusPrompt.ErrorText);
        page.StatusPrompt.Fields[0].Text = "  Coding  ";
        page.StatusPrompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Coding", controller.Store.Value.Profile!.Status);
        Save(window, "profile-status");
    }

    [AvaloniaFact]
    public async Task The_profile_page_changes_my_name()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        var page = screen.GetVisualDescendants().OfType<ProfilePage>().Single();
        Assert.Equal("Mia Example",
            controller.Store.Value.Profile!.DisplayName);
        page.AskName();
        Dispatcher.UIThread.RunJobs();
        var prompt = page.NamePrompt;
        Assert.Equal("Mia Example", prompt.Fields[0].Text);
        prompt.Fields[0].Text = "  Mia E.  ";
        prompt.Confirm();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal("Mia E.", controller.Store.Value.Profile!.DisplayName);
        Save(window, "profile-account");
    }

    private static Avalonia.Input.PointerReleasedEventArgs Release(Control row)
    {
        return new Avalonia.Input.PointerReleasedEventArgs(
            row,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), row,
            new Avalonia.Point(10, 10), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.None,
                Avalonia.Input.PointerUpdateKind.LeftButtonReleased),
            Avalonia.Input.KeyModifiers.None, Avalonia.Input.MouseButton.Left) {
            RoutedEvent = Avalonia.Input.InputElement.PointerReleasedEvent,
        };
    }

    private static ChatPane FindPane(MainScreen screen)
    {
        return (ChatPane)screen.Wide;
    }
}
