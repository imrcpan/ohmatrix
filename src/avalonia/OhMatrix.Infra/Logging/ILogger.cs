namespace OhMatrix.Infra.Logging;

public interface ILogger {
    public void Debug(Func<string> message);
    public void Info(string message);
    public void Warn(string message);
    public void Error(string message);
    public void Fatal(string message);

    /// <summary>Told after a line was written. May come from any thread.</summary>
    public event Action? Written;
}
