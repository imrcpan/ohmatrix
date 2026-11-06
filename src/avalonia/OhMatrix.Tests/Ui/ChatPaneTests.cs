using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class ChatPaneTests {
    private static readonly long Now = new DateTimeOffset(2026, 11, 7, 12, 30, 0, TimeSpan.Zero)
        .ToUnixTimeMilliseconds();

    private sealed class FakeChat(IReadOnlyList<TimelineItem> first) : IChatSession {
        public event Action<IReadOnlyList<TimelineItem>>? Changed;
        public IReadOnlyList<TimelineItem> Items { get; private set; } = first;
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

        public Task SendAttachment(string path, string mimeType, int? width, int? height)
        {
            Attached.Add($"{Path.GetFileName(path)} {mimeType} {width}x{height}");
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

        public Task ToggleReaction(string itemId, string key)
        {
            Reacted.Add(itemId + key);
            return Task.CompletedTask;
        }

        public Task Send(string text, string? replyToEventId = null)
        {
            if (replyToEventId is not null)
                Replies.Add(replyToEventId);
            Sent.Add(text);
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

        public Task<string?> Download(string source, string fileName, string mimeType)
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
                    new DeviceInfo("D2", "Phone", Now - 3 * 86_400_000L, "10.0.0.7", false),
                    new DeviceInfo("D3", "Old tablet", null, null, false),
                ];
            return Task.FromResult(all);
        }

        public Task RemoveDevices(IReadOnlyList<string> ids, string password)
        {
            if (password != "pw")
                throw new EngineException(EngineErrorCode.Forbidden, "Invalid password");
            Removed.AddRange(ids);
            gone = true;
            return Task.CompletedTask;
        }
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

        public Task<Session> LoginWithPassword(string homeserver, string username, string password)
        {
            return Task.FromResult(new Session(homeserver, "@" + username, "D", "T"));
        }

        public Task<Session> Register(string homeserver, string username, string password,
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

        public Task<string> JoinRoom(string idOrAlias)
        {
            return Task.FromResult("!joined");
        }

        public List<string> Created = [];

        public Task<string> CreateRoom(string? name, bool direct, IReadOnlyList<string> invite)
        {
            if (name == "bad")
                return Task.FromException<string>(new EngineException(EngineErrorCode.Forbidden,
                    "Not allowed"));
            Created.Add($"{name}|{direct}|{string.Join(",", invite)}");
            return Task.FromResult("!made");
        }

        public List<string> Actions = [];

        public Task<RoomDetails> Details(string roomId)
        {
            return Task.FromResult(new RoomDetails("We plan the demo here.", [
                new RoomMemberInfo("@me:s", "Mia Example", null, MemberRole.Admin),
                new RoomMemberInfo("@alice:s", "Alice", null, MemberRole.Moderator),
                new RoomMemberInfo("@bob:s", "Bob", null, MemberRole.Member),
            ]));
        }

        public Task AcceptInvite(string roomId) => Log("accept " + roomId);
        public Task DeclineInvite(string roomId) => Log("decline " + roomId);
        public Task SetPinned(string roomId, bool pinned) => Log($"pin {roomId} {pinned}");
        public Task SetMuted(string roomId, bool muted) => Log($"mute {roomId} {muted}");
        public Task SetMarkedUnread(string roomId, bool unread) => Log($"unread {roomId} {unread}");
        public Task MarkRoomRead(string roomId) => Log("read " + roomId);
        public Task SetRoomName(string roomId, string name) => Log($"name {roomId} {name}");
        public Task SetRoomTopic(string roomId, string topic) => Log($"topic {roomId} {topic}");
        public Task LeaveRoom(string roomId) => Log("leave " + roomId);

        public Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(string filter, string? server)
        {
            Actions.Add($"explore {filter} {server}");
            IReadOnlyList<PublicRoom> all = [
                new PublicRoom("!pub1:s", "Public Chat", "Talk about anything", "#pub:s", null,
                    1200),
                new PublicRoom("!pub2:s", "Rust Fans", null, null, null, 1),
            ];
            return Task.FromResult<IReadOnlyList<PublicRoom>>(
                [.. all.Where(r => r.Name.Contains(filter, StringComparison.OrdinalIgnoreCase))]);
        }

        public Task SetRoomAvatar(string roomId, string mimeType, byte[] data) =>
            Log($"avatar {roomId} {mimeType} {data.Length}");

        public Task SetMemberRole(string roomId, string userId, MemberRole role) =>
            Log($"role {roomId} {userId} {role}");

        public Task RemoveMember(string roomId, string userId) => Log($"remove {roomId} {userId}");

        public Task BanMember(string roomId, string userId, string? reason) =>
            Log($"ban {roomId} {userId} {reason}");

        public Task<IReadOnlyList<PersonInfo>> SearchPeople(string term)
        {
            IReadOnlyList<PersonInfo> all = [
                new PersonInfo("@ann:s", "Ann Lee", null), new PersonInfo("@anna:s", "Anna K", null)
            ];
            return Task.FromResult<IReadOnlyList<PersonInfo>>(
                [.. all.Where(p => p.Name.Contains(term, StringComparison.OrdinalIgnoreCase))]);
        }

        public Task InviteToRoom(string roomId, IReadOnlyList<string> userIds) =>
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
                    Reply = new ReplyQuote("Alice", "Are we still on for the demo tomorrow?", "$2"),
                    Reactions =
                        [new ReactionCount("👍", 2, true), new ReactionCount("❤️", 1, false)],
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
                    Image = new ImageAttachment("mxc://s/pic", 1600, 900, "pic.jpg"),
                },
                new TimelineItem {
                    Id = "doc",
                    Body = "",
                    SenderId = "@me",
                    IsOwn = true,
                    Ts = Now - 700_000,
                    File = new FileAttachment("budget-2026.pdf", 1_450_000, "mxc://s/doc",
                        "application/pdf"),
                },
                new TimelineItem {
                    Id = "voice",
                    Body = "",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 650_000,
                    File = new FileAttachment("voice.ogg", 48_000, "mxc://s/voice", "audio/ogg",
                        FileKind.Audio, TimeSpan.FromSeconds(75)),
                },
                new TimelineItem {
                    Id = "clip",
                    Body = "The demo",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 640_000,
                    File = new FileAttachment("demo.mp4", 9_000_000, "mxc://s/clip", "video/mp4",
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

    private static async Task<(Window Window, AppController Controller, Engine Engine, MainScreen
            Screen)>
        Open(string theme, double width)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(), null, null, engine, engine,
            new Media(), new Profiles(), Sessions);
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
        frame.Save(path.Replace(".png", $"-{name}.png"), new PngBitmapEncoderOptions());
    }

    [AvaloniaFact]
    public async Task Opening_a_chat_shows_its_messages_and_dividers()
    {
        var (window, controller, engine, _) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(11, controller.Store.Value.Timeline.Count);
        Assert.Single(engine.Opened);
        Save(window, "light");
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
        var yes = page.Confirm.Card.GetVisualDescendants().OfType<PrimaryButton>().First();
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
    public async Task People_are_searched_and_chosen_for_a_new_chat_and_for_an_invitation()
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
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>().First();
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
        page.Field.Text = "rust";
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(["Rust Fans"], page.Names);
        page.Field.Text = "public";
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        page.AskJoin(new PublicRoom("!pub1:s", "Public Chat", "Talk", "#pub:s", null, 1200));
        Assert.True(page.Confirm.Dialog.IsOpen);
        page.Confirm.Confirm();
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(SidebarPage.Chats, controller.Store.Value.SidebarPage);
        Assert.Equal("!joined", controller.Store.Value.SelectedRoomId);
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
        Assert.Equal("Mia Example", controller.Store.Value.Profile!.DisplayName);
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
            press, new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse, true), press,
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
        Assert.Equal(2 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
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
        Assert.Equal(2 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
        pane.OpenActions(pane.Messages, tl.First(i => i.Id == "3"));
        Assert.Equal(4 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
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
        controller.StartEdit(controller.Store.Value.Timeline.First(i => i.Id == "3"));
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
        pane.OpenActions(pane.Messages, controller.Store.Value.Timeline.First(i => i.Id == "3"));
        // The Delete row is the fourth of the menu: Reply, Pin, Edit, Delete.
        var row = (Border)pane.Actions.Rows[3];
        row.RaiseEvent(Release(row));
        Assert.True(pane.DeleteDialog.IsOpen);
        Save(window, "delete-dialog");
        var yes = pane.DeleteDialog.Card.GetVisualDescendants().OfType<PrimaryButton>().First();
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
        var picture = FindPane(screen).Messages.GetVisualDescendants().OfType<Image>().First();
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
        var zh = OhMatrix.Core.I18n.Strings.Languages.ToList().FindIndex(l => l.Id == "zh-CN");
        var press = (Control)rows[zh];
        press.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            press, new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse, true), press,
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
    public async Task The_info_panel_lists_topic_and_members()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(3, controller.Store.Value.Details!.Members.Count);
        var texts = screen.GetVisualDescendants().OfType<TextBlock>().Select(t => t.Text).ToList();
        Assert.Contains("We plan the demo here.", texts);
        Assert.Contains("Admin", texts);
        Assert.Contains("Moderator", texts);
        Save(window, "info-wide");
        var panelShared = screen.GetVisualDescendants().OfType<RoomInfoPanel>().First();
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
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>().First();
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
        var yes = panel.LeaveDialog.Card.GetVisualDescendants().OfType<PrimaryButton>().Single();
        yes.RaiseClick();
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        Assert.Equal(
            ["name !g Demo crew", "topic !g New topic", "leave !g"],
            engine.Actions.Where(a => a.StartsWith("name") || a.StartsWith("topic")
                                                           || a.StartsWith("leave")));
        Assert.Null(controller.Store.Value.SelectedRoomId);
    }

    [AvaloniaFact]
    public async Task Members_get_a_role_are_removed_or_banned_from_the_info_panel()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        controller.OpenRoomInfo(true);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>().First();
        var room = controller.Store.Value.Rooms.First(r => r.Id == "!g");
        var bob = controller.Store.Value.Details!.Members.First(m => m.Name == "Bob");
        var anchor = panel.Content.Children.OfType<Border>().First(b => b.Cursor is not null);
        panel.OpenMemberMenu(anchor, room, bob);
        Assert.True(panel.MemberMenu.IsOpen);
        Assert.Equal(4, panel.MemberMenu.Rows.Count);
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
            ["role !g @bob:s Moderator", "remove !g @bob:s", "ban !g @bob:s spam"],
            engine.Actions.Where(a => a.StartsWith("role") || a.StartsWith("remove")
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
    public async Task A_picture_from_disk_is_sent_with_its_size_and_a_file_without()
    {
        var (window, controller, engine, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        var dir = Path.Combine(Path.GetTempPath(), "ohm-att-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var png = Path.Combine(dir, "pic.png");
        using (var target =
               new Avalonia.Media.Imaging.RenderTargetBitmap(new Avalonia.PixelSize(40, 20)))
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
        Assert.Equal(2, pane.AttachMenu.Rows.Count);
        Save(window, "attach");
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
    public async Task Pressing_a_picture_opens_the_viewer_that_zooms_and_closes()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var pane = FindPane(screen);
        var picture = pane.Messages.GetVisualDescendants().OfType<Image>().First();
        for (var i = 0; i < 20 && picture.Source is null; i++) {
            await Task.Delay(50);
            Dispatcher.UIThread.RunJobs();
        }

        picture.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            picture, new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse, true), picture,
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
        var centre = new Avalonia.Point(window.ClientSize.Width / 2, window.ClientSize.Height / 2);
        pane.Viewer.ZoomBy(2, centre);
        pane.Viewer.ZoomBy(2, centre);
        Assert.Equal(4, pane.Viewer.Zoom, 3);
        Save(window, "viewer-zoomed");
        pane.Viewer.ZoomBy(100, centre);
        Assert.Equal(ImageViewer.MaxZoom, pane.Viewer.Zoom);
        pane.Viewer.ZoomBy(0.001, centre);
        Assert.Equal(1, pane.Viewer.Zoom);
        window.KeyPress(Avalonia.Input.Key.Escape, Avalonia.Input.RawInputModifiers.None,
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
                pane.PinnedBar.GetVisualDescendants().OfType<TextBlock>().Select(t => t.Text));
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
        var glyphs = screen.GetVisualDescendants().OfType<Icon>().Select(i => i.Glyph).ToList();
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
            var page = screen.GetVisualDescendants().OfType<ProfilePage>().Single();
            await page.ChangePhoto(path);
            controller.SelectRoom("!g");
            await Task.Delay(50);
            controller.OpenRoomInfo(true);
            await Task.Delay(100);
            Dispatcher.UIThread.RunJobs();
            var panel = screen.GetVisualDescendants().OfType<RoomInfoPanel>().First();
            Assert.NotNull(panel.PhotoButton);
            await panel.ChangePhoto(controller.Store.Value.Rooms.First(r => r.Id == "!g"), path);
            Assert.Contains("avatar !g image/png 4", engine.Actions);
        } finally {
            File.Delete(path);
        }
    }

    [AvaloniaFact]
    public async Task Audio_and_video_messages_show_their_length_and_files_are_fetched()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.SelectRoom("!g");
        await Task.Delay(50);
        Dispatcher.UIThread.RunJobs();
        var texts = screen.GetVisualDescendants().OfType<TextBlock>().Select(t => t.Text).ToList();
        Assert.Contains("47 KB · 1:15", texts);
        Assert.Contains(texts, t => t is not null && t.EndsWith("· 1:02:05"));
        var icons = screen.GetVisualDescendants().OfType<Icon>().Select(i => i.Glyph).ToList();
        Assert.Contains("music", icons);
        Assert.Contains("video", icons);
        Save(window, "audio-video");
        var path = await controller.DownloadFile(
            new FileAttachment("a.pdf", 1, "mxc://s/a", "application/pdf"));
        Assert.Equal("/tmp/a.pdf", path);
        Assert.Null(await controller.DownloadFile(new FileAttachment("b.pdf", 1)));
    }

    [AvaloniaFact]
    public async Task The_settings_toggle_puts_my_messages_in_the_accent_colour_or_not()
    {
        var (_, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Settings);
        Dispatcher.UIThread.RunJobs();
        var toggle = screen.SettingsScreen.AccentToggle;
        Assert.True(toggle.IsOn);
        toggle.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            toggle, new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse, true), toggle,
            new Avalonia.Point(5, 5), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None));
        Dispatcher.UIThread.RunJobs();
        Assert.False(controller.Store.Value.Prefs.OwnBubbleAccent);
        Assert.False(screen.SettingsScreen.AccentToggle.IsOn);
    }

    [AvaloniaFact]
    public async Task The_sessions_page_lists_devices_and_signs_one_out_with_the_password()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Sessions);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        var page = screen.SessionsScreen;
        Assert.Equal(["D1", "D2", "D3"], page.Devices.Select(d => d.Id));
        var texts = screen.GetVisualDescendants().OfType<TextBlock>().Select(t => t.Text).ToList();
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
    public async Task The_profile_page_sets_a_status_and_tells_when_the_server_cannot()
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
        Assert.Equal("This server does not support statuses.", page.StatusPrompt.ErrorText);
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
        Assert.Equal("Mia Example", controller.Store.Value.Profile!.DisplayName);
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
            row, new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse, true), row,
            new Avalonia.Point(10, 10), 0,
            new Avalonia.Input.PointerPointProperties(Avalonia.Input.RawInputModifiers.None,
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
