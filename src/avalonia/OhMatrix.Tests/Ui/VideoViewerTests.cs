using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class VideoViewerTests {
    [AvaloniaFact]
    public async Task A_video_plays_in_the_viewer_and_shows_its_frames()
    {
        Assert.SkipUnless(MediaPlayer.Available, "libvlc is not installed");
        var window = new Window {
            Content = new Grid(),
            Width = 800,
            Height = 600
        };
        window.Show();
        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "clip.mp4");
        var viewer = new VideoViewer();
        var file = new FileAttachment("clip.mp4", 9680, "mxc://s/clip",
            "video/mp4", FileKind.Video,
            TimeSpan.FromSeconds(3));
        await viewer.Show(window, file, _ => Task.FromResult<string?>(path));
        Assert.True(viewer.IsOpen);
        for (var i = 0; i < 100 && viewer.Picture.Source is null; i++) {
            await Task.Delay(50, TestContext.Current.CancellationToken);
            viewer.Tick();
        }

        Assert.NotNull(viewer.Picture.Source);
        Assert.Equal("pause", viewer.Glyph);
        Dispatcher.UIThread.RunJobs();
        var shot = Environment.GetEnvironmentVariable("OHMATRIX_CHAT_SHEET");
        if (!string.IsNullOrEmpty(shot)) {
            window.UpdateLayout();
            window.CaptureRenderedFrame()!.Save(
                shot.Replace(".png", "-video.png"),
                new PngBitmapEncoderOptions());
        }

        viewer.Close();
        Assert.False(viewer.IsOpen);
    }

    [AvaloniaFact]
    public async Task A_video_that_cannot_be_fetched_closes_the_viewer()
    {
        var window = new Window {
            Content = new Grid(),
            Width = 800,
            Height = 600
        };
        window.Show();
        var viewer = new VideoViewer();
        await viewer.Show(window, new FileAttachment("x.mp4", 1, "mxc://s/x",
            "video/mp4",
            FileKind.Video), _ => Task.FromResult<string?>(null));
        Assert.False(viewer.IsOpen);
    }
}
