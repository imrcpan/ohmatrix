using Avalonia;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
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

        public Task<string?> Download(string source, string fileName, string mimeType) =>
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

    [AvaloniaFact]
    public async Task No_address_or_no_data_means_the_initials()
    {
        Assert.Null(await new Pictures(new Media(Png())).Get(null, 44));
        Assert.Null(await new Pictures(null).Get("mxc://s/a", 44));
        Assert.Null(await new Pictures(new Media(null)).Get("mxc://s/a", 44));
        Assert.Null(await new Pictures(new Media([1, 2, 3])).Get("mxc://s/a", 44));
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
