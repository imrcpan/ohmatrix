using OhMatrix.Infra.Logging;

namespace OhMatrix.Engine;

/// <summary>
/// Work asked for by key from callbacks that come in bursts (the SDK tells of
/// every change of every room): at most <c>limit</c> jobs run at once, and a
/// key that is asked for again while its job runs gets one more run after it,
/// not one for each ask.
/// </summary>
public sealed class KeyedWork(int limit) {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly SemaphoreSlim slots = new(limit, limit);

    // A key whose job is running; true when it was asked for again meanwhile.
    private readonly Dictionary<string, bool> running = [];

    /// <summary>Asks for the job of a key, apart from the caller (a thread of the SDK, which must not wait).</summary>
    public void Request(string key, Func<Task> job)
    {
        lock (running) {
            if (running.ContainsKey(key)) {
                running[key] = true;
                return;
            }

            running[key] = false;
        }

        _ = Task.Run(() => Drain(key, job));
    }

    /// <summary>Runs a job when fewer than the limit are running.</summary>
    public async Task Limit(Func<Task> job)
    {
        await Limit(async () => {
            await job();
            return true;
        });
    }

    /// <summary>Runs a job when fewer than the limit are running, and gives its result.</summary>
    public async Task<T> Limit<T>(Func<Task<T>> job)
    {
        await slots.WaitAsync();
        try {
            return await job();
        } finally {
            slots.Release();
        }
    }

    private async Task Drain(string key, Func<Task> job)
    {
        while (true) {
            try {
                await Limit(job);
            } catch (Exception e) {
                logger.Unexpected($"run a queued job for {key}", e);
                // A job tells of its own failure; this one is over.
            }

            lock (running) {
                if (!running[key]) {
                    running.Remove(key);
                    return;
                }

                running[key] = false;
            }
        }
    }
}
