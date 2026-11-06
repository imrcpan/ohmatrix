using OhMatrix.Core.State;

namespace OhMatrix.Desktop;

/// <summary>Where the engine of the app is made. Without the native Matrix SDK built, signing in is refused.</summary>
internal static class Engines {
    public static (IAuthEngine Auth, IRoomsEngine? Rooms, IChatEngine? Chats, IMediaEngine? Media)
        Create(
            string dataDirectory)
    {
#if OHMATRIX_NATIVE_SDK
        var auth = new OhMatrix.Engine.MatrixAuthEngine(dataDirectory);
        return (auth, new OhMatrix.Engine.MatrixRoomsEngine(auth), new OhMatrix.Engine.MatrixChatEngine(auth), new OhMatrix.Engine.MatrixMediaEngine(auth));
#else
        return (new UnavailableEngine(), null, null, null);
#endif
    }
}
