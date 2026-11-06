using OhMatrix.Core.State;

namespace OhMatrix.Core.Calls.Gst;

/// <summary>Calls on this machine through GStreamer: <see cref="Available"/> is false where GStreamer or its WebRTC element is not installed.</summary>
public sealed class GstCallPlatform(GstSources? sources = null) : ICallPlatform {
    private readonly GstCallMedia media = new();

    public bool Available => LibGst.Available;

    public ICallMedia Media => media;

    public IPeer NewPeer(IReadOnlyList<IceServer> servers)
    {
        var peer = new GstPeer(servers, sources);
        media.Current = peer;
        return peer;
    }

    public bool TakeLocalFrame(Action<IntPtr, int, int> copy)
    {
        return media.Current?.TryTakeLocalFrame(copy) == true;
    }

    public bool TakeRemoteFrame(Action<IntPtr, int, int> copy)
    {
        return media.Current?.TryTakeFrame(copy) == true;
    }
}

/// <summary>The microphone and camera of a call: they start on the peer of the call and are muted or switched off there.</summary>
internal sealed class GstCallMedia : ICallMedia {
    private bool muted;
    private bool cameraOff;

    public GstPeer? Current { get; set; }

    public string? StreamId { get; } = "ohmatrix-" + Guid.NewGuid().ToString("N")[..8];

    public Task Start(IPeer peer, bool video)
    {
        if (peer is not GstPeer gst)
            throw new InvalidOperationException("not a GStreamer peer");
        gst.AddLocalMedia(video);
        gst.SetMuted(muted);
        gst.SetCameraOff(cameraOff);
        return Task.CompletedTask;
    }

    public void SetMuted(bool value)
    {
        muted = value;
        Current?.SetMuted(value);
    }

    public void SetCameraOff(bool value)
    {
        cameraOff = value;
        Current?.SetCameraOff(value);
    }

    public void Stop()
    {
        muted = false;
        cameraOff = false;
        Current?.Dispose();
        Current = null;
    }
}
