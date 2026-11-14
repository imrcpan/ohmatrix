using Avalonia.Media;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui.Widgets;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Media;

/// <summary>
/// The pictures of rooms and people (<c>useMediaUrl</c> of the React Native app): fetched once for each address and size, kept, and asked for only
/// once when several rows want the same one at the same time. What is kept is bounded: when the pictures that came add up (as pixels, four bytes
/// each) to more than <c>budget</c>, the ones asked for least recently are let go. A picture that is let go is not disposed, for a control may
/// still show it; it is fetched again if it is asked for again.
/// </summary>
public sealed class Pictures(
    IMediaEngine? media,
    long budget = Pictures.DefaultBudget) {
    private static readonly Logger logger = Logger.GetDefault();

    /// <summary>64 MB of pixels: some thousands of avatars, or some dozens of big pictures.</summary>
    public const long DefaultBudget = 64L * 1024 * 1024;

    private readonly Lock gate = new();
    private readonly Dictionary<(string, int, int), Entry> cache = [];

    // The entries that came, the newest asked for first.
    private readonly LinkedList<(string, int, int)> recent = [];
    private long kept;

    private sealed class Entry(Task<IImage?> task) {
        public Task<IImage?> Task { get; } = task;
        public LinkedListNode<(string, int, int)>? Node;
        public long Bytes;
    }

    /// <summary>How many pictures are kept (those that came, and those on their way).</summary>
    public int Count {
        get {
            lock (gate)
                return cache.Count;
        }
    }

    /// <summary>The pixels of the pictures that came and are kept, in bytes.</summary>
    public long KeptBytes {
        get {
            lock (gate)
                return kept;
        }
    }

    /// <summary>The picture, square at <paramref name="size"/> (logical pixels; fetched twice as big for sharp screens); null when there is none.</summary>
    public Task<IImage?> Get(string? mxc, int size)
    {
        return Get(mxc, size, size);
    }

    /// <summary>The picture at <paramref name="width"/> by <paramref name="height"/> logical pixels.</summary>
    public Task<IImage?> Get(string? source, int width, int height)
    {
        if (string.IsNullOrEmpty(source) ||
            (media == null && !BuiltinStickers.Is(source)))
            return Task.FromResult<IImage?>(null);
        var key = (source, width, height);
        TaskCompletionSource<IImage?> start;
        lock (gate) {
            if (cache.TryGetValue(key, out var found)) {
                if (found.Node != null) {
                    recent.Remove(found.Node);
                    recent.AddFirst(found.Node);
                }

                return found.Task;
            }

            start = new TaskCompletionSource<IImage?>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            cache[key] = new Entry(start.Task);
        }

        // Outside the lock: the engine may do work before its first wait.
        _ = Fetch(key, start);
        return start.Task;
    }

    private async Task Fetch((string, int, int) key,
        TaskCompletionSource<IImage?> done)
    {
        var picture = await Load(key.Item1, key.Item2, key.Item3);
        lock (gate) {
            if (cache.TryGetValue(key, out var entry) &&
                ReferenceEquals(entry.Task, done.Task)) {
                if (picture == null) {
                    // No picture (none there, failed, or the engine is not
                    // ready yet): nothing is kept, so the entry does not
                    // outlive the ask and the next ask tries again.
                    cache.Remove(key);
                } else {
                    entry.Bytes = picture is Bitmap bitmap
                        ? (long)bitmap.PixelSize.Width *
                          bitmap.PixelSize.Height * 4
                        : (long)(picture.Size.Width * picture.Size.Height * 4);
                    entry.Node = recent.AddFirst(key);
                    kept += entry.Bytes;
                    Trim();
                }
            }
        }

        done.SetResult(picture);
    }

    // Lets go of the pictures asked for least recently, never the newest.
    private void Trim()
    {
        while (kept > budget && recent.Count > 1) {
            var oldest = recent.Last!;
            recent.RemoveLast();
            if (cache.Remove(oldest.Value, out var entry))
                kept -= entry.Bytes;
        }
    }

    /// <summary>Gives <paramref name="image"/> its picture when it has come.</summary>
    public void Attach(Avalonia.Controls.Image image, string? source, int width,
        int height)
    {
        var task = Get(source, width, height);
        if (task.IsCompletedSuccessfully) {
            image.Source = task.Result;
            return;
        }

        _ = Show(image, task);
    }

    private static async Task Show(Avalonia.Controls.Image image,
        Task<IImage?> task)
    {
        var picture = await task;
        if (picture != null)
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                image.Source = picture);
    }

    /// <summary>Gives <paramref name="avatar"/> its picture: at once when it is known, otherwise when it has come.</summary>
    public void Attach(Avatar avatar, string? mxc, int size)
    {
        var task = Get(mxc, size);
        if (task.IsCompletedSuccessfully) {
            avatar.Source = task.Result;
            return;
        }

        _ = Show(avatar, task);
    }

    private static async Task Show(Avatar avatar, Task<IImage?> task)
    {
        var picture = await task;
        if (picture == null)
            return;
        // Back on the thread of the interface.
        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            avatar.Source = picture);
    }

    private async Task<IImage?> Load(string mxc, int width, int height)
    {
        try {
            // The built-in emoji are in the app, not on a server.
            var bytes = BuiltinStickers.Is(mxc)
                ? BuiltinStickers.Png(BuiltinStickers.NameOf(mxc))
                : await media!.Thumbnail(mxc, width * 2, height * 2);
            if (bytes == null || bytes.Length == 0)
                return null;
            using var stream = new MemoryStream(bytes);
            return new Bitmap(stream);
        } catch (Exception e) {
            logger.Unexpected($"load the picture {mxc}", e);
            // A picture that cannot be had is the initials; Fetch lets go of
            // the entry and the next ask tries again.
            return null;
        }
    }
}
