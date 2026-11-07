using System.Text.Json.Nodes;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Calls;

/// <summary>Joins the conversation of a call to the engine that carries its events and the platform that makes its media.</summary>
public sealed class CallTransport(
    ICallsEngine engine,
    ICallPlatform platform,
    TimeProvider time,
    Action<Action> post
) : ICallTransport {
    public Task Send(string roomId, string type, JsonObject content)
    {
        return engine.SendCallEvent(roomId, type, content);
    }

    public IPeer NewPeer(IReadOnlyList<IceServer> servers)
    {
        return platform.NewPeer(servers);
    }

    public Task<IReadOnlyList<IceServer>> IceServers()
    {
        return engine.TurnServers();
    }

    public ICallMedia Media => platform.Media;

    public DateTimeOffset Now => time.GetUtcNow();

    public Action Later(Action action, TimeSpan delay)
    {
        // The timer fires on a pool thread; what it does belongs to the UI thread, like everything of the conversation.
        var timer = time.CreateTimer(_ => post(action), null, delay,
            Timeout.InfiniteTimeSpan);
        return () => timer.Dispose();
    }

    public string NewId()
    {
        return Guid.NewGuid().ToString("N")[..12];
    }
}
