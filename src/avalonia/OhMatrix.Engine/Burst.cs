using OhMatrix.Infra.Logging;

namespace OhMatrix.Engine;

/// <summary>
/// Turns a run of notifications that come close together into one: the first
/// starts a pause, the ones in it only replace what is to be done, and the
/// latest is done when the pause ends.
/// </summary>
public sealed class Burst(TimeSpan window, TimeProvider time) {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly Lock gate = new();
    private Action? pending;
    private bool waiting;

    public void Poke(Action action)
    {
        lock (gate) {
            pending = action;
            if (waiting)
                return;
            waiting = true;
        }

        _ = Wait();
    }

    private async Task Wait()
    {
        await Task.Delay(window, time);
        Action? action;
        lock (gate) {
            action = pending;
            pending = null;
            waiting = false;
        }

        try {
            action?.Invoke();
        } catch (Exception e) {
            logger.Unexpected("run a queued action", e);
            // What was asked for tells of its own failure.
        }
    }
}
