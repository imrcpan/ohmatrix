namespace OhMatrix.Infra.Logging;

public static class LoggerExtensions {
    /// <summary>An error that was caught and is known: the message says what it was.</summary>
    public static void Exception(this ILogger logger,
        string what, Exception e)
    {
        logger.Warn($"{what} Error: {e.Message}");
    }

    /// <summary>An error that was caught and is not expected: its stack is logged too.</summary>
    public static void Unexpected(this ILogger logger,
        string what, Exception e)
    {
        logger.Error($"{what} Unexpected Error: {e}");
    }
}
