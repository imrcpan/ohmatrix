using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that verifies this session with another one (<c>verification</c> of the TypeScript core).</summary>
public interface IVerificationEngine {
    /// <summary>The verification moved on (a request came in, the pictures arrived, it ended). May come from any thread.</summary>
    event Action<VerifyFlow>? Changed;

    /// <summary>Starts to receive the requests of other sessions; once after sign-in.</summary>
    Task Listen();

    /// <summary>Asks my other sessions to verify this one.</summary>
    Task Request();

    /// <summary>Accepts the request that came in.</summary>
    Task Accept();

    /// <summary>Says whether the pictures matched.</summary>
    Task Confirm(bool match);

    /// <summary>Stops the verification, if one is going on.</summary>
    Task Cancel();
}
