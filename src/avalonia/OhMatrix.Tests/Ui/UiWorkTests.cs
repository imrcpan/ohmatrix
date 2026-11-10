using Avalonia.Headless.XUnit;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

// Helpers on paths that run for every row, every message and every change of
// the store: what they give has to stay what it was.
public class UiWorkTests {
    private sealed class Auth : IAuthEngine {
        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password) => Task.FromResult(
            new Session(homeserver, "@" + username, "D", "T"));

        public Task<Session> Register(string homeserver, string username,
            string password, string? token) =>
            LoginWithPassword(homeserver, username, password);

        public Task Restore(Session session) => Task.CompletedTask;
        public Task Logout() => Task.CompletedTask;
    }

    [AvaloniaFact]
    public async Task
        The_root_makes_its_brush_and_zoom_again_only_when_they_change()
    {
        var dir = Path.Combine(Path.GetTempPath(),
            "ohm-work-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var controller = new AppController(new Auth(),
            new FileSessionStore(dir), new FilePreferencesStore(dir));
        var dark = false;
        var root = new AppRoot(controller, "matrix.org", () => dark);
        await controller.Login("matrix.org", "alice", "pw");
        var brush = root.Background;
        var colors = ThemeScope.GetColors(root);

        // Many changes of the store that are not a theme or a zoom.
        for (var i = 0; i < 10; i++)
            controller.Store.Update(s => s with {
                Typing = [$"user {i}"]
            });
        Assert.Same(brush, root.Background);

        // Another theme is another brush with its colours.
        controller.SetPreferences(p => p with {
            Theme = "dark"
        });
        Assert.NotSame(brush, root.Background);
        Assert.NotEqual(colors, ThemeScope.GetColors(root));
        var darkBrush = root.Background;
        controller.Store.Update(s => s with {
            Typing = []
        });
        Assert.Same(darkBrush, root.Background);

        // The system's dark mode matters for the system theme.
        controller.SetPreferences(p => p with {
            Theme = Themes.System
        });
        var light = root.Background;
        var lightColors = ThemeScope.GetColors(root);
        dark = true;
        controller.Store.Update(s => s with {
            Typing = ["x"]
        });
        Assert.NotSame(light, root.Background);
        Assert.NotEqual(lightColors, ThemeScope.GetColors(root));
        await Task.CompletedTask;
    }
}
