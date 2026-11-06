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

    private sealed class Profiles : IProfileEngine {
        public Task<Profile> Load()
        {
            return Task.FromResult(new Profile("@me", "Mia Example", null));
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

        public Task AcceptInvite(string roomId) => Log("accept " + roomId);
        public Task DeclineInvite(string roomId) => Log("decline " + roomId);
        public Task SetPinned(string roomId, bool pinned) => Log($"pin {roomId} {pinned}");
        public Task SetMuted(string roomId, bool muted) => Log($"mute {roomId} {muted}");
        public Task SetMarkedUnread(string roomId, bool unread) => Log($"unread {roomId} {unread}");
        public Task MarkRoomRead(string roomId) => Log("read " + roomId);

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

    private static async Task<(Window Window, AppController Controller, Engine Engine, MainScreen
            Screen)>
        Open(string theme, double width)
    {
        var engine = new Engine();
        var controller = new AppController(engine, new NoSessions(), null, null, engine, engine,
            new Media(), new Profiles());
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
                LastActivityTs = Now
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
        Assert.Equal(8, controller.Store.Value.Timeline.Count);
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
    public async Task The_profile_page_signs_out_after_asking()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        var page = screen.Profile;
        Assert.Same(page, ((Border)screen.Children[0]).Child);
        Save(window, "profile");
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
        Assert.Equal(3, screen.List.AddMenu.Rows.Count);
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
        Assert.Equal(1 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
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
        Assert.Equal(1 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
        pane.OpenActions(pane.Messages, tl.First(i => i.Id == "3"));
        Assert.Equal(3 + ChatPane.QuickReactions.Length, pane.Actions.Rows.Count);
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
        // The Delete row is the third of the menu: Reply, Edit, Delete.
        var row = (Border)pane.Actions.Rows[2];
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
    public async Task Zoom_is_set_from_the_profile_page_with_the_keep_dialog()
    {
        var (window, controller, _, screen) = await Open("light", 1000);
        controller.OpenSidebarPage(SidebarPage.Profile);
        Dispatcher.UIThread.RunJobs();
        var page = screen.Profile;
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
