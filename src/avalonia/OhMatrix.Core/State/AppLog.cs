namespace OhMatrix.Core.State;

public enum LogLevel {
    Info,
    Warn,
    Error,
}

public sealed record LogLine(DateTimeOffset Time, LogLevel Level, string Text);

/// <summary>What the app tells of itself while it runs: the last 2000 lines, kept in memory for the log page (<c>log</c> of the TypeScript core).</summary>
public static class AppLog {
    public const int Capacity = 2000;

    private static readonly object Gate = new();
    private static readonly Queue<LogLine> Lines = new();

    /// <summary>A line was added or the log was emptied. May come from any thread.</summary>
    public static event Action? Changed;

    public static void Add(LogLevel level, string text)
    {
        lock (Gate) {
            Lines.Enqueue(new LogLine(DateTimeOffset.Now, level, text));
            while (Lines.Count > Capacity)
                Lines.Dequeue();
        }

        Changed?.Invoke();
    }

    public static void Error(string text)
    {
        Add(LogLevel.Error, text);
    }

    public static IReadOnlyList<LogLine> Snapshot()
    {
        lock (Gate)
            return Lines.ToList();
    }

    public static void Clear()
    {
        lock (Gate)
            Lines.Clear();
        Changed?.Invoke();
    }

    /// <summary>The log as one text, a line each, the way it is copied.</summary>
    public static string Text(IReadOnlyList<LogLine> lines)
    {
        return string.Join(
            "\n",
            lines.Select(l =>
                $"{l.Time:HH:mm:ss.fff} {l.Level.ToString().ToLowerInvariant()} {l.Text}")
        );
    }
}
