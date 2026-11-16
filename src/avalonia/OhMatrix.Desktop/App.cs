using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using OhMatrix.Core;
using OhMatrix.Core.State;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Ui.Shell;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Desktop;

public class App : Application {
    private static readonly Logger logger = Logger.GetDefault();

    public override void Initialize()
    {
        AppStyles.Apply(this);
#if DEBUG
        this.AttachDeveloperTools();
#endif
    }

    private static void ShowWindow(Window? window)
    {
        if (window == null)
            return;
        window.Show();
        window.WindowState = WindowState.Normal;
        window.Activate();
    }

    // The language of the window once an account is showing; until then (the
    // accounts are still being read) the one of the system.
    private static string Language(AccountManager manager)
    {
        try {
            return manager.Current.Store.Value.Locale;
        } catch (InvalidOperationException) {
            return Strings.DetectLocale(
                System.Globalization.CultureInfo.CurrentUICulture.Name);
        }
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime
            desktop) {
            var data = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder
                    .ApplicationData),
                "OhMatrix"
            );
            AccountManager? manager = null;

            // Each account has its own folder, engines and controller; the preferences are shared.
            AppController Create(string dir)
            {
                var (auth, rooms, chats, media, profiles, devices, links,
                    security, verification,
                    calls, stickers, search, spaces) = Engines.Create(dir);
                return new AppController(
                    auth,
                    new FileSessionStore(dir),
                    new FilePreferencesStore(data),
                    null,
                    rooms,
                    chats,
                    media,
                    profiles,
                    devices,
                    links,
                    security,
                    new DesktopNotifier(
                        () => desktop.MainWindow?.IsActive == true, id => {
                            Avalonia.Threading.Dispatcher.UIThread.Post(() => {
                                desktop.MainWindow?.Activate();
                                manager?.Current.SelectRoom(id);
                            });
                        }),
                    verification,
                    calls,
                    new OhMatrix.Core.Calls.Gst.GstCallPlatform(),
                    new OhMatrix.Core.Calls.VlcCallSounds(),
                    stickers,
                    search,
                    spaces
                );
            }

            manager =
                new AccountManager(data, Create, new FileAccountsStore(data));
            AppRoot? root = null;
            // The icon is there from the start, also on the sign-in page; it
            // is what brings the window back, so it must not wait for a sync.
            TrayIcon? tray = null;
            tray = new TrayIcon(this, () => Language(manager),
                () => ShowWindow(desktop.MainWindow), () => Quit());
            // The window's close only hides it: the app keeps running in the
            // notification area, and Quit there (or an OS shutdown) ends it.
            desktop.ShutdownMode = ShutdownMode.OnExplicitShutdown;
            var quitting = false;

            void Quit()
            {
                quitting = true;
                tray?.Dispose();
                desktop.Shutdown();
            }

            desktop.MainWindow = new Window {
                Title = "OhMatrix",
                Width = 1000,
                Height = 700,
                MinWidth = 360,
                MinHeight = 480,
                // Until the theme is known the window is dark, not white and
                // not black; the dark theme's own background.
                Background = new Avalonia.Media.SolidColorBrush(
                    Avalonia.Media.Color.Parse("#141414")),
            };
            desktop.MainWindow.Closing += (_, e) => {
                // Only the cross of the window (and Alt+F4) hides it, and only
                // once the icon is there to bring it back; a shutdown of the
                // app or of the system is let through.
                if (quitting ||
                    e.CloseReason != WindowCloseReason.WindowClosing)
                    return;
                e.Cancel = true;
                // Hidden once this close has returned: a window hidden inside
                // its own closing is not taken back by a later Show.
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                    desktop.MainWindow.Hide());
            };
            AppController? watched = null;
            _ = Start();

            void WatchLabels()
            {
                var now = manager.Current;
                if (ReferenceEquals(now, watched))
                    return;
                watched = now;
                now.Store.Changed += _ => tray?.Labels();
            }

            async Task Start()
            {
                await manager.Start();
                root = new AppRoot(
                    manager,
                    "matrix.org",
                    () => PlatformSettings?.GetColorValues().ThemeVariant
                        switch {
                            PlatformThemeVariant.Dark => true,
                            PlatformThemeVariant.Light => false,
                            _ => null,
                        }
                );
                desktop.MainWindow.Content = root;
                // The labels follow the language of the window, also when the
                // account changes.
                manager.Changed += () => WatchLabels();
                WatchLabels();
                // The system can change its theme while the app runs, and can
                // answer late: both are told, and the root draws again.
                var settings = PlatformSettings;
                if (settings != null)
                    settings.ColorValuesChanged += (_, e) => {
                        logger.Info(
                            $"System theme changed: {e.ThemeVariant}");
                        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                            root?.Apply());
                    };
                // Files named on the command line, or dropped on the window, are offered to be shared to chats.
                var named = (desktop.Args ?? []).Where(File.Exists)
                    .Select(Path.GetFullPath).ToList();
                if (named.Count > 0)
                    manager.Current.SetIncomingShare(
                        new OhMatrix.Core.Model.SharedContent(null, named));
                Avalonia.Input.DragDrop.SetAllowDrop(desktop.MainWindow, true);
                desktop.MainWindow.AddHandler(Avalonia.Input.DragDrop.DropEvent,
                    (_, e) => {
                        var paths = Avalonia.Input.DataTransferExtensions
                            .TryGetFiles(e.DataTransfer)?
                            .Select(f =>
                                Avalonia.Platform.Storage
                                    .StorageProviderExtensions
                                    .TryGetLocalPath(f)).OfType<string>()
                            .ToList();
                        if (paths is { Count: > 0 })
                            manager.Current.SetIncomingShare(
                                new OhMatrix.Core.Model.SharedContent(null,
                                    paths));
                    });
            }
        }

        base.OnFrameworkInitializationCompleted();
    }
}
