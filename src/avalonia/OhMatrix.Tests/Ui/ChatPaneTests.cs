using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
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

        public Task Send(string text)
        {
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
                    Body =
                        "Are we still on for the demo tomorrow? I can bring the slides and a few more details about the plan.",
                    SenderId = "@alice",
                    SenderName = "Alice",
                    Ts = Now - 86400_000 + 60_000,
                },
                new TimelineItem {
                    Id = "3",
                    Body = "Yes!",
                    SenderId = "@me",
                    IsOwn = true,
                    Ts = Now - 86400_000 + 120_000,
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
        var controller = new AppController(engine, new NoSessions(), null, null, engine, engine);
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
        Assert.Equal(7, controller.Store.Value.Timeline.Count);
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

    private static ChatPane FindPane(MainScreen screen)
    {
        return (ChatPane)screen.Wide;
    }
}
