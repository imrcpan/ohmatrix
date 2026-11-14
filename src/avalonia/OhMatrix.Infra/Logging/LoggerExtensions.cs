namespace OhMatrix.Infra.Logging;

/// <summary>
/// The lines of an error that was caught, by what the log needs of it. An error
/// that is expected, or that the caller already shows, is logged with its
/// message only (<see cref="Caught"/>); one that is unknown, or from a
/// catch-all that could hide a bug, is logged with its stack
/// (<see cref="Unexpected"/>). An error that needs no line at all is not
/// logged.
/// </summary>
public static class LoggerExtensions {
    /// <summary>An error that was caught and is known: the message says what it was.</summary>
    public static void Caught(this ILogger logger, string what, Exception e)
    {
        logger.Warn($"{what} failed: {e.GetType().Name}: {e.Message}");
    }

    /// <summary>An error that was caught and is not expected: its stack is logged too.</summary>
    public static void Unexpected(this ILogger logger, string what,
        Exception e)
    {
        logger.Error($"{what} failed, unexpectedly:\n{e}");
    }
}
