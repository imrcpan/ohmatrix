using OhMatrix.Core.State;

namespace OhMatrix.Desktop;

/// <summary>Where the engine of the app is made. Without the native Matrix SDK built, signing in is refused.</summary>
internal static class Engines {
    public static (IAuthEngine Auth, IRoomsEngine? Rooms, IChatEngine? Chats,
        IMediaEngine? Media,
        IProfileEngine? Profiles, IDevicesEngine? Devices, ILinkPreviewEngine?
        Links,
        ISecurityEngine? Security, IVerificationEngine? Verification,
        ICallsEngine? Calls,
        IStickersEngine? Stickers, ISearchEngine? Search, ISpacesEngine? Spaces)
        Create(
            string dataDirectory)
    {
#if OHMATRIX_NATIVE_SDK
        var auth = new OhMatrix.Engine.MatrixAuthEngine(dataDirectory);
        return (auth, new OhMatrix.Engine.MatrixRoomsEngine(auth),
            new OhMatrix.Engine.MatrixChatEngine(auth),
            new OhMatrix.Engine.MatrixMediaEngine(auth),
            new OhMatrix.Engine.MatrixProfileEngine(auth),
            new OhMatrix.Core.Engine.HttpDevicesEngine(() =>
                auth.CurrentSession),
            new OhMatrix.Core.Engine.HttpLinkPreviewEngine(() =>
                auth.CurrentSession),
            new OhMatrix.Engine.MatrixSecurityEngine(auth),
            new OhMatrix.Engine.MatrixVerificationEngine(auth),
            new OhMatrix.Engine.MatrixCallsEngine(auth),
            new OhMatrix.Engine.MatrixStickersEngine(auth),
            new OhMatrix.Core.Engine.HttpSearchEngine(() => auth.CurrentSession,
                id => null),
            new OhMatrix.Core.Engine.HttpSpacesEngine(() =>
                auth.CurrentSession));
#else
        return (new UnavailableEngine(), null, null, null, null, null, null, null, null, null,
            null, null, null);
#endif
    }
}
