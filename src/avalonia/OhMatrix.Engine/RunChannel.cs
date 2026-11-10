using System.Threading.Channels;

namespace OhMatrix.Engine;

/// <summary>
/// The queue of the changes the SDK makes, one for each run of the sync: what
/// was queued by a run that is over can never be read by the next one, whose
/// list it does not belong to (its indexes would be applied to another list).
/// </summary>
public sealed class RunChannel<T> {
    private readonly Lock gate = new();
    private Channel<T>? current;

    /// <summary>Starts a run: its own queue; the one of the run before is completed.</summary>
    public Channel<T> Open()
    {
        lock (gate) {
            current?.Writer.TryComplete();
            return current = Channel.CreateUnbounded<T>();
        }
    }

    /// <summary>Ends the run: nothing more is queued and what was queued is dropped.</summary>
    public void Close()
    {
        lock (gate) {
            current?.Writer.TryComplete();
            current = null;
        }
    }
}
