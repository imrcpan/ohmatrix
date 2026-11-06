namespace OhMatrix.Core.Model;

/// <summary>Why an engine call failed, in words the UI can turn into a message of its own (<c>EngineErrorCode</c> of the TypeScript core).</summary>
public enum EngineErrorCode {
    /// <summary>Transient: try again later.</summary>
    Network,

    /// <summary>The token is invalid or expired, or the device was signed out remotely: sign in again.</summary>
    Unauthorized,
    Forbidden,

    /// <summary>It exists already (a username, a room address).</summary>
    Conflict,
    NotFound,
    RateLimited,

    /// <summary>The keys of this device are gone: it cannot be used any more.</summary>
    KeysLost,
    UnsupportedType,
    TooLarge,

    /// <summary>The engine or the homeserver lacks the capability.</summary>
    Unsupported,

    /// <summary>The server creates accounts only with a registration token, and none was given.</summary>
    TokenRequired,

    /// <summary>The registration token is not valid (wrong, used up or expired).</summary>
    TokenInvalid,
    Unknown,
}

/// <summary>The only kind of exception an engine lets out.</summary>
public sealed class EngineException(
    EngineErrorCode code,
    string message,
    Exception? inner = null
) : Exception(message, inner) {
    public EngineErrorCode Code { get; } = code;
}
