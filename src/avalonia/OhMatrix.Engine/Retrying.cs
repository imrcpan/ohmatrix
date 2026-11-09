namespace OhMatrix.Engine;

/// <summary>Trying again after a pause that grows, on a clock that a test can drive.</summary>
public static class Retrying {
    /// <summary>
    /// Gives the result of <paramref name="attempt"/>; when it fails in a way
    /// <paramref name="again"/> accepts, waits (<paramref name="first"/>, then
    /// twice as long each time, up to <paramref name="longest"/>) and tries
    /// again, at most <paramref name="retries"/> times. The last failure
    /// is thrown.
    /// </summary>
    public static async Task<T> Until<T>(Func<Task<T>> attempt,
        Func<Exception, bool> again, int retries, TimeSpan first,
        TimeSpan longest, TimeProvider time,
        CancellationToken cancel = default)
    {
        var wait = first;
        for (var i = 0;; i++) {
            try {
                return await attempt();
            } catch (Exception e) when (i < retries && again(e)) {
                // Wait and try again.
            }

            await Task.Delay(wait, time, cancel);
            wait = TimeSpan.FromTicks(Math.Min(longest.Ticks, wait.Ticks * 2));
        }
    }
}
