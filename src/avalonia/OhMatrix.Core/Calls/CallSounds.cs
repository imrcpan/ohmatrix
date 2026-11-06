using OhMatrix.Core.Audio;

namespace OhMatrix.Core.Calls;

/// <summary>The sounds of a call: the ring of a call coming in, the tone of one going out until it is answered, and a short one as it ends.</summary>
public interface ICallSounds {
    /// <summary>Starts the ring (<paramref name="incoming"/>) or the tone of a call going out; <see cref="Stop"/> ends it.</summary>
    void Ring(bool incoming);

    void Stop();

    /// <summary>A short sound for a call that has ended.</summary>
    void Ended();
}

/// <summary>
/// The sounds of calls played through the system's VLC. They are made here as small WAV files (two tones, as a phone rings) the first time they
/// are asked for, so the app carries no sound files; where VLC is not installed they are silent.
/// </summary>
public sealed class VlcCallSounds : ICallSounds {
    private const int Rate = 8000;

    private MediaPlayer? current;
    private MediaPlayer? ending;

    private static string File(string name, Func<short[]> make)
    {
        var path = Path.Combine(Path.GetTempPath(), $"ohmatrix-{name}.wav");
        if (System.IO.File.Exists(path))
            return path;
        var samples = make();
        using var w = new BinaryWriter(System.IO.File.Create(path));
        w.Write("RIFF"u8);
        w.Write(36 + samples.Length * 2);
        w.Write("WAVEfmt "u8);
        w.Write(16);
        w.Write((short)1);
        w.Write((short)1);
        w.Write(Rate);
        w.Write(Rate * 2);
        w.Write((short)2);
        w.Write((short)16);
        w.Write("data"u8);
        w.Write(samples.Length * 2);
        foreach (var s in samples)
            w.Write(s);
        return path;
    }

    /// <summary>Tone bursts: for each (frequency pair, on, off) in seconds, repeated to fill <paramref name="seconds"/>.</summary>
    private static short[] Pattern(double f1, double f2, double on, double off, double seconds)
    {
        var data = new short[(int)(seconds * Rate)];
        var cycle = on + off;
        for (var i = 0; i < data.Length; i++) {
            var t = (double)i / Rate;
            if (t % cycle >= on)
                continue;
            var v = (Math.Sin(2 * Math.PI * f1 * t) + Math.Sin(2 * Math.PI * f2 * t)) * 0.25;
            // A short fade at the edges of each burst keeps it from clicking.
            var inBurst = t % cycle;
            var fade = Math.Min(1.0, Math.Min(inBurst, on - inBurst) / 0.02);
            data[i] = (short)(v * fade * short.MaxValue);
        }

        return data;
    }

    public void Ring(bool incoming)
    {
        Stop();
        if (!MediaPlayer.Available)
            return;
        // Long enough for an invitation's lifetime: a minute of the pattern.
        var path = incoming
            ? File("ring", () => Pattern(440, 480, 1.0, 2.0, 60))
            : File("ringback", () => Pattern(425, 425, 1.0, 3.0, 60));
        current = new MediaPlayer(path);
        current.Play();
    }

    public void Stop()
    {
        current?.Dispose();
        current = null;
    }

    public void Ended()
    {
        Stop();
        if (!MediaPlayer.Available)
            return;
        ending?.Dispose();
        ending = new MediaPlayer(File("end", () => Pattern(480, 620, 0.35, 0.05, 0.4)));
        ending.Play();
    }
}
