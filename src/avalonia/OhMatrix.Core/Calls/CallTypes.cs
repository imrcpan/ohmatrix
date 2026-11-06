using System.Text.Json.Nodes;

namespace OhMatrix.Core.Calls;

public sealed record IceServer(
    IReadOnlyList<string> Urls,
    string? Username = null,
    string? Credential = null);

/// <summary>An SDP offer or answer; <see cref="Type"/> is "offer" or "answer".</summary>
public sealed record SessionDescription(string Type, string Sdp);

public sealed record IceCandidate(string Candidate, string? SdpMid, int? SdpMLineIndex);

public enum PeerState {
    Connected,
    Disconnected,
    Failed,
}

/// <summary>What the conversation needs of a WebRTC peer connection (<c>Peer</c> of the TypeScript signalling).</summary>
public interface IPeer {
    Task<SessionDescription> CreateOffer();

    Task<SessionDescription> CreateAnswer();

    Task SetLocalDescription(SessionDescription description);

    Task SetRemoteDescription(SessionDescription description);

    Task AddIceCandidate(IceCandidate candidate);

    void Close();

    /// <summary>A candidate this side found; null when it has found them all.</summary>
    event Action<IceCandidate?>? Candidate;

    /// <summary>The connection is up or has gone down.</summary>
    event Action<PeerState>? Connection;
}

/// <summary>The microphone and camera, and what the other side sends.</summary>
public interface ICallMedia {
    /// <summary>Starts the microphone (and the camera, for video) and puts them on <paramref name="peer"/>; throws when they cannot be had.</summary>
    Task Start(IPeer peer, bool video);

    void SetMuted(bool muted);

    void SetCameraOff(bool off);

    /// <summary>The id of the local stream, by which the other side's SDP names it.</summary>
    string? StreamId { get; }

    void Stop();
}

public interface ICallTransport {
    /// <summary>Sends a call event into the room; <paramref name="content"/> is its JSON.</summary>
    Task Send(string roomId, string type, JsonObject content);

    IPeer NewPeer(IReadOnlyList<IceServer> servers);

    /// <summary>The TURN servers the homeserver offers (empty when it offers none).</summary>
    Task<IReadOnlyList<IceServer>> IceServers();

    ICallMedia Media { get; }

    DateTimeOffset Now { get; }

    /// <summary>Calls <paramref name="action"/> once after <paramref name="delay"/>; the result cancels it.</summary>
    Action Later(Action action, TimeSpan delay);

    string NewId();
}

public enum EndReason {
    Hangup,
    Rejected,
    Cancelled,
    Busy,
    Unanswered,
    Failed,
    NoMedia,
}

public enum CallPhase {
    Ringing,
    Connecting,
    Connected,
    Ended,
}

/// <summary>The call as the screen shows it (<c>CallState</c> of the TypeScript core).</summary>
public sealed record CallInfo {
    public required string CallId { get; init; }
    public required string RoomId { get; init; }

    /// <summary>The other person's user id.</summary>
    public required string Peer { get; init; }

    public bool Video { get; init; }
    public bool Incoming { get; init; }
    public CallPhase Phase { get; init; } = CallPhase.Ringing;
    public EndReason? EndReason { get; init; }
    public DateTimeOffset? ConnectedAt { get; init; }
    public bool Muted { get; init; }
    public bool CameraOff { get; init; }

    /// <summary>The connection dropped and has not come back.</summary>
    public bool Poor { get; init; }
}

/// <summary>An event of the call kind, as the SDK's subscription delivers it.</summary>
public sealed record CallEvent(
    string RoomId,
    string Type,
    string Sender,
    string EventId,
    long AgeMs,
    JsonObject Content
);
