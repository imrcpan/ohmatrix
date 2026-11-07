using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Platform;
using OhMatrix.Core;
using OhMatrix.Core.State;
using OhMatrix.Core.Storage;
using OhMatrix.Core.Ui;

namespace OhMatrix.Desktop;

public class App : Application {
    public override void Initialize()
    {
        AppStyles.Apply(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop) {
            var data = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "OhMatrix"
            );
            AccountManager? manager = null;
            // Each account has its own folder, engines and controller; the preferences are shared.
            AppController Create(string dir)
            {
                var (auth, rooms, chats, media, profiles, devices, links, security, verification,
                        calls, stickers, search) = Engines.Create(dir);
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
                    new DesktopNotifier(() => desktop.MainWindow?.IsActive == true, id => {
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
                    search
                );
            }

            manager = new AccountManager(data, Create, new FileAccountsStore(data));
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
                    () => PlatformSettings?.GetColorValues().ThemeVariant switch {
                        PlatformThemeVariant.Dark => true,
                        PlatformThemeVariant.Light => false,
                        _ => null,
                    }
                );
                desktop.MainWindow.Content = root;
            }
        }

        base.OnFrameworkInitializationCompleted();
    }
}
