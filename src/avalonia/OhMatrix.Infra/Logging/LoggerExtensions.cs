namespace OhMatrix.Infra.Logging;

public static class LoggerExtensions {
    // name:
    // such as "ThemeManager", "MatrixClient", "WebRequest", etc.
    // not "themeManager" not "theme manager"
    public static void Exception(this ILogger logger,
        string name, Exception e)
    {
        logger.Warn($"{name} Error: {e.Message}");
    }

    // name:
    // such as "ThemeManager", "MatrixClient", "WebRequest", etc.
    // not "themeManager" not "theme manager"
    public static void Unexpected(this ILogger logger,
        string name, Exception e)
    {
        logger.Error($"{name} Unexpected Error: {e}");
    }
}
