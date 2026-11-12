using System.Collections.Specialized;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.VisualTree;
using Microsoft.Extensions.Time.Testing;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Rooms;
using OhMatrix.Core.Ui.Shell;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
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

    private static (Window Window, AppController Controller, RoomListPane List)
        OpenList(IReadOnlyList<RoomSummary> rooms, bool rail = false,
            TimeProvider? time = null, ISearchEngine? searchEngine = null)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(),
            rooms: engine, searchEngine: searchEngine);
        controller.Store.Update(s => s with {
            Auth = AuthStatus.SignedIn,
            SyncState = SyncState.Syncing,
            UserId = "@me:localhost",
            Profile = new Profile("@me:localhost", "Me", null),
            Rooms = rooms,
            RoomsSettled = true,
            Prefs = s.Prefs with {
                Locale = "en"
            },
        });
        var list = new RoomListPane(controller, rail, time);
        var window = new Window {
            Content = list,
            Width = 340,
            Height = 700
        };
        window.Show();
        window.UpdateLayout();
        return (window, controller, list);
    }

    [AvaloniaTheory]
    [InlineData(SecurityState.NeedsSetup, "Set up")]
    [InlineData(SecurityState.NeedsRecovery, "Verify")]
    public void A_banner_asks_to_set_up_or_verify_the_encryption(
        SecurityState state, string action)
    {
        var (window, controller, list) = OpenList([]);
        try {
            var banner = list.GetVisualDescendants().OfType<Banner>().Single();
            Assert.False(banner.IsVisible);
            controller.Store.Update(s => s with {
                Security = state
            });
            window.UpdateLayout();
            Assert.True(banner.IsVisible);
            Assert.Contains(banner.GetVisualDescendants().OfType<TextBlock>(),
                t => t.Text == action);
            controller.Store.Update(s => s with {
                Security = SecurityState.Ready
            });
            Assert.False(banner.IsVisible);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void
        The_strip_has_no_banner_and_the_plus_button_is_under_my_picture()
    {
        var (window, controller, list) = OpenList([], true);
        try {
            list.Width = Layout.SidebarRail;
            list.HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left;
            controller.Store.Update(s => s with {
                Security = SecurityState.NeedsRecovery
            });
            window.UpdateLayout();
            Assert.False(list.GetVisualDescendants().OfType<Banner>().Single()
                .IsVisible);
            var picture = list.GetVisualDescendants().OfType<Avatar>().First();
            var plus = list.GetVisualDescendants().OfType<IconButton>()
                .Single();
            Assert.Equal(44, picture.Bounds.Width);
            // The picture has the place of a row's picture (6 and 8 aside).
            Assert.Equal(14, picture.TranslatePoint(default, list)!.Value.X);
            Assert.True(plus.TranslatePoint(default, list)!.Value.Y >=
                        picture.TranslatePoint(default, list)!.Value.Y + 44);
            Assert.Equal(Layout.SidebarRail / 2,
                plus.TranslatePoint(new Avalonia.Point(plus.Bounds.Width / 2,
                    0), list)!.Value.X);
        } finally {
            window.Close();
        }
    }

    [AvaloniaTheory]
    [InlineData(false)]
    [InlineData(true)]
    public void A_message_in_500_rooms_keeps_rows_subtrees_and_other_previews(
        bool rail)
    {
        var rooms = Enumerable.Range(0, 500).Select(i => new RoomSummary {
            Id = $"!room{i}",
            Name = $"Room {i}",
            LastMessage = $"Message  {i}",
            LastSender = "Alice",
            LastActivityTs = Now,
        }).ToArray();
        var (window, controller, list) = OpenList(rooms, rail);
        try {
            var rows = list.Rows.Children.Cast<RoomRow>().ToArray();
            var children = rows.Select(r => r.Child).ToArray();
            var previews = rows.Select(r => r.Preview).ToArray();
            var avatars = rows.Select(r => r.GetVisualDescendants()
                .OfType<Avatar>().Single()).ToArray();
            var profile = list.GetVisualDescendants().OfType<Avatar>().First();
            var mutations = 0;
            list.Rows.Children.CollectionChanged += (_, _) => mutations++;
            // SDK snapshots may contain new summaries for unchanged rooms.
            var changed = rooms.Select(r => r with {
            }).ToArray();
            changed[250] = changed[250] with {
                LastMessage = "A new message",
                UnreadCount = 4
            };
            controller.Store.Update(s => s with {
                Rooms = changed
            });
            controller.Store.Update(s => s with {
                Typing = ["Alice"]
            });
            Assert.Equal(0, mutations);
            for (var i = 0; i < rows.Length; i++) {
                Assert.Same(rows[i], list.Rows.Children[i]);
                Assert.Same(children[i], rows[i].Child);
                Assert.Same(avatars[i], rows[i].GetVisualDescendants()
                    .OfType<Avatar>().Single());
                if (i != 250)
                    Assert.Same(previews[i], rows[i].Preview);
            }

            Assert.Equal("Alice: A new message", rows[250].Preview);
            Assert.Equal(4, rows[250].Unread);
            Assert.Same(profile,
                list.GetVisualDescendants().OfType<Avatar>().First());
            list.Search.Text = "not a room";
            if (!rail) {
                Assert.Empty(list.Rows.Children);
                list.Search.Text = "";
                for (var i = 0; i < rows.Length; i++)
                    Assert.Same(rows[i], list.Rows.Children[i]);
            }
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Reordering_filtering_and_removal_preserve_surviving_rows()
    {
        var initial = Rooms();
        var (window, controller, list) = OpenList(initial);
        try {
            var rows = list.Rows.Children.Cast<RoomRow>()
                .ToDictionary(r => r.RoomId);
            var resets = 0;
            list.Rows.Children.CollectionChanged += (_, e) => {
                if (e.Action == NotifyCollectionChangedAction.Reset)
                    resets++;
            };
            var added = new RoomSummary {
                Id = "!new",
                Name = "New room"
            };
            controller.Store.Update(s => s with {
                Rooms = [initial[2], initial[0], added, initial[1]]
            });
            Assert.Equal(["!c", "!a", "!new", "!b"],
                list.Rows.Children.Cast<RoomRow>().Select(r => r.RoomId));
            foreach (var id in new[] {
                         "!a", "!b", "!c"
                     })
                Assert.Contains(rows[id], list.Rows.Children);
            list.Search.Text = "team";
            Assert.Same(rows["!b"], Assert.Single(list.Rows.Children));
            list.Search.Text = "";
            Assert.Same(rows["!a"], list.Rows.Children[1]);
            Assert.Same(rows["!b"], list.Rows.Children[3]);
            controller.Store.Update(s => s with {
                Rooms = initial
            });
            Assert.NotSame(rows["!d"], list.Rows.Children[3]);
            Assert.Equal(0, resets);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Selection_and_localization_update_existing_rows()
    {
        var (window, controller, list) = OpenList(Rooms());
        try {
            var rows = list.Rows.Children.Cast<RoomRow>().ToArray();
            var children = rows.Select(r => r.Child).ToArray();
            var otherPreview = rows[2].Preview;
            rows[0].RaiseClick();
            Assert.True(rows[0].Selected);
            rows[1].RaiseClick();
            Assert.False(rows[0].Selected);
            Assert.True(rows[1].Selected);
            Assert.Same(otherPreview, rows[2].Preview);
            controller.SetPreferences(p => p with {
                Locale = "de"
            });
            Assert.Equal(OhMatrix.Core.I18n.Strings.T("de", "noMessages"),
                rows[3].Preview);
            Assert.Equal(OhMatrix.Core.I18n.Strings.T("de", "accept"),
                rows[4].Invite!.Value.Accept);
            ThemeScope.SetColors(window, Themes.Get("dark")!.Colors);
            for (var i = 0; i < rows.Length; i++) {
                Assert.Same(rows[i], list.Rows.Children[i]);
                Assert.Same(children[i], rows[i].Child);
            }
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_reused_row_uses_current_invitation_space_and_menu_state()
    {
        var room = new RoomSummary {
            Id = "!room",
            Name = "Room",
            Inviter = "Alice"
        };
        var (window, controller, list) = OpenList([room]);
        try {
            var row = Assert.IsType<RoomRow>(Assert.Single(list.Rows.Children));
            row.RaiseClick();
            Assert.Null(controller.Store.Value.SelectedRoomId);
            room = room with {
                Inviter = null,
                Pinned = true,
                Muted = true
            };
            controller.Store.Update(s => s with {
                Rooms = [room]
            });
            Assert.Same(row, Assert.Single(list.Rows.Children));
            Assert.Null(row.Invite);
            row.RaiseClick();
            Assert.Equal(room.Id, controller.Store.Value.SelectedRoomId);
            window.UpdateLayout();
            var point = row.TranslatePoint(new Point(20, 20), window)!.Value;
            window.MouseDown(point, MouseButton.Right);
            window.MouseUp(point, MouseButton.Right);
            Assert.True(list.RowMenu.IsOpen);
            var labels = list.RowMenu.Surface.GetVisualDescendants()
                .OfType<TextBlock>().Select(t => t.Text).ToArray();
            Assert.Contains(OhMatrix.Core.I18n.Strings.T("en", "unpin"),
                labels);
            Assert.Contains(OhMatrix.Core.I18n.Strings.T("en", "unmute"),
                labels);
            list.RowMenu.Close();
            room = room with {
                IsSpace = true
            };
            controller.Store.Update(s => s with {
                Rooms = [room]
            });
            row.RaiseClick();
            Assert.Equal(SidebarPage.Space, controller.Store.Value.SidebarPage);
            Assert.Equal(room.Id, controller.Store.Value.OpenSpaceId);
            room = room with {
                IsSpace = false,
                Inviter = "Bob"
            };
            controller.Store.Update(s => s with {
                Rooms = [room],
                SelectedRoomId = null
            });
            Assert.NotNull(row.Invite);
            row.RaiseClick();
            Assert.Null(controller.Store.Value.SelectedRoomId);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task Joining_ticks_only_update_the_waiting_row()
    {
        var clock = new FakeTimeProvider(
            DateTimeOffset.FromUnixTimeMilliseconds(Now));
        var (window, controller, list) = OpenList(Rooms(), time: clock);
        try {
            var rows = list.Rows.Children.Cast<RoomRow>().ToArray();
            var children = rows.Select(r => r.Child).ToArray();
            var previews = rows.Select(r => r.Preview).ToArray();
            controller.Store.Update(s => s with {
                Joining = [
                    new JoiningRoom("!waiting", "Waiting", null,
                        clock.GetUtcNow())
                ]
            });
            var joining = Assert.IsType<RoomRow>(list.Rows.Children[0]);
            var child = joining.Child;
            Assert.EndsWith("(0s)", joining.Preview);
            var mutations = 0;
            list.Rows.Children.CollectionChanged += (_, _) => mutations++;
            clock.Advance(TimeSpan.FromSeconds(5));
            await Task.Delay(1200);
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            Assert.Same(joining, list.Rows.Children[0]);
            Assert.Same(child, joining.Child);
            Assert.EndsWith("(5s)", joining.Preview);
            Assert.Equal(0, mutations);
            for (var i = 0; i < rows.Length; i++) {
                Assert.Same(rows[i], list.Rows.Children[i + 1]);
                Assert.Same(children[i], rows[i].Child);
                Assert.Same(previews[i], rows[i].Preview);
            }

            var at = rows[0].Time;
            clock.Advance(TimeSpan.FromDays(1));
            await Task.Delay(1200);
            Avalonia.Threading.Dispatcher.UIThread.RunJobs();
            Assert.NotEqual(at, rows[0].Time);
            Assert.Equal(Format.ListTime(Rooms()[0].LastActivityTs,
                clock.GetUtcNow(), "en"), rows[0].Time);
            Assert.Equal(0, mutations);
            controller.Store.Update(s => s with {
                Joining = [],
                JoinError = "Cannot join"
            });
            Assert.IsType<TextBlock>(list.Rows.Children[0]);
            controller.DismissJoinError();
            Assert.Same(rows[0], list.Rows.Children[0]);
        } finally {
            window.Close();
        }
    }

    private sealed class SearchEngine : ISearchEngine {
        public int Requests;

        public Task<SearchPage> Messages(string term, string? roomId,
            string? from)
        {
            Requests++;
            return Task.FromResult(new SearchPage([], null));
        }
    }

    private sealed class PagedSearch : ISearchEngine {
        public int Requests;

        private static SearchResult Hit(int i) => new(
            "$" + i, "!r", "Room", "@a", "Ann", Now, "the budget " + i);

        public Task<SearchPage> Messages(string term, string? roomId,
            string? from)
        {
            Requests++;
            return Task.FromResult(from == null
                ? new SearchPage([Hit(1), Hit(2)], "more")
                : new SearchPage([Hit(3)], null));
        }
    }

    [AvaloniaFact]
    public async Task A_next_page_of_hits_adds_hits_and_keeps_the_ones_shown()
    {
        var search = new PagedSearch();
        var (window, controller, _) = OpenList(Rooms(), searchEngine: search);
        try {
            var view = new MessageResultsView(controller, null, false);
            window.Content = view;
            window.UpdateLayout();
            view.SetTerm("budget");
            await view.Load(null);
            var shown = view.Children.Take(2).ToList();
            Assert.Equal(2, view.Results.Count);
            // The two hits and the button for more.
            Assert.Equal(3, view.Children.Count);

            await view.Load("more");
            Assert.Equal(3, view.Results.Count);
            Assert.Equal(3, view.Children.Count);
            Assert.Same(shown[0], view.Children[0]);
            Assert.Same(shown[1], view.Children[1]);
            Assert.NotSame(shown[1], view.Children[2]);

            // Drawn again with nothing new: the hits are the same controls.
            view.RefreshPresentation();
            Assert.Same(shown[0], view.Children[0]);

            // Another language or another term: other hits. Another font:
            // the same hits, which take it from the window.
            controller.SetPreferences(p => p with {
                Locale = "de"
            });
            view.RefreshPresentation();
            Assert.NotSame(shown[0], view.Children[0]);
            var german = view.Children[0];
            Fonts.Use(new Preferences {
                Font = "monospace"
            });
            view.RefreshPresentation();
            window.UpdateLayout();
            Assert.Same(german, view.Children[0]);
            Assert.Equal(Fonts.System, view.Children[0]
                .GetVisualDescendants().OfType<TextBlock>().First().FontFamily);
            var mono = view.Children[0];
            view.SetTerm("budge");
            Assert.True(view.Children.Count <= 1 ||
                        !ReferenceEquals(mono, view.Children[0]));
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task Cached_search_results_refresh_language_and_font()
    {
        var search = new SearchEngine();
        var (window, controller, list) =
            OpenList(Rooms(), searchEngine: search);
        try {
            list.Search.Text = "missing";
            var hits = list.GetVisualDescendants()
                .OfType<MessageResultsView>().Single();
            await hits.Load(null);
            var requests = search.Requests;
            controller.SetPreferences(p => p with {
                Locale = "de"
            });
            Assert.Equal(OhMatrix.Core.I18n.Strings.T("de", "search.empty"),
                hits.GetVisualDescendants().OfType<TextBlock>().Single().Text);
            controller.SetPreferences(p => p with {
                Font = "monospace"
            });
            Assert.All(hits.GetVisualDescendants().OfType<TextBlock>(),
                text => Assert.Equal(Fonts.System, text.FontFamily));
            Assert.Equal(requests, search.Requests);
            Assert.Same(hits, list.GetVisualDescendants()
                .OfType<MessageResultsView>().Single());
        } finally {
            list.Search.Text = "";
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Cached_times_refresh_when_the_local_date_changes()
    {
        var clock = new FakeTimeProvider(
            DateTimeOffset.FromUnixTimeMilliseconds(Now));
        var room = new RoomSummary {
            Id = "!time",
            Name = "Clock",
            LastActivityTs = Now
        };
        var (window, controller, list) = OpenList([room], time: clock);
        try {
            var row = Assert.IsType<RoomRow>(Assert.Single(list.Rows.Children));
            var before = row.Time;
            var child = row.Child;
            clock.Advance(TimeSpan.FromDays(1));
            controller.Store.Update(s => s with {
                Typing = ["Alice"]
            });
            Assert.NotEqual(before, row.Time);
            Assert.Equal(Format.ListTime(Now, clock.GetUtcNow(), "en"),
                row.Time);
            Assert.Same(child, row.Child);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task
        Lists_invitations_first_then_pinned_rooms_then_by_activity()
    {
        var (window, controller, engine, screen) = Open("light", 1000);
        await SignedIn(controller, engine);
        var ids = screen.List.Rows.Children.Cast<RoomRow>()
            .Select(r => r.RoomId).ToArray();
        Assert.Equal(["!e", "!c", "!a", "!b", "!d"], ids);
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
        string T(string key,
            params ReadOnlySpan<OhMatrix.Core.I18n.Arg> v)
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
