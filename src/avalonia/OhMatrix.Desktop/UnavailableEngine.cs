using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Desktop;

/// <summary>The engine of a build without the native Matrix SDK: nothing can be signed in to.</summary>
internal sealed class UnavailableEngine : IAuthEngine {
    private static readonly EngineException Missing = new(
        EngineErrorCode.Unsupported,
        "This build has no Matrix SDK (run src/rust/build-native.sh)."
    );

    public Task<Session> LoginWithPassword(string homeserver, string username,
        string password)
    {
        return Task.FromException<Session>(Missing);
    }

    public Task<Session> Register(string homeserver, string username,
        string password,
        string? token)
    {
        return Task.FromException<Session>(Missing);
    }

    public Task Restore(Session session)
    {
        return Task.FromException(Missing);
    }

    public Task Logout()
    {
        return Task.CompletedTask;
    }
}
