namespace OhMatrix.Infra.Logging;

internal static class LogWriter
{
    private static readonly Lock consoleLock = new();
    private static readonly Lock fileLock = new();

    public static void ConsoleWriteLine(string message)
    {
        lock (consoleLock)
        {
            Console.WriteLine(message);
        }
    }

    public static void ConsoleColorfulWriteLine(string message, ConsoleColor color)
    {
        lock (consoleLock)
        {
            Console.ForegroundColor = color;
            Console.WriteLine(message);
            Console.ResetColor();
        }
    }

    public static void FileWriteLine(string path, string message)
    {
        lock (fileLock)
        {
            File.AppendAllLines(path, [message]);
        }
    }

    public static string Read(string path)
    {
        lock (fileLock)
        {
            return File.ReadAllText(path);
        }
    }
}
