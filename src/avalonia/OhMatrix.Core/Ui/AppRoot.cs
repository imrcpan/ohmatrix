using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The root of the app (<c>Root</c> of <c>App.tsx</c>): sets the theme and the zoom for everything below, and shows what the sign-in status asks
/// for: a spinner while the saved session is being restored, the sign-in page when signed out, the main page when signed in.
/// </summary>
public sealed class AppRoot : Border {
    private readonly AppController controller;
    private readonly string defaultHomeserver;
    private readonly Func<bool?> systemDark;
    private readonly LayoutTransformControl zoom = new();
    private readonly Border host = new();
    private AuthStatus? shown;
    private Control? page;

    public AppRoot(AppController controller, string defaultHomeserver, Func<bool?> systemDark)
    {
        this.controller = controller;
        this.defaultHomeserver = defaultHomeserver;
        this.systemDark = systemDark;
        zoom.Child = host;
        Child = zoom;
        controller.Store.Changed += _ => Apply();
        Apply();
    }

    /// <summary>The page being shown (a sign-in page, a spinner...).</summary>
    public Control? Page => page;

    public void Apply()
    {
        var s = controller.Store.Value;
        var colors = Themes.Resolve(s.Prefs.Theme, systemDark()).Colors;
        ThemeScope.SetColors(this, colors);
        Background = new SolidColorBrush(colors.Bg);
        var scale = s.ZoomTrial?.To ?? s.Prefs.UiScale;
        zoom.LayoutTransform = scale == 1 ? null : new ScaleTransform(scale, scale);
        if (shown == s.Auth)
            return;
        shown = s.Auth;
        // Signing in is the sign-in page still, working: swapping it would lose what was typed.
        if (s.Auth == AuthStatus.SigningIn && page is LoginScreen)
            return;
        page = s.Auth switch {
            AuthStatus.Booting => new Spinner {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            },
            AuthStatus.SignedIn => new MainScreen(controller),
            _ => page is LoginScreen ? page : new LoginScreen(controller, defaultHomeserver),
        };
        host.Child = page;
    }
}
