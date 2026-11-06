using System.Text.Json.Nodes;
using OhMatrix.Core.Calls;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that carries the events of calls: the SDK sends and receives them, the app owns the conversation (<see cref="CallSignalling"/>).</summary>
public interface ICallsEngine {
    /// <summary>A call event arrived in any room the account is in. Comes from any thread.</summary>
    event Action<CallEvent>? CallEvent;

    /// <summary>Starts to receive the call events; once after sign-in.</summary>
    Task Listen();

    Task SendCallEvent(string roomId, string type, JsonObject content);

    /// <summary>The TURN servers the homeserver offers; empty when it offers none.</summary>
    Task<IReadOnlyList<IceServer>> TurnServers();
}

/// <summary>What the machine gives a call to be made with: a WebRTC peer connection and the microphone and camera.</summary>
public interface ICallPlatform {
    /// <summary>Whether this machine can make calls at all (its media library is there).</summary>
    bool Available { get; }

    IPeer NewPeer(IReadOnlyList<IceServer> servers);

    ICallMedia Media { get; }
}
