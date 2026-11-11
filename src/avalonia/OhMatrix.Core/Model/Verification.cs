namespace OhMatrix.Core.Model;

/// <summary>How far a verification with another session has come (<c>VerificationFlow</c> of the TypeScript core).</summary>
public enum VerifyPhase {
    /// <summary>Asked, not yet answered; for a request that came in, it waits for accept or decline.</summary>
    Requested,

    /// <summary>Accepted: the other side has to do its part.</summary>
    Waiting,

    /// <summary>The pictures to compare are on screen.</summary>
    Emojis,
    Done,
    Cancelled,
    Failed,
}

/// <summary>One of the seven pictures to compare.</summary>
public sealed record VerifyEmoji(string Symbol, string Description);

/// <summary>The verification on screen.</summary>
public sealed record VerifyFlow(
    VerifyPhase Phase,
    bool Incoming,
    string? Who = null,
    IReadOnlyList<VerifyEmoji>? Emojis = null
) {
    /// <summary>It is over, one way or the other.</summary>
    public bool Ended => Phase is VerifyPhase.Done or VerifyPhase.Cancelled
        or VerifyPhase.Failed;

    /// <summary>The flow after an event of the engine, as <c>flowAfter</c> of the TypeScript core: an ended flow stays until the screen forgets it.</summary>
    public static VerifyFlow? After(VerifyFlow? flow, VerifyFlow next)
    {
        if (next.Phase == VerifyPhase.Requested)
            return next;
        if (flow == null || flow.Phase == VerifyPhase.Done)
            return flow;
        if (flow.Ended && next.Phase != VerifyPhase.Done)
            return flow;
        return next with {
            Incoming = flow.Incoming,
            Who = next.Who ?? flow.Who
        };
    }
}
