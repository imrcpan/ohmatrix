using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Rooms;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Infra.Logging;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The root of the app (<c>Root</c> of <c>App.tsx</c>): sets the theme and the zoom for everything below, and shows what the sign-in status asks
/// for: a spinner while the saved session is being restored, the sign-in page when signed out, the main page when signed in.
/// </summary>
public sealed class AppRoot : Border {
    private static readonly Logger logger = Logger.GetDefault();

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
        if (accounts == null || ReferenceEquals(accounts.Current, controller))
            return;
        controller.Store.Changed -= OnStore;
        // The pages of the account left are thrown away: they let go of its
        // store, or it keeps them and feeds them for good.
        Lifetime.Release(host.Child);
        host.Child = null;
        controller = accounts.Current;
        controller.Store.Changed += OnStore;
        shown = null;
        appliedTheme = null;
        appliedDark = null;
        appliedScale = null;
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

    // The theme and the zoom are set again only when they are other ones: the
    // store changes for every message, and the brush and the transform were
    // made each time.
    private string? appliedTheme;
    private bool? appliedDark;
    private double? appliedScale;

    // Which theme is used and why: a theme chosen in the preferences is
    // used as it is; otherwise the system is followed, and what the system
    // said is told as well.
    private static void LogTheme(string theme, bool? dark)
    {
        if (theme != Themes.System) {
            logger.Info($"Use theme {theme}.");
            return;
        }

        logger.Info("No theme set in config. Follow system default.");
        logger.Info($"Detect system theme: {SystemTheme(dark)}");
    }

    private static string SystemTheme(bool? dark) => dark switch {
        true => "Dark",
        false => "Light",
        _ => "Unknown",
    };

    public void Apply()
    {
        var s = controller.Store.Value;
        var dark = systemDark();
        if (appliedTheme != s.Prefs.Theme || appliedDark != dark) {
            appliedTheme = s.Prefs.Theme;
            appliedDark = dark;
            LogTheme(s.Prefs.Theme, dark);
            var colors = Themes.Resolve(s.Prefs.Theme, dark).Colors;
            ThemeScope.SetColors(this, colors);
            Background = new SolidColorBrush(colors.Bg);
        }

        var scale = s.ZoomTrial?.To ?? s.Prefs.UiScale;
        if (appliedScale != scale) {
            appliedScale = scale;
            zoom.LayoutTransform =
                scale == 1 ? null : new ScaleTransform(scale, scale);
        }

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
        // What was shown and is not any more lets go.
        var before = host.Child;
        host.Child = page is MainScreen ? WithShare(page) : page;
        if (!ReferenceEquals(before, host.Child) && before != null &&
            !ReferenceEquals(before, page))
            Lifetime.Release(before);
    }
}
