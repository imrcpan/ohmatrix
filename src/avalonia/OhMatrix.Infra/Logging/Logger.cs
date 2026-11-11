using System.Text;

namespace OhMatrix.Infra.Logging;

public class PanicMessage {
    public required string FullMessage { get; init; } = string.Empty;

    public required string Exception { get; init; }

    public string PrintStr => GenPrintStr();

    private string GenPrintStr()
    {
        var sb = new StringBuilder();
        sb.AppendLine("An unignorable error has occurred.");
        sb.AppendLine();
        sb.AppendLine("Message:");
        sb.AppendLine(FullMessage);
        sb.AppendLine("Details:");
        sb.AppendLine(Exception);
        return sb.ToString();
    }

    public static PanicMessage Empty { get; } = new() {
        FullMessage = "Empty PanicMessage.",
        Exception = "Empty PanicMessage.",
    };
}

public class Logger : ILogger {
    private readonly string pathBase;
    private readonly string pathLog;
    private readonly string pathLogLast;
    private readonly bool enableDebug;
    private readonly bool enableInfo;

    private static Logger? loggerDefault = null;

    private readonly Action<PanicMessage>? onPanic = null;

    public event Action? Written;

    // Every line goes to the file, the console and whoever follows the log.
    private void Write(string line, ConsoleColor? color)
    {
        LogWriter.FileWriteLine(pathLog, line);
        if (color is { } c)
            LogWriter.ConsoleColorfulWriteLine(line, c);
        else
            LogWriter.ConsoleWriteLine(line);
        Written?.Invoke();
    }

    public static void SetDefault(Logger logger)
    {
        loggerDefault = logger;
    }

    public static Logger GetDefault()
    {
        if (loggerDefault == null)
            throw new NullReferenceException("Default logger is not set.");
        return loggerDefault;
    }

    public Logger(
        Action<PanicMessage>? onPanic = null,
        string pathBase = "./data",
        bool enableDebug = false,
        bool enableInfo = true)
    {
        this.onPanic = onPanic;
        this.pathBase = pathBase;
        pathLog = Path.Combine(pathBase, "app.log");
        pathLogLast = Path.Combine(pathBase, "app.last.log");
        this.enableDebug = enableDebug;
        this.enableInfo = enableInfo;
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;
    }

    public void Init()
    {
        PanicIfFailed(() => {
            if (!Directory.Exists(pathBase))
                Directory.CreateDirectory(pathBase);
            if (File.Exists(pathLogLast))
                File.Delete(pathLogLast);
            if (File.Exists(pathLog))
                File.Move(pathLog, pathLogLast);
            Info("Logger initialized.");
        });
    }

    /// <summary>The log of this run as written; empty before the first line.</summary>
    public string ReadLog()
    {
        return File.Exists(pathLog) ? LogWriter.Read(pathLog) : "";
    }

    /// <summary>The path of the log of this run.</summary>
    public string LogPath => pathLog;

    /// <summary>Empties the log of this run (the one of the run before is kept).</summary>
    public void ClearLog()
    {
        PanicIfFailed(() => {
            LogWriter.FileClear(pathLog);
            Written?.Invoke();
        });
    }

    private static string UtcTimeStr(DateTime? time = null)
    {
        return (time ?? DateTime.UtcNow).ToString("MMddHHmmss");
    }

    public void Debug(Func<string> message)
    {
        PanicIfFailed(() => {
            if (!enableDebug)
                return;
            Write($"DBG {UtcTimeStr()} {message.Invoke()}", null);
        });
    }

    public void Info(string message)
    {
        PanicIfFailed(() => {
            if (!enableInfo)
                return;
            Write($"INF {UtcTimeStr()} {message}", ConsoleColor.Green);
        });
    }

    public void Warn(string message)
    {
        PanicIfFailed(() => {
            Write($"WRN {UtcTimeStr()} {message}", ConsoleColor.Yellow);
        });
    }

    public void Error(string message)
    {
        PanicIfFailed(() => {
            Write($"ERR {UtcTimeStr()} {message}", ConsoleColor.Red);
        });
    }

    public void Fatal(string message)
    {
        PanicIfFailed(() => {
            Write($"FTL {UtcTimeStr()} {message}", ConsoleColor.Red);
        });
    }

    private void PanicIfFailed(Action action)
    {
        try {
            action();
        } catch (Exception ex) {
            Panic("Logger error when writing.",
                ex.ToString());
        }
    }

    public PanicMessage PanicMessage = PanicMessage.Empty;

    private volatile bool panic = false;

    public void Panic(string msgFull, string exception)
    {
        if (panic)
            return;
        panic = true;
        PanicMessage = new PanicMessage() {
            FullMessage = msgFull,
            Exception = exception,
        };
        Fatal(msgFull);
        Fatal(exception);
        onPanic?.Invoke(PanicMessage);
        if (onPanic == null)
            Environment.FailFast(PanicMessage.PrintStr);
    }
}
