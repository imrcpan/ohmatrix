using OhMatrix.Infra.Logging;

namespace OhMatrix.Core;

/// <summary>
/// The log of the operations that answer with a notice at the top of the screen: one line when the operation starts, and one when it ends,
/// whether it worked or not, so that what a person saw can be found in the log.
/// </summary>
public static class Ops {
    private static readonly Logger logger = Logger.GetDefault();

    /// <summary>The operation begins.</summary>
    public static void Start(string operation, string? detail = null)
    {
        logger.Info(Line("start", operation, detail));
    }

    /// <summary>The operation worked.</summary>
    public static void Done(string operation, string? detail = null)
    {
        logger.Info(Line("done", operation, detail));
    }

    /// <summary>The operation failed.</summary>
    public static void Fail(string operation, Exception e,
        string? detail = null)
    {
        logger.Error(Line("failed", operation,
            (detail == null ? "" : detail + ": ") + e.GetType().Name + ": " +
            e.Message));
    }

    private static string Line(string step, string operation, string? detail)
    {
        return $"[op] {operation} {step}" +
               (string.IsNullOrEmpty(detail) ? "" : " (" + detail + ")");
    }
}
