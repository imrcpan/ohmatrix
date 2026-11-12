using Avalonia;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Desktop;

class Program {
    // "OhMatrix" in letters of characters, written to the log at start.
    private const string Banner = """
                                    ___  _     __  __       _        _
                                   / _ \| |__ |  \/  | __ _| |_ _ __(_)_  __
                                  | | | | '_ \| |\/| |/ _` | __| '__| \ \/ /
                                  | |_| | | | | |  | | (_| | |_| |  | |>  <
                                   \___/|_| |_|_|  |_|\__,_|\__|_|  |_/_/\_\
                                  """;

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
        logger.Info("\n" + Banner + "\n");
        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .LogToTrace();
}
