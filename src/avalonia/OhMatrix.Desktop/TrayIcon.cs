using Avalonia;
using Avalonia.Controls;
using Avalonia.Platform;
using OhMatrix.Core.I18n;

namespace OhMatrix.Desktop;

/// <summary>
/// The icon of the notification area (<c>TrayIcon</c>). A press on the icon shows the window again; its menu has the one way to quit the app.
/// Closing the window only hides it, so the app keeps running here until Quit is chosen.
/// </summary>
internal sealed class TrayIcon : IDisposable {
    private readonly Avalonia.Controls.TrayIcon icon;
    private readonly NativeMenuItem show;
    private readonly NativeMenuItem quit;
    private readonly Func<string> locale;
    private readonly Action showWindow;
    private readonly Action quitApp;
    private string? shown;

    /// <param name="locale">The language the labels are in, read each time they are set.</param>
    /// <param name="showWindow">Brings the window back.</param>
    /// <param name="quitApp">Quits the app for good.</param>
    /// <param name="app">The application the icon belongs to.</param>
    public TrayIcon(Application app, Func<string> locale, Action showWindow,
        Action quitApp)
    {
        this.locale = locale;
        this.showWindow = showWindow;
        this.quitApp = quitApp;
        // The labels are given when the items are made: a header cannot be
        // set once the tray is started, and it is not started yet here.
        var lang = locale();
        shown = lang;
        show = new NativeMenuItem {
            Header = Strings.T(lang, "tray.show"),
        };
        show.Click += (_, _) => this.showWindow();
        quit = new NativeMenuItem {
            Header = Strings.T(lang, "tray.quit"),
        };
        quit.Click += (_, _) => this.quitApp();
        icon = new Avalonia.Controls.TrayIcon {
            Icon = new WindowIcon(AssetLoader.Open(
                new Uri("avares://OhMatrix.Desktop/Assets/tray.png"))),
            ToolTipText = "OhMatrix",
            Menu = new NativeMenu {
                Items = {
                    show,
                    new NativeMenuItemSeparator(),
                    quit
                },
            },
            IsVisible = true,
        };
        icon.Clicked += (_, _) => this.showWindow();
        // The icons belong to the application, which keeps them in the
        // notification area for as long as it runs.
        Avalonia.Controls.TrayIcon.SetIcons(app, [icon]);
    }

    /// <summary>
    /// Sets the labels of the menu in the language now chosen. Nothing is
    /// done when that language is the one already shown.
    /// </summary>
    public void Labels()
    {
        var lang = locale();
        if (lang == shown)
            return;
        shown = lang;
        show.Header = Strings.T(lang, "tray.show");
        quit.Header = Strings.T(lang, "tray.quit");
    }

    public void Dispose()
    {
        icon.Dispose();
    }
}
