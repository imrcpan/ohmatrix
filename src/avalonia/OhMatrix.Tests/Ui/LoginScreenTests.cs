using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Microsoft.Extensions.Time.Testing;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class LoginScreenTests {
    private sealed class ScriptedEngine : IAuthEngine {
        public EngineErrorCode? Fail;
        public readonly List<string> Calls = [];

        public Task<Session> LoginWithPassword(string homeserver,
            string username, string password)
        {
            Calls.Add($"login {homeserver} {username} {password}");
            return Fail is { } code
                ? Task.FromException<Session>(
                    new EngineException(code, "raw " + code))
                : Task.FromResult(new Session(homeserver, "@" + username, "D",
                    "T"));
        }

        public Task<Session> Register(string homeserver, string username,
            string password,
            string? token)
        {
            Calls.Add($"register {homeserver} {username} {password} {token}");
            return Fail is { } code
                ? Task.FromException<Session>(
                    new EngineException(code, "raw " + code))
                : Task.FromResult(new Session(homeserver, "@" + username, "D",
                    "T"));
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

    private static (Window Window, LoginScreen Screen, AppController Controller,
        ScriptedEngine
        Engine,
        FakeTimeProvider Time) Open(string theme = "light",
            string locale = "en")
    {
        var engine = new ScriptedEngine();
        var time = new FakeTimeProvider();
        var controller =
            new AppController(engine, new NoSessions(), null, time);
        controller.SetPreferences(p => p with {
            Locale = locale
        });
        var screen = new LoginScreen(controller, "matrix.org", null, time);
        var window = new Window {
            Content = screen,
            Width = 420,
            Height = 760
        };
        ThemeScope.SetColors(window, Themes.Get(theme)!.Colors);
        window.Show();
        window.UpdateLayout();
        return (window, screen, controller, engine, time);
    }

    private static void Settle()
    {
        Dispatcher.UIThread.RunJobs();
    }

    private static void Save(Window window, string name)
    {
        var path = Environment.GetEnvironmentVariable("OHMATRIX_LOGIN_SHEET");
        if (string.IsNullOrEmpty(path))
            return;
        window.UpdateLayout();
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        frame.Save(path.Replace(".png", $"-{name}.png"),
            new PngBitmapEncoderOptions());
    }

    [AvaloniaFact]
    public void Starts_with_the_default_server_and_a_disabled_button()
    {
        var (window, screen, _, _, _) = Open();
        Assert.Equal("matrix.org", screen.HomeserverField.Text);
        Assert.True(screen.SubmitButton.Disabled);
        Assert.False(screen.ConfirmField.IsVisible);
        Assert.Equal("Sign in", screen.SubmitButton.Title);
        Save(window, "light");
    }

    [AvaloniaFact]
    public void Offers_the_server_used_last()
    {
        var engine = new ScriptedEngine();
        var controller = new AppController(engine, new NoSessions());
        controller.SetPreferences(p => p with {
            LastHomeserver = "example.org"
        });
        Assert.Equal("example.org",
            new LoginScreen(controller, "matrix.org").HomeserverField.Text);
    }

    [AvaloniaFact]
    public void Dark_theme_renders()
    {
        var (window, screen, _, _, _) = Open("dark");
        screen.UsernameField.Text = "alice";
        screen.PasswordField.Text = "secret";
        Save(window, "dark");
    }

    [AvaloniaFact]
    public void Signs_in_with_trimmed_values()
    {
        var (_, screen, _, engine, _) = Open();
        screen.HomeserverField.Text = " matrix.org ";
        screen.UsernameField.Text = " alice ";
        screen.PasswordField.Text = " secret";
        Assert.False(screen.SubmitButton.Disabled);
        screen.PasswordField.RaiseSubmit();
        Settle();
        Assert.Equal(["login matrix.org alice  secret"], engine.Calls);
    }

    [AvaloniaFact]
    public void Creating_asks_for_confirmation_and_checks_it()
    {
        var (window, screen, _, engine, _) = Open();
        screen.ToggleButton.RaiseClick();
        Assert.True(screen.Creating);
        Assert.True(screen.ConfirmField.IsVisible);
        Assert.True(screen.TokenField.IsVisible);
        screen.UsernameField.Text = "alice";
        screen.PasswordField.Text = "secret";
        Assert.True(screen.SubmitButton.Disabled);
        screen.ConfirmField.Text = "other";
        Assert.True(screen.Mismatch);
        Assert.True(screen.SubmitButton.Disabled);
        Save(window, "mismatch");
        screen.ConfirmField.Text = "secret";
        Assert.False(screen.Mismatch);
        Assert.False(screen.SubmitButton.Disabled);
        screen.TokenField.Text = " tok ";
        screen.ConfirmField.RaiseSubmit();
        Settle();
        Assert.Equal(["register matrix.org alice secret tok"], engine.Calls);
        Save(window, "creating");
    }

    [AvaloniaTheory]
    [InlineData(EngineErrorCode.Network, false,
        "Cannot reach matrix.org. Check how the address is spelled and your network connection.")]
    [InlineData(EngineErrorCode.Unauthorized, false,
        "Wrong username or password.")]
    [InlineData(EngineErrorCode.Forbidden, false,
        "Wrong username or password.")]
    [InlineData(EngineErrorCode.Conflict, false,
        "This account has already been added.")]
    [InlineData(EngineErrorCode.Unknown, false, "raw Unknown")]
    [InlineData(EngineErrorCode.Conflict, true,
        "That username is taken. Choose another.")]
    [InlineData(EngineErrorCode.Forbidden, true,
        "This server does not allow new accounts to be created here.")]
    [InlineData(EngineErrorCode.TokenRequired, true,
        "This server creates accounts only with a registration token. Enter it below.")]
    [InlineData(EngineErrorCode.TokenInvalid, true,
        "That registration token is not valid, or has been used up.")]
    public void Words_the_error(EngineErrorCode code, bool creating,
        string expected)
    {
        var (window, screen, controller, engine, _) = Open();
        if (creating)
            screen.ToggleButton.RaiseClick();
        engine.Fail = code;
        _ = creating
            ? controller.Register("matrix.org", "alice", "secret", null)
            : controller.Login("matrix.org", "alice", "secret");
        Settle();
        Assert.Equal(expected, screen.ErrorMessage);
        Save(window, "error-" + code + creating);
    }

    [AvaloniaFact]
    public void Language_menu_lists_languages_and_switches()
    {
        var (window, screen, controller, _, _) = Open();
        screen.LanguageButton.RaiseClick();
        Assert.True(screen.LanguageMenu.IsOpen);
        var labels = screen.LanguageMenu.Rows.Count;
        Assert.True(labels > 10);
        Save(window, "languages");
        screen.LanguageMenu.Close();
        controller.SetPreferences(p => p with {
            Locale = "zh-CN"
        });
        Assert.Equal("简体中文", screen.LanguageButton.Text);
        Assert.NotEqual("Sign in", screen.SubmitButton.Title);
        Save(window, "chinese");
    }

    [AvaloniaFact]
    public void Zoom_menu_tries_a_size_and_the_dialog_counts_down()
    {
        var (window, screen, controller, _, time) = Open();
        Assert.Equal("100%", screen.ZoomButton.Text);
        screen.ZoomButton.RaiseClick();
        Assert.True(screen.ZoomMenu.IsOpen);
        Save(window, "zoom-menu");
        controller.TryZoom(1.5);
        Assert.True(screen.ZoomDialog.IsOpen);
        Save(window, "zoom-dialog");
        controller.KeepZoom();
        Assert.False(screen.ZoomDialog.IsOpen);
        Assert.Equal("150%", screen.ZoomButton.Text);
        controller.TryZoom(1);
        Assert.True(screen.ZoomDialog.IsOpen);
        time.Advance(AppController.ZoomTrialTime + TimeSpan.FromSeconds(1));
        Settle();
        Assert.False(screen.ZoomDialog.IsOpen);
        Assert.Equal("150%", screen.ZoomButton.Text);
    }
}
