using System.Runtime.CompilerServices;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Tests;

/// <summary>
/// The tests run with a default logger that writes to a folder of its own, as the program does at its start (the code that logs asks for the
/// default one and it throws when there is none).
/// </summary>
internal static class TestLogger {
    public static string Folder { get; } = Path.Combine(Path.GetTempPath(),
        "ohm-log-" + Guid.NewGuid().ToString("N"));

    [ModuleInitializer]
    internal static void Start()
    {
        var logger = new Logger(pathBase: Folder);
        logger.Init();
        Logger.SetDefault(logger);
    }
}
