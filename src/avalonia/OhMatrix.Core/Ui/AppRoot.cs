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
    private AppController controller;
    private readonly AccountManager? accounts;
    private readonly string defaultHomeserver;
    private readonly Func<bool?> systemDark;
    private readonly LayoutTransformControl zoom = new();
    private readonly Border host = new();
    private AuthStatus? shown;
    private Control? page;

    public AppRoot(AppController controller, string defaultHomeserver,
        Func<bool?> systemDark)
    {
        this.controller = controller;
        this.defaultHomeserver = defaultHomeserver;
        this.systemDark = systemDark;
        zoom.Child = host;
        Child = zoom;
        controller.Store.Changed += OnStore;
        Apply();
    }

    /// <summary>The root of an app with several accounts: it shows the one in use, and what is shown follows when another is.</summary>
    public AppRoot(AccountManager accounts, string defaultHomeserver,
        Func<bool?> systemDark)
        : this(accounts.Current, defaultHomeserver, systemDark)
    {
        this.accounts = accounts;
        accounts.Changed += () =>
            Avalonia.Threading.Dispatcher.UIThread.Post(Rebind);
    }

    private void Rebind()
    {
        if (accounts is null || ReferenceEquals(accounts.Current, controller))
            return;
        controller.Store.Changed -= OnStore;
        controller = accounts.Current;
        controller.Store.Changed += OnStore;
        shown = null;
        page = null;
        Apply();
    }

    private void OnStore(AppState _) => Apply();

    /// <summary>The main page with the page of a share over it, which shows only while something waits to be shared.</summary>
    private Control WithShare(Control main)
    {
        var share = new SharePage(controller);
        var layers = new Grid();
        layers.Children.Add(main);
        layers.Children.Add(share);
        return layers;
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
        zoom.LayoutTransform =
            scale == 1 ? null : new ScaleTransform(scale, scale);
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
            _ => page is LoginScreen
                ? page
                : new LoginScreen(controller, defaultHomeserver,
                    accounts is { Adding: true, Accounts.Count: > 0 }
                        ? (OhMatrix.Core.I18n.Strings.T(s.Locale, "cancel"),
                            accounts.CancelAdd)
                        : null),
        };
        host.Child = page is MainScreen ? WithShare(page) : page;
    }
}
