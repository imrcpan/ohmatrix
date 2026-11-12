using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Infra.Logging;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class AppRootTests {
    private static readonly Logger logger = Logger.GetDefault();

    private sealed class Engine : IAuthEngine {
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
    }

    private static string Directory_()
    {
        var dir = Path.Combine(Path.GetTempPath(),
            "ohm-root-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        return dir;
    }

    [AvaloniaFact]
    public async Task Follows_the_sign_in_status()
    {
        var dir = Directory_();
        var controller = new AppController(
            new Engine(),
            new FileSessionStore(dir),
            new FilePreferencesStore(dir)
        );
        var root = new AppRoot(controller, "matrix.org", () => false);
        Assert.IsType<OhMatrix.Core.Ui.Spinner>(root.Page);
        await controller.Bootstrap();
        Assert.IsType<LoginScreen>(root.Page);
        await controller.Login("matrix.org", "alice", "pw");
        Assert.IsType<MainScreen>(root.Page);
        await controller.Logout();
        Assert.IsType<LoginScreen>(root.Page);
    }

    [AvaloniaFact]
    public async Task The_session_survives_a_restart()
    {
        var dir = Directory_();
        var first = new AppController(new Engine(), new FileSessionStore(dir),
            new FilePreferencesStore(dir));
        await first.Bootstrap();
        await first.Login("matrix.org", "alice", "pw");
        first.SetPreferences(p => p with {
            Theme = "dark",
            UiScale = 1.5
        });
        await Task.Delay(100);
        var second = new AppController(new Engine(), new FileSessionStore(dir),
            new FilePreferencesStore(dir));
        await second.Bootstrap();
        Assert.Equal(AuthStatus.SignedIn, second.Store.Value.Auth);
        Assert.Equal("@alice", second.Store.Value.UserId);
        Assert.Equal("dark", second.Store.Value.Prefs.Theme);
        Assert.Equal(1.5, second.Store.Value.Prefs.UiScale);
    }

    [AvaloniaFact]
    public async Task Theme_and_zoom_reach_the_pages()
    {
        var controller = new AppController(new Engine(),
            new FileSessionStore(Directory_()));
        var root = new AppRoot(controller, "matrix.org", () => true);
        await controller.Bootstrap();
        Assert.Equal(Themes.Resolve("dark", null).Colors.Bg,
            ThemeScope.GetColors(root).Bg);
        controller.TryZoom(2);
        var zoom = (LayoutTransformControl)root.Child!;
        Assert.Equal(2, ((ScaleTransform)zoom.LayoutTransform!).ScaleX);
    }

    // The lines of the log written since the marker.
    private static List<string> LoggedAfter(string marker)
    {
        var log = OhMatrix.Core.State.LogLine
            .Parse(logger.ReadLog())
            .Select(l => l.Text).ToList();
        return log[(log.LastIndexOf(marker) + 1)..];
    }

    [AvaloniaTheory]
    [InlineData(true, "Dark")]
    [InlineData(false, "Light")]
    [InlineData(null, "Unknown")]
    public void The_log_says_the_system_theme_is_followed_and_what_it_is(
        bool? dark, string told)
    {
        logger
            .Info("marker system " + told);
        var controller = new AppController(new Engine(),
            new FileSessionStore(Directory_()));
        _ = new AppRoot(controller, "matrix.org", () => dark);
        Assert.Equal([
            "No theme set in config. Follow system default.",
            "Detect system theme: " + told,
        ], LoggedAfter("marker system " + told));
    }

    [AvaloniaFact]
    public async Task The_log_says_a_theme_of_the_preferences_is_used()
    {
        var dir = Directory_();
        var first = new AppController(new Engine(), new FileSessionStore(dir),
            new FilePreferencesStore(dir));
        first.SetPreferences(p => p with {
            Theme = "dark"
        });
        await Task.Delay(100);
        logger.Info("marker chosen");
        var controller = new AppController(new Engine(),
            new FileSessionStore(dir), new FilePreferencesStore(dir));
        await controller.Bootstrap();
        _ = new AppRoot(controller, "matrix.org", () => false);
        // The system is not asked about, nor told of.
        Assert.Equal(["Use theme dark."], LoggedAfter("marker chosen"));
    }
}
