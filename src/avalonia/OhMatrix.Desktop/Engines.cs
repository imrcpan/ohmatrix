using OhMatrix.Core.State;

namespace OhMatrix.Desktop;

/// <summary>Where the engine of the app is made. Without the native Matrix SDK built, signing in is refused.</summary>
internal static class Engines {
    public static IAuthEngine Create(string dataDirectory)
    {
        return new UnavailableEngine();
    }
}
