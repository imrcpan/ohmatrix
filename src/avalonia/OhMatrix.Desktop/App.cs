using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using OhMatrix.Core;
using OhMatrix.Core.State;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Ui;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Desktop;

public class App : Application {
    private static readonly Logger logger = Logger.GetDefault();

    public override void Initialize()
    {
        AppStyles.Apply(this);
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
            desktop.MainWindow = new Window {
                Title = "OhMatrix",
                Width = 1000,
                Height = 700,
                MinWidth = 360,
                MinHeight = 480,
            };
            _ = Start();

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
