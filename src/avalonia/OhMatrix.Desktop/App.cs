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
            var (auth, rooms, chats, media, profiles, devices, links, security) =
                Engines.Create(data);
            var controller = new AppController(
                auth,
                new FileSessionStore(data),
                new FilePreferencesStore(data),
                null,
                rooms,
                chats,
                media,
                profiles,
                devices,
                links,
                security,
                new DesktopNotifier(() => desktop.MainWindow?.IsActive == true)
            );
            var root = new AppRoot(
                controller,
                "matrix.org",
                () => PlatformSettings?.GetColorValues().ThemeVariant switch {
                    PlatformThemeVariant.Dark => true,
                    PlatformThemeVariant.Light => false,
                    _ => null,
                }
            );
            desktop.MainWindow = new Window {
                Title = "OhMatrix",
                Width = 1000,
                Height = 700,
                MinWidth = 360,
                MinHeight = 480,
                Content = root,
            };
            _ = controller.Bootstrap();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
