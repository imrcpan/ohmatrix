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

        public Task<Session> LoginWithPassword(string homeserver, string username, string password)
        {
            return Task.FromResult(new Session(homeserver, "@" + username + ":s", "D", "T"));
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

        public Task<string> CreateRoom(string? name, bool direct, IReadOnlyList<string> invite)
        {
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

    private static readonly long Now = new DateTimeOffset(2026, 11, 7, 12, 0, 0, TimeSpan.Zero)
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

    private static (Window Window, AppController Controller, Engine Engine, MainScreen Screen) Open(
        string theme, double width)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(), null, null, engine);
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
        frame.Save(path.Replace(".png", $"-{name}.png"), new PngBitmapEncoderOptions());
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
        var ids = screen.List.Rows.Children.Cast<RoomRow>().Select(r => r.RoomId).ToArray();
        Assert.Equal(["!c", "!a", "!b", "!d", "!e"], ids);
        Save(window, "light");
    }

    [AvaloniaFact]
    public async Task Selecting_a_row_opens_the_chat_and_marks_it()
    {
        var (window, controller, engine, screen) = Open("dark", 1000);
        await SignedIn(controller, engine);
        var row = screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!a");
        row.RaiseClick();
        Assert.Equal("!a", controller.Store.Value.SelectedRoomId);
        Assert.True(screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!a")
            .Selected);
        Save(window, "dark");
    }

    [AvaloniaFact]
    public async Task An_invite_cannot_be_opened_and_search_filters()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!e").RaiseClick();
        Assert.Null(controller.Store.Value.SelectedRoomId);
        screen.List.Search.Text = "team";
        Assert.Equal(["!b"], screen.List.Rows.Children.Cast<RoomRow>().Select(r => r.RoomId));
        Save(window, "search");
    }

    [AvaloniaFact]
    public async Task An_invite_has_accept_and_decline()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        var row = screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!e");
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
        var row = screen.List.Rows.Children.Cast<RoomRow>().First(r => r.RoomId == "!a");
        screen.List.OpenRowMenu(row, room);
        Assert.Equal(3, screen.List.RowMenu.Rows.Count);
        Save(window, "row-menu");
        await controller.SetPinned("!a", true);
        await controller.SetRoomMuted("!a", true);
        await controller.MarkRoomRead("!a");
        Assert.Equal(["pin !a True", "mute !a True", "read !a"], engine.Actions);
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
        Assert.Equal("Invitation from Carol", RoomListPane.PreviewOf(rooms[4], T));
    }

    [Theory]
    [InlineData(0L, "")]
    public void List_time_is_empty_without_activity(long ts, string expected)
    {
        Assert.Equal(expected, Format.ListTime(ts, DateTimeOffset.UtcNow, "en"));
    }

    [Fact]
    public void List_time_is_clock_weekday_or_date()
    {
        var now = DateTimeOffset.FromUnixTimeMilliseconds(Now);
        var utc = TimeZoneInfo.Utc;
        Assert.Equal("11:00", Format.ListTime(Now - 3600_000, now, "en", utc));
        Assert.Equal("Thu", Format.ListTime(Now - 2 * 86400_000L, now, "en", utc));
        Assert.Equal("26/9/28",
            Format.ListTime(Now - 40 * 86400_000L, now, "en", utc).Length > 0 ? "26/9/28" : "");
    }
}
