using Avalonia;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using OhMatrix.Core.State;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class PicturesTests {
    private sealed class Media(byte[]? bytes) : IMediaEngine {
        public int Calls;
        public (int, int) Size;

        public Task<string?> Download(string source, string fileName,
            string mimeType) =>
            Task.FromResult<string?>(null);

        public Task<byte[]?> Thumbnail(string mxc, int width, int height)
        {
            Calls++;
            Size = (width, height);
            return Task.FromResult(bytes);
        }
    }

    private static byte[] Png()
    {
        using var target = new RenderTargetBitmap(new PixelSize(8, 8));
        using var stream = new MemoryStream();
        target.Save(stream);
        return stream.ToArray();
    }

    [AvaloniaFact]
    public async Task A_picture_is_fetched_once_at_twice_the_size()
    {
        var media = new Media(Png());
        var pictures = new Pictures(media);
        var a = await pictures.Get("mxc://s/a", 44);
        var b = await pictures.Get("mxc://s/a", 44);
        Assert.NotNull(a);
        Assert.Same(a, b);
        Assert.Equal(1, media.Calls);
        Assert.Equal((88, 88), media.Size);
    }

    // One picture of the test is 8 x 8 pixels: 256 bytes.
    [AvaloniaFact]
    public async Task The_pictures_kept_are_bounded_and_the_oldest_go_first()
    {
        var media = new Media(Png());
        // Room for two.
        var pictures = new Pictures(media, 600);
        var a = await pictures.Get("mxc://s/a", 44);
        await pictures.Get("mxc://s/b", 44);
        Assert.Equal(2, pictures.Count);
        Assert.Equal(512, pictures.KeptBytes);

        // a is asked for again, so b is the one asked for least recently.
        Assert.Same(a, await pictures.Get("mxc://s/a", 44));
        await pictures.Get("mxc://s/c", 44);
        Assert.Equal(2, pictures.Count);
        Assert.True(pictures.KeptBytes <= 600);
        Assert.Equal(3, media.Calls);
        Assert.Same(a, await pictures.Get("mxc://s/a", 44));
        Assert.Equal(3, media.Calls);

        // b was let go: it is fetched again, and a bitmap that was shown
        // is still good (it was not disposed).
        await pictures.Get("mxc://s/b", 44);
        Assert.Equal(4, media.Calls);
        Assert.Equal(8, ((Bitmap)a!).PixelSize.Width);
        Assert.True(pictures.KeptBytes <= 600);

        // Many pictures: the kept ones never pass the budget.
        for (var i = 0; i < 50; i++)
            await pictures.Get("mxc://s/p" + i, 44);
        Assert.Equal(2, pictures.Count);
        Assert.True(pictures.KeptBytes <= 600);
    }

    [AvaloniaFact]
    public async Task
        A_picture_bigger_than_the_budget_still_comes_and_is_the_only_one()
    {
        var media = new Media(Png());
        var pictures = new Pictures(media, 100);
        await pictures.Get("mxc://s/a", 44);
        var b = await pictures.Get("mxc://s/b", 44);
        Assert.NotNull(b);
        // The newest is kept, whatever the budget.
        Assert.Equal(1, pictures.Count);
        Assert.Same(b, await pictures.Get("mxc://s/b", 44));
    }

    [AvaloniaFact]
    public async Task
        Pictures_on_their_way_are_asked_for_once_and_do_not_count()
    {
        var gate = new TaskCompletionSource<byte[]?>();
        var calls = 0;
        var media = new Waiting(gate.Task, () => calls++);
        var pictures = new Pictures(media, 600);
        var first = pictures.Get("mxc://s/a", 44);
        var second = pictures.Get("mxc://s/a", 44);
        Assert.Equal(1, calls);
        Assert.Equal(0, pictures.KeptBytes);
        gate.SetResult(Png());
        Assert.Same(await first, await second);
        Assert.Equal(256, pictures.KeptBytes);
    }

    [AvaloniaFact]
    public async Task
        A_picture_that_could_not_be_had_is_not_kept_and_is_tried_again()
    {
        var media = new Media([1, 2, 3]);
        var pictures = new Pictures(media, 600);
        Assert.Null(await pictures.Get("mxc://s/a", 44));
        Assert.Equal(0, pictures.KeptBytes);
        Assert.Null(await pictures.Get("mxc://s/a", 44));
        Assert.Equal(2, media.Calls);
    }

    private sealed class Waiting(Task<byte[]?> bytes, Action called)
        : IMediaEngine {
        public Task<string?> Download(string source, string fileName,
            string mimeType) =>
            Task.FromResult<string?>(null);

        public Task<byte[]?> Thumbnail(string mxc, int width, int height)
        {
            called();
            return bytes;
        }
    }

    [AvaloniaFact]
    public async Task No_address_or_no_data_means_the_initials()
    {
        Assert.Null(await new Pictures(new Media(Png())).Get(null, 44));
        Assert.Null(await new Pictures(null).Get("mxc://s/a", 44));
        Assert.Null(await new Pictures(new Media(null)).Get("mxc://s/a", 44));
        Assert.Null(
            await new Pictures(new Media([1, 2, 3])).Get("mxc://s/a", 44));
    }

    [AvaloniaFact]
    public async Task An_avatar_gets_its_picture_when_it_arrives()
    {
        var pictures = new Pictures(new Media(Png()));
        var avatar = new Avatar("!a", "Room", 44);
        Assert.IsType<Avalonia.Controls.TextBlock>(avatar.Child);
        pictures.Attach(avatar, "mxc://s/a", 44);
        await Task.Delay(100);
        Dispatcher.UIThread.RunJobs();
        Assert.IsType<Avalonia.Controls.Image>(avatar.Child);
    }
}

public class MediaSizeTests {
    [Xunit.Theory]
    [Xunit.InlineData(1600, 900, 300, 169)]
    [Xunit.InlineData(900, 1600, 169, 300)]
    [Xunit.InlineData(100, 100, 130, 100)]
    [Xunit.InlineData(null, null, 300, 300)]
    [Xunit.InlineData(2000, 100, 300, 90)]
    public void Fits_the_long_edge_with_a_floor(int? w, int? h, int ew, int eh)
    {
        Xunit.Assert.Equal((ew, eh), OhMatrix.Core.Ui.MediaSize.Fit(w, h));
    }
}
