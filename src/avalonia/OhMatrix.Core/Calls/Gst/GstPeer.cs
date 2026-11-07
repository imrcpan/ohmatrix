using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace OhMatrix.Core.Calls.Gst;

/// <summary>What a call is made of on this machine: the elements that read the microphone and the camera and play the sound, as GStreamer launch text.</summary>
public sealed record GstSources(
    string AudioSource = "autoaudiosrc",
    string AudioSink = "autoaudiosink",
    string VideoSource = "autovideosrc"
);

/// <summary>
/// A WebRTC peer connection on the <c>webrtcbin</c> element of GStreamer: the local microphone (and camera) go out as Opus (and VP8), what comes in
/// is decoded and played, the picture into a buffer the screen reads. The offer, the answer and the candidates are the text the Matrix events carry.
/// Events are raised on the thread this was made on (the UI thread) when it has a synchronisation context.
/// </summary>
public sealed class GstPeer : IPeer, IDisposable {
    private const int Offer = 1;
    private const int Answer = 3;

    private readonly IReadOnlyList<IceServer> servers;
    private readonly GstSources sources;

    private readonly SynchronizationContext? context =
        SynchronizationContext.Current;

    private GCHandle self;
    private IntPtr pipeline;
    private IntPtr webrtc;
    private IntPtr remoteVideo;
    private IntPtr volume;
    private IntPtr camera;
    private IntPtr localVideo;
    private IntPtr audioSource;
    private IntPtr audioQueue;
    private IntPtr videoSource;
    private IntPtr videoQueue;
    private volatile bool closed;
    private readonly object frameGate = new();

    public event Action<IceCandidate?>? Candidate;

    public event Action<PeerState>? Connection;

    public GstPeer(IReadOnlyList<IceServer> servers, GstSources? sources = null)
    {
        this.servers = servers;
        this.sources = sources ?? new GstSources();
    }

    /// <summary>Whether a picture of the other side is coming in.</summary>
    public bool HasRemoteVideo => remoteVideo != IntPtr.Zero;

    private void Raise(Action action)
    {
        if (closed)
            return;
        if (context is not null)
            context.Post(_ => {
                if (!closed)
                    action();
            }, null);
        else
            action();
    }

    /// <summary>Starts the microphone (and camera) and the connection element; done once, before the offer or the answer is made.</summary>
    public unsafe void AddLocalMedia(bool video, string? microphone = null,
        string? cameraName = null)
    {
        if (pipeline != IntPtr.Zero)
            return;
        var description =
            "webrtcbin name=wb bundle-policy=max-bundle "
            + (microphone is null ? $"{sources.AudioSource} name=asrc ! " : "")
            + "queue name=aq ! audioconvert ! audioresample ! volume name=mic ! opusenc ! "
            + "rtpopuspay pt=111 ! application/x-rtp,media=audio,encoding-name=OPUS,payload=111 ! wb. "
            + (video
                ? (cameraName is null
                      ? $"{sources.VideoSource} name=vsrc ! "
                      : "")
                  + "queue name=vq ! videoconvert ! videoscale ! "
                  + "video/x-raw,width=640,height=480 ! valve name=cam ! tee name=lt ! queue ! "
                  + "vp8enc deadline=1 cpu-used=8 target-bitrate=800000 keyframe-max-dist=30 ! "
                  + "rtpvp8pay pt=96 ! application/x-rtp,media=video,encoding-name=VP8,payload=96 ! wb. "
                  // My own picture, small, for the screen: the newest frame only, never held back.
                  + "lt. ! queue leaky=downstream max-size-buffers=1 ! videoconvert ! videoscale ! "
                  + "video/x-raw,format=BGRA,width=240,height=180 ! "
                  + "appsink name=lv max-buffers=1 drop=true sync=false"
                : "");
        pipeline =
            LibGst.gst_parse_launch(LibGst.Utf8(description), out var error);
        if (pipeline == IntPtr.Zero) {
            var why = LibGst.Text(error != IntPtr.Zero
                ? *(IntPtr*)((byte*)error + 8)
                : IntPtr.Zero);
            throw new InvalidOperationException(why ?? "no media pipeline");
        }

        webrtc = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("wb"));
        volume = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("mic"));
        audioQueue = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("aq"));
        audioSource = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("asrc"));
        if (video) {
            videoQueue =
                LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("vq"));
            videoSource =
                LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("vsrc"));
            camera = LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("cam"));
            localVideo =
                LibGst.gst_bin_get_by_name(pipeline, LibGst.Utf8("lv"));
        }

        self = GCHandle.Alloc(this);
        var data = GCHandle.ToIntPtr(self);
        LibGst.Connect(webrtc, "on-ice-candidate",
            (IntPtr)(delegate* unmanaged[Cdecl]<IntPtr, uint, IntPtr, IntPtr,
                void>)&OnIceCandidate,
            data);
        LibGst.Connect(webrtc, "pad-added",
            (IntPtr)(delegate* unmanaged[Cdecl]<IntPtr, IntPtr, IntPtr, void>)
            &OnPadAdded, data);
        LibGst.Connect(webrtc, "notify::connection-state",
            (IntPtr)(delegate* unmanaged[Cdecl]<IntPtr, IntPtr, IntPtr, void>)
            &OnConnectionState,
            data);
        LibGst.Connect(webrtc, "notify::ice-gathering-state",
            (IntPtr)(delegate* unmanaged[Cdecl]<IntPtr, IntPtr, IntPtr, void>)
            &OnGatheringState,
            data);
        AddServers();
        // A device chosen by the person is put in front of the queue that the launch text left open for it.
        if (microphone is not null)
            UseMicrophone(microphone);
        if (video && cameraName is not null)
            UseCamera(cameraName);
        LibGst.gst_element_set_state(pipeline, LibGst.StatePlaying);
    }

    private unsafe void AddServers()
    {
        foreach (var server in servers) {
            foreach (var url in server.Urls) {
                if (url.StartsWith("stun:", StringComparison.Ordinal)) {
                    LibGst.SetString(webrtc, "stun-server",
                        "stun://" + url[5..]);
                } else if (url.StartsWith("turn:", StringComparison.Ordinal)
                           || url.StartsWith("turns:",
                               StringComparison.Ordinal)) {
                    var scheme =
                        url.StartsWith("turns:", StringComparison.Ordinal)
                            ? "turns"
                            : "turn";
                    var rest = url[(scheme.Length + 1)..];
                    var credentials = server.Username is null
                        ? ""
                        : Uri.EscapeDataString(server.Username) + ":"
                        + Uri.EscapeDataString(
                            server.Credential ?? "") + "@";
                    var result = default(GValue);
                    LibGst.g_value_init(ref result, LibGst.TypeBoolean);
                    LibGst.Emit(webrtc, "add-turn-server", &result,
                        LibGst.Str($"{scheme}://{credentials}{rest}"));
                    LibGst.g_value_unset(ref result);
                }
            }
        }
    }

    /// <summary>Puts the microphone of that name in place of the one in use, in the middle of a call too; false when it is gone.</summary>
    public bool UseMicrophone(string name)
    {
        return Replace(ref audioSource, audioQueue, "Audio/Source", name,
            "mic-device");
    }

    public bool UseCamera(string name)
    {
        return Replace(ref videoSource, videoQueue, "Video/Source", name,
            "camera-device");
    }

    private bool Replace(ref IntPtr source, IntPtr queue, string deviceClass,
        string name,
        string elementName)
    {
        if (pipeline == IntPtr.Zero || queue == IntPtr.Zero)
            return false;
        var next = GstDevices.CreateSource(deviceClass, name, elementName);
        if (next == IntPtr.Zero)
            return false;
        // The new element is owned by the pipeline, and by this class too while it is the source.
        LibGst.gst_bin_add(pipeline, next);
        LibGst.g_object_ref(next);
        if (source != IntPtr.Zero) {
            LibGst.gst_element_set_state(source, LibGst.StateNull);
            LibGst.gst_element_unlink(source, queue);
            LibGst.gst_bin_remove(pipeline, source);
            LibGst.g_object_unref(source);
        }

        LibGst.gst_element_link(next, queue);
        LibGst.gst_element_sync_state_with_parent(next);
        source = next;
        return true;
    }

    public void SetMuted(bool muted)
    {
        if (volume != IntPtr.Zero)
            LibGst.SetBool(volume, "mute", muted);
    }

    public void SetCameraOff(bool off)
    {
        if (camera != IntPtr.Zero)
            LibGst.SetBool(camera, "drop", off);
    }

    private sealed class PromiseState(
        string key,
        TaskCompletionSource<SessionDescription?> done) {
        public string Key => key;
        public TaskCompletionSource<SessionDescription?> Done => done;
    }

    private unsafe Task<SessionDescription?> Ask(Action<IntPtr> emit,
        string key)
    {
        var done = new TaskCompletionSource<SessionDescription?>(
            TaskCreationOptions.RunContinuationsAsynchronously
        );
        var state = GCHandle.Alloc(new PromiseState(key, done));
        var promise = LibGst.gst_promise_new_with_change_func(
            (IntPtr)(delegate* unmanaged[Cdecl]<IntPtr, IntPtr, void>)
            &OnPromise,
            GCHandle.ToIntPtr(state),
            IntPtr.Zero
        );
        emit(promise);
        return done.Task;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private unsafe static void OnPromise(IntPtr promise, IntPtr data)
    {
        var handle = GCHandle.FromIntPtr(data);
        var state = (PromiseState)handle.Target!;
        try {
            SessionDescription? result = null;
            var reply = LibGst.gst_promise_get_reply(promise);
            if (state.Key.Length > 0 && reply != IntPtr.Zero) {
                var value =
                    LibGst.gst_structure_get_value(reply,
                        LibGst.Utf8(state.Key));
                if (value != IntPtr.Zero) {
                    var description = LibGst.g_value_get_boxed(value);
                    var type = *(int*)description;
                    var text =
                        LibGst.Text(
                            LibGst.gst_sdp_message_as_text(
                                *(IntPtr*)((byte*)description + 8)));
                    if (text is not null)
                        result =
                            new SessionDescription(
                                type == Offer ? "offer" : "answer", text);
                }
            }

            LibGst.gst_mini_object_unref(promise);
            if (state.Key.Length == 0 || result is not null)
                state.Done.TrySetResult(result);
            else
                state.Done.TrySetException(
                    new InvalidOperationException(
                        "the peer gave no description"));
        } catch (Exception e) {
            state.Done.TrySetException(e);
        } finally {
            handle.Free();
        }
    }

    public async Task<SessionDescription> CreateOffer()
    {
        return await Ask(
            p => LibGst.Emit(webrtc, "create-offer", LibGst.NoStructure(),
                LibGst.Promise(p)),
            "offer") ?? throw new InvalidOperationException("no offer");
    }

    public async Task<SessionDescription> CreateAnswer()
    {
        return await Ask(
            p => LibGst.Emit(webrtc, "create-answer", LibGst.NoStructure(),
                LibGst.Promise(p)),
            "answer") ?? throw new InvalidOperationException("no answer");
    }

    private IntPtr Native(SessionDescription d)
    {
        var bytes = System.Text.Encoding.UTF8.GetBytes(d.Sdp);
        LibGst.gst_sdp_message_new(out var message);
        if (LibGst.gst_sdp_message_parse_buffer(bytes, (uint)bytes.Length,
                message) != 0) {
            LibGst.gst_sdp_message_free(message);
            throw new InvalidOperationException(
                "the description cannot be read");
        }

        return LibGst.gst_webrtc_session_description_new(
            d.Type == "offer" ? Offer : Answer,
            message);
    }

    public async Task SetLocalDescription(SessionDescription description)
    {
        var native = Native(description);
        try {
            await Ask(p => LibGst.Emit(webrtc, "set-local-description",
                LibGst.Description(native),
                LibGst.Promise(p)), "");
        } finally {
            LibGst.gst_webrtc_session_description_free(native);
        }
    }

    public async Task SetRemoteDescription(SessionDescription description)
    {
        var native = Native(description);
        try {
            await Ask(p => LibGst.Emit(webrtc, "set-remote-description",
                LibGst.Description(native),
                LibGst.Promise(p)), "");
        } finally {
            LibGst.gst_webrtc_session_description_free(native);
        }
    }

    public Task AddIceCandidate(IceCandidate candidate)
    {
        if (webrtc != IntPtr.Zero)
            LibGst.Emit(webrtc, "add-ice-candidate",
                LibGst.UInt((uint)(candidate.SdpMLineIndex ?? 0)),
                LibGst.Str(candidate.Candidate));
        return Task.CompletedTask;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private unsafe static void OnIceCandidate(IntPtr element, uint mline,
        IntPtr candidate,
        IntPtr data)
    {
        var peer = (GstPeer)GCHandle.FromIntPtr(data).Target!;
        var text = LibGst.Text(candidate);
        if (text is not null)
            peer.Raise(() =>
                peer.Candidate?.Invoke(new IceCandidate(text, mline.ToString(),
                    (int)mline)));
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private unsafe static void OnGatheringState(IntPtr element, IntPtr spec,
        IntPtr data)
    {
        var peer = (GstPeer)GCHandle.FromIntPtr(data).Target!;
        // 2 is "complete": every candidate has been found.
        if (LibGst.GetInt(element, "ice-gathering-state") == 2)
            peer.Raise(() => peer.Candidate?.Invoke(null));
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private unsafe static void OnConnectionState(IntPtr element, IntPtr spec,
        IntPtr data)
    {
        var peer = (GstPeer)GCHandle.FromIntPtr(data).Target!;
        var state = LibGst.GetInt(element, "connection-state") switch {
            2 => (PeerState?)PeerState.Connected,
            3 => PeerState.Disconnected,
            4 => PeerState.Failed,
            _ => null,
        };
        if (state is { } s)
            peer.Raise(() => peer.Connection?.Invoke(s));
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private unsafe static void OnPadAdded(IntPtr element, IntPtr pad,
        IntPtr data)
    {
        var peer = (GstPeer)GCHandle.FromIntPtr(data).Target!;
        try {
            peer.Receive(pad);
        } catch (Exception e) {
            // A stream that cannot be shown leaves the call as it is.
            State.AppLog.Error("call stream: " + e.Message);
        }
    }

    /// <summary>A stream of the other side arrives: sound is decoded and played, a picture is decoded into the buffer the screen reads.</summary>
    private void Receive(IntPtr pad)
    {
        // What the pad carries is in its caps, which the RTP packets have already set; the order of the pads is not that of the m-lines.
        var media = "audio";
        var current = LibGst.gst_pad_get_current_caps(pad);
        if (current != IntPtr.Zero) {
            var kind = LibGst.Text(LibGst.gst_structure_get_string(
                LibGst.gst_caps_get_structure(current, 0),
                LibGst.Utf8("media")));
            LibGst.gst_mini_object_unref(current);
            if (kind == "video")
                media = "video";
        } else if (LibGst.KindOfPad(pad) == 2)
            media = "video";

        var chain = media == "video"
            ? "queue ! rtpvp8depay ! vp8dec ! videoconvert ! videoscale ! video/x-raw,format=BGRA ! "
              + "appsink name=rv max-buffers=1 drop=true sync=false"
            : $"queue ! rtpopusdepay ! opusdec ! audioconvert ! audioresample ! {sources.AudioSink}";
        var bin =
            LibGst.gst_parse_bin_from_description(LibGst.Utf8(chain), 1, out _);
        if (bin == IntPtr.Zero)
            return;
        LibGst.gst_bin_add(pipeline, bin);
        LibGst.gst_element_sync_state_with_parent(bin);
        var sink = LibGst.gst_element_get_static_pad(bin, LibGst.Utf8("sink"));
        LibGst.gst_pad_link(pad, sink);
        LibGst.g_object_unref(sink);
        if (media == "video") {
            lock (frameGate)
                remoteVideo =
                    LibGst.gst_bin_get_by_name(bin, LibGst.Utf8("rv"));
        }
    }

    /// <summary>Hands the newest picture of the other side to <paramref name="copy"/> (the pixels, width, height), if there is one not taken yet.</summary>
    public bool TryTakeFrame(Action<IntPtr, int, int> copy)
    {
        lock (frameGate)
            return Pull(remoteVideo, copy);
    }

    /// <summary>The same for my own camera.</summary>
    public bool TryTakeLocalFrame(Action<IntPtr, int, int> copy)
    {
        lock (frameGate)
            return Pull(localVideo, copy);
    }

    private unsafe bool Pull(IntPtr sink, Action<IntPtr, int, int> copy)
    {
        if (sink == IntPtr.Zero || closed)
            return false;
        var sample = LibGst.gst_app_sink_try_pull_sample(sink, 0);
        if (sample == IntPtr.Zero)
            return false;
        try {
            var caps = LibGst.gst_sample_get_caps(sample);
            var structure = LibGst.gst_caps_get_structure(caps, 0);
            LibGst.gst_structure_get_int(structure, LibGst.Utf8("width"),
                out var width);
            LibGst.gst_structure_get_int(structure, LibGst.Utf8("height"),
                out var height);
            var buffer = LibGst.gst_sample_get_buffer(sample);
            var info = default(GstMapInfo);
            if (LibGst.gst_buffer_map(buffer, &info, 1) == 0)
                return false;
            try {
                copy((IntPtr)info.Data, width, height);
            } finally {
                LibGst.gst_buffer_unmap(buffer, &info);
            }

            return true;
        } finally {
            LibGst.gst_mini_object_unref(sample);
        }
    }

    public void Close()
    {
        Dispose();
    }

    public void Dispose()
    {
        if (closed)
            return;
        closed = true;
        if (pipeline == IntPtr.Zero)
            return;
        LibGst.gst_element_set_state(pipeline, LibGst.StateNull);
        lock (frameGate) {
            if (remoteVideo != IntPtr.Zero)
                LibGst.g_object_unref(remoteVideo);
            remoteVideo = IntPtr.Zero;
            if (localVideo != IntPtr.Zero)
                LibGst.g_object_unref(localVideo);
            localVideo = IntPtr.Zero;
        }

        foreach (var element in new[] {
                     volume, camera, webrtc, audioSource, audioQueue,
                     videoSource, videoQueue
                 })
            if (element != IntPtr.Zero)
                LibGst.g_object_unref(element);
        LibGst.g_object_unref(pipeline);
        pipeline = IntPtr.Zero;
        if (self.IsAllocated)
            self.Free();
    }
}
