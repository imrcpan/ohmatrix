using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class AudioCardTests {
    private static string Silence()
    {
        var path = Path.Combine(Path.GetTempPath(),
            "ohm-card-" + Guid.NewGuid().ToString("N") + ".wav");
        const int rate = 8000;
        var data = new byte[rate * 2 * 10];
        using var w = new BinaryWriter(File.Create(path));
        w.Write("RIFF"u8);
        w.Write(36 + data.Length);
        w.Write("WAVEfmt "u8);
        w.Write(16);
        w.Write((short)1);
        w.Write((short)1);
        w.Write(rate);
        w.Write(rate * 2);
        w.Write((short)2);
        w.Write((short)16);
        w.Write("data"u8);
        w.Write(data.Length);
        w.Write(data);
        return path;
    }

    [AvaloniaFact]
    public async Task The_card_plays_and_pauses_the_clip()
    {
        var path = Silence();
        var opened = 0;
        var file = new FileAttachment("note.wav", 160_000,
            "mxc://s/" + Guid.NewGuid().ToString("N"),
            "audio/wav", FileKind.Audio, TimeSpan.FromSeconds(10));
        var colors = Themes.Get("light")!.Colors;
        var card = new AudioCard(file, colors, false, Brushes.Black,
            Colors.Gray,
            _ => Task.FromResult<string?>(path), () => opened++);
        Assert.Equal("play", card.Glyph);
        await card.Toggle();
        if (!MediaPlayer.Available) {
            Assert.Equal(1, opened);
            return;
        }

        Assert.Equal(0, opened);
        for (var i = 0; i < 40 && card.Glyph != "pause"; i++) {
            await Task.Delay(50, TestContext.Current.CancellationToken);
            card.Refresh();
        }

        Assert.Equal("pause", card.Glyph);
        await card.Toggle();
        for (var i = 0; i < 40 && card.Glyph != "play"; i++) {
            await Task.Delay(50, TestContext.Current.CancellationToken);
            card.Refresh();
        }

        Assert.Equal("play", card.Glyph);
        File.Delete(path);
    }
}
