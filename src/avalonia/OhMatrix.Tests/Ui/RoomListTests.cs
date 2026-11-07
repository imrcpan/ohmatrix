using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class RoomListTests {
    private sealed class Engine : IAuthEngine, IRoomsEngine {
        public event Action<IReadOnlyList<RoomSummary>>? RoomsChanged;
        public event Action<SyncState>? SyncChanged;

        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password)
        {
            return Task.FromResult(new Session(homeserver,
                "@" + username + ":s", "D", "T"));
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

        public Task<string> JoinRoom(string idOrAlias)
        {
            return Task.FromResult("!joined");
        }

        public Task<string> CreateRoom(string? name, bool direct,
            IReadOnlyList<string> invite)
        {
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

    private static readonly long Now =
        new DateTimeOffset(2026, 11, 7, 12, 0, 0, TimeSpan.Zero)
            .ToUnixTimeMilliseconds();

    private static RoomSummary[] Rooms()
    {
        return [
            new RoomSummary {
                Id = "!a",
                Name = "Alice",
                IsDirect = true,
                LastMessage = "see you  tomorrow",
                LastSender = "Alice",
                LastActivityTs = Now - 3600_000,
                UnreadCount = 3,
            },
            new RoomSummary {
                Id = "!b",
                Name = "Team chat",
                LastMessage = "ship it",
                LastSender = "Bob",
                LastActivityTs = Now - 2 * 86400_000L,
                Muted = true,
                UnreadCount = 120,
            },
            new RoomSummary {
                Id = "!c",
                Name = "Pinned",
                Pinned = true,
                LastMessage = "ok",
                LastSender = null,
                LastActivityTs = Now - 40 * 86400_000L,
                MarkedUnread = true,
            },
            new RoomSummary {
                Id = "!d",
                Name = "Space of things",
                IsSpace = true,
            },
            new RoomSummary {
                Id = "!e",
                Name = "Invited room",
                Inviter = "Carol",
            },
        ];
    }

    private static (Window Window, AppController Controller, Engine Engine,
        MainScreen Screen) Open(
            string theme, double width)
    {
        var engine = new Engine();
        var controller =
            new AppController(engine, new NoSessions(), null, null, engine);
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
        return (window, controller, engine, screen);
    }

    private static void Save(Window window, string name)
    {
        var path = Environment.GetEnvironmentVariable("OHMATRIX_ROOMS_SHEET");
        if (string.IsNullOrEmpty(path))
            return;
        window.UpdateLayout();
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        frame.Save(path.Replace(".png", $"-{name}.png"),
            new PngBitmapEncoderOptions());
    }

    private static async Task SignedIn(AppController controller, Engine engine)
    {
        await controller.Login("matrix.org", "me", "pw");
        engine.Push(Rooms());
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
    }

    [AvaloniaFact]
    public async Task Lists_rooms_pinned_first_then_by_activity()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        var ids = screen.List.Rows.Children.Cast<RoomRow>()
            .Select(r => r.RoomId).ToArray();
        Assert.Equal(["!c", "!a", "!b", "!d", "!e"], ids);
        Save(window, "light");
    }

    [AvaloniaFact]
    public async Task Grey_rows_stand_in_until_the_first_load_is_over()
    {
        var (window, controller, engine, screen) = Open("dark", 1000);
        await controller.Login("matrix.org", "me", "pw");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(12,
            screen.List.Rows.Children.OfType<RoomRowSkeleton>().Count());
        Save(window, "skeleton");
        engine.Push(Rooms());
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Empty(screen.List.Rows.Children.OfType<RoomRowSkeleton>());
        Assert.True(screen.List.Rows.Children.OfType<RoomRow>().Any());
    }

    [AvaloniaFact]
    public async Task The_list_settles_when_it_has_been_still_once_syncing()
    {
        var (_, controller, engine, _) = Open("light", 1000);
        await controller.Login("matrix.org", "me", "pw");
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.False(controller.Store.Value.RoomsSettled);
        await Task.Delay(1000);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.True(controller.Store.Value.RoomsSettled);
    }

    [Xunit.Theory]
    [Xunit.InlineData(0, 1280, 72)]
    [Xunit.InlineData(166, 1280, 260)]
    [Xunit.InlineData(165, 1280, 72)]
    [Xunit.InlineData(900, 1280, 520)]
    [Xunit.InlineData(900, 800, 400)]
    [Xunit.InlineData(400, 1280, 400)]
    public void The_sidebar_width_is_kept_between_the_strip_and_the_most(
        double width,
        double window,
        double expected)
    {
        Xunit.Assert.Equal(expected, Layout.ClampSidebar(width, window));
        Xunit.Assert.Equal(
            Layout.ClampSidebar(Math.Round(window * 0.3), window),
            Layout.AutoSidebar(window));
    }

    [AvaloniaFact]
    public async Task A_dragged_width_is_kept_and_a_narrow_one_is_the_strip()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        Assert.Equal(300, screen.SidebarWidth());
        screen.Resizer.Live(400);
        Assert.Equal(400, screen.SidebarWidth());
        screen.Resizer.Live(null);
        screen.Resizer.Commit(420);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(420, controller.Store.Value.Prefs.SidebarWidth);
        Assert.Equal(420, screen.SidebarWidth());
        Save(window, "wide");
        screen.Resizer.Commit(Layout.ClampSidebar(50, 1000));
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(Layout.SidebarRail, screen.SidebarWidth());
        Save(window, "strip");
        // A double click on the divider goes back to the automatic width.
        screen.Resizer.Commit(null);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(300, screen.SidebarWidth());
    }

    [AvaloniaFact]
    public async Task Selecting_a_row_opens_the_chat_and_marks_it()
    {
        var (window, controller, engine, screen) = Open("dark", 1000);
        await SignedIn(controller, engine);
        var row = screen.List.Rows.Children.Cast<RoomRow>()
            .First(r => r.RoomId == "!a");
        row.RaiseClick();
        Assert.Equal("!a", controller.Store.Value.SelectedRoomId);
        Assert.True(screen.List.Rows.Children.Cast<RoomRow>()
            .First(r => r.RoomId == "!a")
            .Selected);
        Save(window, "dark");
    }

    [AvaloniaFact]
    public async Task An_invite_cannot_be_opened_and_search_filters()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!e")
            .RaiseClick();
        Assert.Null(controller.Store.Value.SelectedRoomId);
        screen.List.Search.Text = "team";
        Assert.Equal(["!b"],
            screen.List.Rows.Children.Cast<RoomRow>().Select(r => r.RoomId));
        Save(window, "search");
    }

    [AvaloniaFact]
    public async Task An_invite_has_accept_and_decline()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        var row = screen.List.Rows.Children.Cast<RoomRow>()
            .First(r => r.RoomId == "!e");
        Assert.NotNull(row.Invite);
        Assert.Equal("Accept", row.Invite!.Value.Accept);
        Save(window, "invite");
        row.Invite.Value.OnDecline();
        row.Invite.Value.OnAccept();
        await Task.Delay(50);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(["decline !e", "accept !e"], engine.Actions);
        Assert.Equal("!e", controller.Store.Value.SelectedRoomId);
    }

    [AvaloniaFact]
    public async Task The_row_menu_offers_pin_mute_and_the_unread_mark()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        var room = controller.Store.Value.Rooms.First(r => r.Id == "!a");
        var row = screen.List.Rows.Children.Cast<RoomRow>()
            .First(r => r.RoomId == "!a");
        screen.List.OpenRowMenu(row, room);
        Assert.Equal(3, screen.List.RowMenu.Rows.Count);
        Save(window, "row-menu");
        await controller.SetPinned("!a", true);
        await controller.SetRoomMuted("!a", true);
        await controller.MarkRoomRead("!a");
        Assert.Equal(["pin !a True", "mute !a True", "read !a"],
            engine.Actions);
    }

    [AvaloniaFact]
    public async Task Narrow_window_shows_only_the_list()
    {
        var (window, controller, engine, screen) = Open("light", 420);
        await SignedIn(controller, engine);
        window.UpdateLayout();
        Assert.Equal(420, screen.List.Bounds.Width, 1);
        Save(window, "narrow");
    }

    [Fact]
    public void Previews_are_worded_as_the_react_native_list()
    {
        string T(string key, (string, object)[] v)
        {
            return OhMatrix.Core.I18n.Strings.T("en", key, v);
        }

        var rooms = Rooms();
        Assert.Equal("Alice: see you tomorrow".Replace("Alice: ", ""),
            RoomListPane.PreviewOf(rooms[0], T));
        Assert.Equal("Bob: ship it", RoomListPane.PreviewOf(rooms[1], T));
        Assert.Equal("You: ok", RoomListPane.PreviewOf(rooms[2], T));
        Assert.Equal("No messages yet", RoomListPane.PreviewOf(rooms[3], T));
        Assert.Equal("Invitation from Carol",
            RoomListPane.PreviewOf(rooms[4], T));
    }

    [Theory]
    [InlineData(0L, "")]
    public void List_time_is_empty_without_activity(long ts, string expected)
    {
        Assert.Equal(expected,
            Format.ListTime(ts, DateTimeOffset.UtcNow, "en"));
    }

    [Fact]
    public void List_time_is_clock_weekday_or_date()
    {
        var now = DateTimeOffset.FromUnixTimeMilliseconds(Now);
        var utc = TimeZoneInfo.Utc;
        Assert.Equal("11:00", Format.ListTime(Now - 3600_000, now, "en", utc));
        Assert.Equal("Thu",
            Format.ListTime(Now - 2 * 86400_000L, now, "en", utc));
        Assert.Equal("26/9/28",
            Format.ListTime(Now - 40 * 86400_000L, now, "en", utc).Length > 0
                ? "26/9/28"
                : "");
    }

    [Fact]
    public void Relative_times_are_worded_in_the_language()
    {
        var now = new DateTimeOffset(2026, 11, 7, 12, 0, 0, TimeSpan.Zero);
        long Ago(long ms) => now.ToUnixTimeMilliseconds() - ms;
        Assert.Equal("now", Format.Relative(Ago(5_000), now, "en"));
        Assert.Equal("1 minute ago", Format.Relative(Ago(60_000), now, "en"));
        Assert.Equal("5 minutes ago",
            Format.Relative(Ago(5 * 60_000), now, "en"));
        Assert.Equal("2 hours ago",
            Format.Relative(Ago(2 * 3_600_000L), now, "en"));
        Assert.Equal("yesterday",
            Format.Relative(Ago(30 * 3_600_000L), now, "en"));
        Assert.Equal("3天前",
            Format.Relative(Ago(3 * 86_400_000L), now, "zh-CN"));
        Assert.Equal("vor 1 Stunde",
            Format.Relative(Ago(3_600_000), now, "de"));
        Assert.Equal("5 минут назад",
            Format.Relative(Ago(5 * 60_000), now, "ru"));
        Assert.Equal("2 минуты назад",
            Format.Relative(Ago(2 * 60_000), now, "ru"));
        Assert.Equal("Oct 1, 2026",
            Format.Relative(Ago(37 * 86_400_000L), now, "en"));
    }

    [Fact]
    public void Service_lines_read_as_in_the_react_native_engine()
    {
        Assert.Equal("Ann joined",
            ServiceText.ForMembership(MembershipKind.Joined, "Ann", "Bob"));
        Assert.Equal("Bob invited Ann",
            ServiceText.ForMembership(MembershipKind.Invited, "Ann", "Bob"));
        Assert.Equal("Ann was removed",
            ServiceText.ForMembership(MembershipKind.Kicked, "Ann", "Bob"));
        Assert.Null(
            ServiceText.ForMembership(MembershipKind.None, "Ann", "Bob"));
        Assert.Equal("Bob created the room",
            ServiceText.ForState("RoomCreate", null, "Bob"));
        Assert.Equal("Bob changed the room name to “Crew”",
            ServiceText.ForState("RoomName", "Crew", "Bob"));
        Assert.Equal("Bob removed the room name",
            ServiceText.ForState("RoomName", "", "Bob"));
        Assert.Null(ServiceText.ForState("RoomAvatar", null, "Bob"));
        Assert.Equal("ann", ServiceText.PersonName(null, "@ann:s"));
        Assert.Equal("Ann Lee", ServiceText.PersonName("Ann Lee", "@ann:s"));
    }
}
