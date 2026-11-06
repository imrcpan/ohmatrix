using System.Collections.Concurrent;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The pictures of rooms and people (<c>useMediaUrl</c> of the React Native app): fetched once for each address and size, kept while the app runs,
/// and asked for only once when several rows want the same one at the same time.
/// </summary>
public sealed class Pictures(IMediaEngine? media) {
    private readonly ConcurrentDictionary<(string, int), Task<IImage?>> cache = new();

    /// <summary>The picture, square at <paramref name="size"/> (logical pixels; fetched twice as big for sharp screens); null when there is none.</summary>
    public Task<IImage?> Get(string? mxc, int size)
    {
        if (media is null || string.IsNullOrEmpty(mxc))
            return Task.FromResult<IImage?>(null);
        return cache.GetOrAdd((mxc, size), key => Load(key.Item1, key.Item2));
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
        if (picture is null)
            return;
        // Back on the thread of the interface.
        Avalonia.Threading.Dispatcher.UIThread.Post(() => avatar.Source = picture);
    }

    private async Task<IImage?> Load(string mxc, int size)
    {
        try {
            var bytes = await media!.Thumbnail(mxc, size * 2, size * 2);
            if (bytes is null || bytes.Length == 0)
                return null;
            using var stream = new MemoryStream(bytes);
            return new Bitmap(stream);
        } catch (Exception) {
            // A picture that cannot be had is the initials; the next run tries again.
            cache.TryRemove((mxc, size), out _);
            return null;
        }
    }
}
