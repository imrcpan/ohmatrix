using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

public enum AuthStatus {
    Booting,
    SignedOut,
    SigningIn,
    SignedIn,
}

/// <summary>What the screens show (<c>AppState</c> of the TypeScript state package). Grows with the screens.</summary>
public sealed record AppState {
    public AuthStatus Auth { get; init; } = AuthStatus.Booting;
    public string? AuthError { get; init; }

    /// <summary>Why the sign-in failed, so that the screen can word it in the language of the person.</summary>
    public EngineErrorCode? AuthErrorCode { get; init; }

    public string? UserId { get; init; }
    public string? Homeserver { get; init; }
    public Preferences Prefs { get; init; } = new();
}
