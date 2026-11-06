using OhMatrix.Core.Audio;
using Xunit;

namespace OhMatrix.Tests.Audio;

public class AudioPlayerTests {
    // Ten seconds of silence as a WAV file.
    private static string Silence()
    {
        var path = Path.Combine(Path.GetTempPath(),
            "ohm-silence-" + Guid.NewGuid().ToString("N") + ".wav");
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

    [Fact]
    public async Task Plays_pauses_seeks_and_ends()
    {
        Assert.SkipUnless(AudioPlayer.Available, "libvlc is not installed");
        var path = Silence();
        using var player = new AudioPlayer(path);
        Assert.Equal(PlayState.Idle, player.State);
        Assert.True(player.Play());
        for (var i = 0; i < 40 && player.State != PlayState.Playing; i++)
            await Task.Delay(50, TestContext.Current.CancellationToken);
        Assert.Equal(PlayState.Playing, player.State);
        for (var i = 0; i < 40 && player.DurationMs == 0; i++)
            await Task.Delay(50, TestContext.Current.CancellationToken);
        Assert.InRange(player.DurationMs, 9500, 10500);
        player.Pause();
        await Task.Delay(200, TestContext.Current.CancellationToken);
        Assert.Equal(PlayState.Paused, player.State);
        player.Seek(9700);
        player.Play();
        for (var i = 0; i < 60 && player.State != PlayState.Ended; i++)
            await Task.Delay(50, TestContext.Current.CancellationToken);
        Assert.Equal(PlayState.Ended, player.State);
        File.Delete(path);
    }

    [Fact]
    public async Task Starting_one_clip_pauses_the_other()
    {
        Assert.SkipUnless(AudioPlayer.Available, "libvlc is not installed");
        var path = Silence();
        using var one = new AudioPlayer(path);
        using var two = new AudioPlayer(path);
        one.Play();
        await Task.Delay(300, TestContext.Current.CancellationToken);
        two.Play();
        await Task.Delay(300, TestContext.Current.CancellationToken);
        Assert.NotEqual(PlayState.Playing, one.State);
        File.Delete(path);
    }
}
