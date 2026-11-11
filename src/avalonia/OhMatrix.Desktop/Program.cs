using Avalonia;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Desktop;

class Program {
    [STAThread]
    public static void Main(string[] args)
    {
        var data = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder
                .ApplicationData),
            "OhMatrix");
        var logger = new Logger(pathBase: data);
        logger.Init();
        Logger.SetDefault(logger);
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .LogToTrace();
}
