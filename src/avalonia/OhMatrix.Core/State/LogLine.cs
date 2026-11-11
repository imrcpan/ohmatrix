namespace OhMatrix.Core.State;

public enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
    Fatal,
}

/// <summary>A line of the log file, as <c>OhMatrix.Infra.Logging.Logger</c> writes it: <c>INF 1111185000 text</c>.</summary>
public sealed record LogLine(LogLevel Level, string Stamp, string Text) {
    /// <summary>The lines of a log text; a line that is not of that form (the second line of a stack trace) goes on the line before it.</summary>
    public static IReadOnlyList<LogLine> Parse(string text)
    {
        var lines = new List<LogLine>();
        foreach (var raw in text.Split('\n')) {
            var line = raw.TrimEnd('\r');
            if (line.Length == 0)
                continue;
            if (Head(line) is { } head) {
                lines.Add(head);
                continue;
            }

            if (lines.Count == 0)
                lines.Add(new LogLine(LogLevel.Info, "", line));
            else
                lines[^1] = lines[^1] with {
                    Text = lines[^1].Text + "\n" + line
                };
        }

        return lines;
    }

    // "INF 1111185000 text": a level, a stamp of ten digits and the text.
    private static LogLine? Head(string line)
    {
        // Three letters, a space, ten digits, a space: 15 characters.
        const int HeadLength = 15;
        if (line.Length < HeadLength || line[3] != ' ' || line[14] != ' ')
            return null;
        var level = line[..3] switch {
            "DBG" => LogLevel.Debug,
            "INF" => LogLevel.Info,
            "WRN" => LogLevel.Warn,
            "ERR" => LogLevel.Error,
            "FTL" => LogLevel.Fatal,
            _ => (LogLevel?)null,
        };
        if (level is null)
            return null;
        return new LogLine(level.Value, line.Substring(4, 10),
            line[HeadLength..]);
    }
}
