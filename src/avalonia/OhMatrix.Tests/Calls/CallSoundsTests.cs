using OhMatrix.Core.Calls;
using Xunit;

namespace OhMatrix.Tests.Calls;

public class CallSoundsTests {
    [Fact]
    public async Task
        The_ring_and_the_end_tone_are_made_and_played_without_a_sound_file()
    {
        var sounds = new VlcCallSounds();
        sounds.Ring(true);
        sounds.Ring(false);
        await Task.Delay(300, TestContext.Current.CancellationToken);
        sounds.Stop();
        sounds.Ended();
        await Task.Delay(100, TestContext.Current.CancellationToken);
        sounds.Stop();
        foreach (var name in new[] {
                     "ring", "ringback", "end"
                 }) {
            var path = Path.Combine(Path.GetTempPath(), $"ohmatrix-{name}.wav");
            // Without VLC nothing is made; with it, a mono 16-bit file of the length asked.
            if (OhMatrix.Core.Audio.MediaPlayer.Available)
                Assert.True(new FileInfo(path).Length > 6000, name);
        }
    }
}
