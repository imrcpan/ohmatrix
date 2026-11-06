#if OHMATRIX_NATIVE_SDK
using System.Text.Json.Nodes;
using OhMatrix.Core.Calls;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>The events of calls over the Matrix SDK: its call-event subscription brings them in, <c>Room.SendRaw</c> sends them (<c>RustCalls</c> of the TypeScript engine).</summary>
public sealed class MatrixCallsEngine(MatrixAuthEngine auth) : ICallsEngine {
    private readonly HttpTurnServers turn = new(() => auth.CurrentSession);
    private CallEventSubscription? subscription;
    private Client? subscribed;

    public event Action<Core.Calls.CallEvent>? CallEvent;

    public Task Listen()
    {
        var client = auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
        // A new sign-in is a new client, which has to be listened to again.
        if (!ReferenceEquals(subscribed, client)) {
            subscription?.Dispose();
            subscribed = client;
            subscription = client.SubscribeToCallEvents(new Listener(this));
        }

        return Task.CompletedTask;
    }

    public async Task SendCallEvent(string roomId, string type, JsonObject content)
    {
        var client = auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
        var room = client.GetRoom(roomId) ?? throw new EngineException(
            EngineErrorCode.NotFound,
            "No such room."
        );
        try {
            await room.SendRaw(type, content.ToJsonString());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public Task<IReadOnlyList<IceServer>> TurnServers()
    {
        return turn.Get();
    }

    // The SDK calls from its own threads; a failure inside must not travel back into Rust.
    private sealed class Listener(MatrixCallsEngine engine) : CallEventListener {
        public void OnCallEvent(
            string roomId,
            string eventType,
            string sender,
            string eventId,
            ulong ageMs,
            string contentJson
        )
        {
            try {
                if (JsonNode.Parse(contentJson) is JsonObject content)
                    engine.CallEvent?.Invoke(new Core.Calls.CallEvent(roomId, eventType, sender,
                        eventId, (long)ageMs, content));
            } catch (Exception) {
                // An event that cannot be read is not one of a call.
            }
        }
    }
}
#endif
