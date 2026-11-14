using System.Diagnostics;
using OhMatrix.Core.Calls.Gst;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Audio;

/// <summary>A finished recording: the file, its type and how long it ran.</summary>
public sealed record Recording(
    string Path,
    string MimeType,
    TimeSpan Duration,
    IReadOnlyList<float>? Waveform = null);

/// <summary>
/// Records the microphone (and, for a clip, the camera) into a file with GStreamer (<c>Recorder</c> of the TypeScript core): sound as Opus in Ogg,
/// a clip as VP8 and Opus in WebM. <see cref="Stop"/> ends the file properly; <see cref="Cancel"/> throws it away.
/// </summary>
public sealed class MediaRecorder : IDisposable {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly bool video;
    private readonly string path;
    private IntPtr pipeline;

    // The tap of a voice recording: a copy of the sound as 16-bit mono, which
    // is read to tell how loud it is.
    private IntPtr tap;

    // How loud it was at each look, from 0 to 1: the waveform of the message.
    private readonly List<float> loudness = [];
    private readonly Stopwatch clock = new();

    public MediaRecorder(bool video)
    {
        this.video = video;
        path = System.IO.Path.Combine(System.IO.Path.GetTempPath(),
            $"ohmatrix-{Guid.NewGuid():N}.{(video ? "webm" : "ogg")}");
    }

    /// <summary>Whether this machine can record sound, or a clip.</summary>
    public static bool Available(bool video) => LibGst.CanRecord(video);

    /// <summary>The time the recording has run.</summary>
    public TimeSpan Elapsed => clock.Elapsed;

    public bool Running => pipeline != IntPtr.Zero;

    /// <summary>Opens the devices and starts; throws when there is no microphone or the platform refuses it.</summary>
    public void Start()
    {
        var sound = "autoaudiosrc ! audioconvert ! audioresample ! opusenc";
        var description = video
            ? $"webmmux name=m ! filesink location=\"{path}\" "
              + "autovideosrc ! videoconvert ! videoscale ! video/x-raw,width=640,height=480 ! "
              + "vp8enc deadline=1 cpu-used=8 ! m. " + sound + " ! m."
            : "autoaudiosrc ! audioconvert ! audioresample ! tee name=t ! "
              + $"queue ! opusenc ! oggmux ! filesink location=\"{path}\" "
              + "t. ! queue leaky=downstream max-size-buffers=4 ! audioconvert ! "
              + "audio/x-raw,format=S16LE,channels=1,rate=16000 ! "
              + "appsink name=level sync=false drop=true max-buffers=4 wait-on-eos=false";
        pipeline =
            LibGst.gst_parse_launch(LibGst.Utf8(description), out var error);
        if (pipeline == IntPtr.Zero)
            throw new InvalidOperationException("no recording pipeline");
        if (!video)
            tap = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("level"));
        if (LibGst.gst_element_set_state(pipeline, LibGst.StatePlaying) == 0) {
            Release();
            throw new InvalidOperationException("no device");
        }

        clock.Start();
    }

    /// <summary>
    /// How loud the sound has been since the last call, from 0 (silence) to 1: the loudest of the samples that came meanwhile. 0 when the
    /// recording has no tap (a clip) or is not running.
    /// </summary>
    public unsafe double Level()
    {
        if (tap == IntPtr.Zero || pipeline == IntPtr.Zero)
            return 0;
        var loudest = 0.0;
        for (var n = 0; n < 16; n++) {
            var sample = LibGst.gst_app_sink_try_pull_sample(tap, 0);
            if (sample == IntPtr.Zero)
                break;
            try {
                var buffer = LibGst.gst_sample_get_buffer(sample);
                var info = default(GstMapInfo);
                if (LibGst.gst_buffer_map(buffer, &info, 1) == 0)
                    continue;
                try {
                    var count = (int)(info.Size / 2);
                    var data = (short*)info.Data;
                    var sum = 0.0;
                    for (var i = 0; i < count; i++)
                        sum += (double)data[i] * data[i];
                    if (count > 0)
                        loudest = Math.Max(loudest,
                            Math.Sqrt(sum / count) / 32768.0);
                } finally {
                    LibGst.gst_buffer_unmap(buffer, &info);
                }
            } finally {
                LibGst.gst_mini_object_unref(sample);
            }
        }

        // Speech sits low on the scale of the samples: it is stretched so that
        // a voice fills most of the bar.
        var level = Math.Min(1, loudest * 5);
        loudness.Add((float)level);
        return level;
    }

    /// <summary>Ends the file and gives it; null when nothing was recording.</summary>
    public async Task<Recording?> Stop()
    {
        if (pipeline == IntPtr.Zero)
            return null;
        clock.Stop();
        var done = pipeline;
        pipeline = IntPtr.Zero;
        var tapped = tap;
        tap = IntPtr.Zero;
        await Task.Run(() => {
            LibGst.gst_element_send_event(done, LibGst.gst_event_new_eos());
            var bus = LibGst.gst_element_get_bus(done);
            // The end of stream comes once the encoders have written out what they hold.
            var message =
                LibGst.gst_bus_timed_pop_filtered(bus, 5_000_000_000UL, 1 | 2);
            if (message != IntPtr.Zero)
                LibGst.gst_mini_object_unref(message);
            LibGst.g_object_unref(bus);
            // Closing the devices can take a moment: not on the thread of the
            // interface.
            LibGst.gst_element_set_state(done, LibGst.StateNull);
            if (tapped != IntPtr.Zero)
                LibGst.g_object_unref(tapped);
            LibGst.g_object_unref(done);
        });
        return new Recording(path, video ? "video/webm" : "audio/ogg",
            clock.Elapsed, Waveform());
    }

    // The loudness, as at most 100 samples (what is longer is averaged down).
    private List<float> Waveform()
    {
        const int Most = 100;
        if (loudness.Count <= Most)
            return [.. loudness];
        var samples = new List<float>(Most);
        for (var i = 0; i < Most; i++) {
            var from = i * loudness.Count / Most;
            var to = Math.Max(from + 1, (i + 1) * loudness.Count / Most);
            samples.Add(loudness.Skip(from).Take(to - from).Average());
        }

        return samples;
    }

    /// <summary>Stops and deletes the file.</summary>
    public void Cancel()
    {
        clock.Stop();
        Release();
        try {
            File.Delete(path);
        } catch (IOException e) {
            logger.Caught("delete a recording", e);
            // A file in the temporary folder that stays is only a little disk.
        }
    }

    private void Release()
    {
        if (pipeline == IntPtr.Zero)
            return;
        LibGst.gst_element_set_state(pipeline, LibGst.StateNull);
        if (tap != IntPtr.Zero)
            LibGst.g_object_unref(tap);
        tap = IntPtr.Zero;
        LibGst.g_object_unref(pipeline);
        pipeline = IntPtr.Zero;
    }

    public void Dispose()
    {
        Cancel();
    }
}
