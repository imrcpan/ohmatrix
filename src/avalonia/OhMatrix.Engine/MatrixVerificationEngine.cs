#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>The verification with another session over the Matrix SDK (<c>verification</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixVerificationEngine(MatrixAuthEngine auth) : IVerificationEngine {
    private SessionVerificationController? controller;
    private Client? owner;
    private bool incoming;

    public event Action<VerifyFlow>? Changed;

    private async Task<SessionVerificationController> Controller()
    {
        var client = auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
        // A new sign-in is a new client with its own controller.
        if (!ReferenceEquals(owner, client)) {
            owner = client;
            controller = null;
        }

        return controller ??= await client.GetSessionVerificationController();
    }

    public async Task Listen()
    {
        try {
            (await Controller()).SetDelegate(new Listener(this));
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task Request()
    {
        try {
            incoming = false;
            await (await Controller()).RequestDeviceVerification();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task Accept()
    {
        try {
            await (await Controller()).AcceptVerificationRequest();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task Confirm(bool match)
    {
        try {
            var c = await Controller();
            if (match)
                await c.ApproveVerification();
            else
                await c.DeclineVerification();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task Cancel()
    {
        try {
            await (await Controller()).CancelVerification();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private void Tell(VerifyPhase phase, string? who = null, IReadOnlyList<VerifyEmoji>? emojis =
 null)
    {
        Changed?.Invoke(new VerifyFlow(phase, incoming, who, emojis));
    }

    // The SDK calls these from its own threads; a failure inside must not travel back into Rust.
    private sealed class Listener(MatrixVerificationEngine engine) : SessionVerificationControllerDelegate {
        public void DidReceiveVerificationRequest(SessionVerificationRequestDetails details)
        {
            engine.incoming = true;
            var who = details.DeviceDisplayName ?? details.DeviceId;
            _ = Acknowledge(details, who);
        }

        private async Task Acknowledge(SessionVerificationRequestDetails details, string who)
        {
            try {
                await (await engine.Controller())
                    .AcknowledgeVerificationRequest(details.SenderProfile.UserId, details.FlowId);
                engine.Tell(VerifyPhase.Requested, who);
            } catch (Exception) {
                engine.Tell(VerifyPhase.Failed);
            }
        }

        public void DidAcceptVerificationRequest()
        {
            _ = Start();
        }

        private async Task Start()
        {
            try {
                engine.Tell(VerifyPhase.Waiting);
                await (await engine.Controller()).StartSasVerification();
            } catch (Exception) {
                engine.Tell(VerifyPhase.Failed);
            }
        }

        public void DidStartSasVerification()
        {
            engine.Tell(VerifyPhase.Waiting);
        }

        public void DidReceiveVerificationData(SessionVerificationData data)
        {
            if (data is SessionVerificationData.Emojis shown) {
                engine.Tell(
                    VerifyPhase.Emojis,
                    null,
                    shown.EmojisValue.Select(e => new VerifyEmoji(e.Symbol(), e.Description()))
                        .ToList()
                );
            } else
                engine.Tell(VerifyPhase.Failed);
        }

        public void DidFail()
        {
            engine.Tell(VerifyPhase.Failed);
        }

        public void DidCancel()
        {
            engine.Tell(VerifyPhase.Cancelled);
        }

        public void DidFinish()
        {
            engine.Tell(VerifyPhase.Done);
        }
    }
}
#endif
