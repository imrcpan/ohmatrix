using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that signs in and out (<c>AuthApi</c> of the TypeScript core). Failures are <see cref="EngineException"/>.</summary>
public interface IAuthEngine {
    Task<Session> LoginWithPassword(string homeserver, string username,
        string password);

    /// <summary>
    /// Creates an account with a username and a password and signs in as it. Only servers that need nothing more can be registered on: any other
    /// is <see cref="EngineErrorCode.Unsupported"/>, one with registration closed is <see cref="EngineErrorCode.Forbidden"/>, a taken name is
    /// <see cref="EngineErrorCode.Conflict"/>, and a server that wants a registration token says <see cref="EngineErrorCode.TokenRequired"/> or
    /// <see cref="EngineErrorCode.TokenInvalid"/>.
    /// </summary>
    Task<Session> Register(string homeserver, string username, string password,
        string? token);

    Task Restore(Session session);
    Task Logout();
}
