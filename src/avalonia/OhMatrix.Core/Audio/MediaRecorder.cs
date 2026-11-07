using System.Diagnostics;
using OhMatrix.Core.Calls.Gst;

namespace OhMatrix.Core.Audio;

/// <summary>A finished recording: the file, its type and how long it ran.</summary>
public sealed record Recording(string Path, string MimeType, TimeSpan Duration);

/// <summary>
/// Records the microphone (and, for a clip, the camera) into a file with GStreamer (<c>Recorder</c> of the TypeScript core): sound as Opus in Ogg,
/// a clip as VP8 and Opus in WebM. <see cref="Stop"/> ends the file properly; <see cref="Cancel"/> throws it away.
/// </summary>
public sealed class MediaRecorder : IDisposable {
    private readonly bool video;
    private readonly string path;
    private IntPtr pipeline;
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
            : sound + $" ! oggmux ! filesink location=\"{path}\"";
        pipeline = LibGst.gst_parse_launch(LibGst.Utf8(description), out var error);
        if (pipeline == IntPtr.Zero)
            throw new InvalidOperationException("no recording pipeline");
        if (LibGst.gst_element_set_state(pipeline, LibGst.StatePlaying) == 0) {
            Release();
            throw new InvalidOperationException("no device");
        }

        clock.Start();
    }

    /// <summary>Ends the file and gives it; null when nothing was recording.</summary>
    public async Task<Recording?> Stop()
    {
        if (pipeline == IntPtr.Zero)
            return null;
        clock.Stop();
        var done = pipeline;
        await Task.Run(() => {
            LibGst.gst_element_send_event(done, LibGst.gst_event_new_eos());
            var bus = LibGst.gst_element_get_bus(done);
            // The end of stream comes once the encoders have written out what they hold.
            var message = LibGst.gst_bus_timed_pop_filtered(bus, 5_000_000_000UL, 1 | 2);
            if (message != IntPtr.Zero)
                LibGst.gst_mini_object_unref(message);
            LibGst.g_object_unref(bus);
        });
        Release();
        return new Recording(path, video ? "video/webm" : "audio/ogg", clock.Elapsed);
    }

    /// <summary>Stops and deletes the file.</summary>
    public void Cancel()
    {
        clock.Stop();
        Release();
        try {
            File.Delete(path);
        } catch (IOException) {
            // A file in the temporary folder that stays is only a little disk.
        }
    }

    private void Release()
    {
        if (pipeline == IntPtr.Zero)
            return;
        LibGst.gst_element_set_state(pipeline, LibGst.StateNull);
        LibGst.g_object_unref(pipeline);
        pipeline = IntPtr.Zero;
    }

    public void Dispose()
    {
        Cancel();
    }
}
