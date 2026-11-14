using System.Runtime.InteropServices;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Audio;

/// <summary>
/// The few functions of libvlc the player needs, called directly (no wrapper package). The library is the one of the system's VLC, found at
/// run time: where there is none, <see cref="Available"/> is false and the app opens files with the program of the system instead.
/// </summary>
internal static partial class LibVlc {
    private static readonly Logger logger = Logger.GetDefault();

    private const string Name = "vlc";

    private static IntPtr instance;
    private static IntPtr videoInstance;
    private static bool tried;
    private static bool triedVideo;

    /// <summary>The state numbers of <c>libvlc_state_t</c> that matter here.</summary>
    public const int Playing = 3;

    public const int Paused = 4;
    public const int Ended = 6;
    public const int Error = 7;

    static LibVlc()
    {
        NativeLibs.Init();
    }

    /// <summary>The VLC instance of the app, made on first use; null when libvlc is not on the system.</summary>
    public static IntPtr Instance()
    {
        if (tried)
            return instance;
        tried = true;
        try {
            instance = libvlc_new(3, ["--no-video", "--quiet", "--no-xlib"]);
        } catch (Exception e) when (e is DllNotFoundException
                                        or EntryPointNotFoundException) {
            logger.Caught("load libvlc", e);
            instance = IntPtr.Zero;
        }

        return instance;
    }

    /// <summary>The instance for clips with a picture: without <c>--no-video</c>, so the frames go to the callbacks set on the player.</summary>
    public static IntPtr VideoInstance()
    {
        if (triedVideo)
            return videoInstance;
        triedVideo = true;
        try {
            videoInstance = libvlc_new(2, ["--quiet", "--no-xlib"]);
        } catch (Exception e) when (e is DllNotFoundException
                                        or EntryPointNotFoundException) {
            logger.Caught("load libvlc for video", e);
            videoInstance = IntPtr.Zero;
        }

        return videoInstance;
    }

    public static bool Available => Instance() != IntPtr.Zero;

    public static byte[] Utf8(string text)
    {
        return [.. System.Text.Encoding.UTF8.GetBytes(text), 0];
    }

    [LibraryImport(Name)]
    private static partial IntPtr libvlc_new(
        int argc,
        [MarshalAs(UnmanagedType.LPArray,
            ArraySubType = UnmanagedType.LPUTF8Str)]
        string[] argv
    );

    [LibraryImport(Name)]
    public static partial IntPtr libvlc_media_new_path(IntPtr instance,
        byte[] path);

    [LibraryImport(Name)]
    public static partial void libvlc_media_release(IntPtr media);

    [LibraryImport(Name)]
    public static partial IntPtr libvlc_media_player_new_from_media(
        IntPtr media);

    [LibraryImport(Name)]
    public static partial int libvlc_media_player_play(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_set_pause(IntPtr player,
        int pause);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_stop(IntPtr player);

    [LibraryImport(Name)]
    public static partial long libvlc_media_player_get_time(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_set_time(IntPtr player,
        long ms);

    [LibraryImport(Name)]
    public static partial long libvlc_media_player_get_length(IntPtr player);

    [LibraryImport(Name)]
    public static partial int libvlc_media_player_get_state(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_release(IntPtr player);

    [LibraryImport(Name)]
    public static unsafe partial void libvlc_video_set_callbacks(
        IntPtr player,
        delegate* unmanaged[Cdecl]<IntPtr, IntPtr*, IntPtr> @lock,
        delegate* unmanaged[Cdecl]<IntPtr, IntPtr, IntPtr*, void> unlock,
        delegate* unmanaged[Cdecl]<IntPtr, IntPtr, void> display,
        IntPtr opaque
    );

    [LibraryImport(Name)]
    public static unsafe partial void libvlc_video_set_format_callbacks(
        IntPtr player,
        delegate* unmanaged[Cdecl]<IntPtr*, byte*, uint*, uint*, uint*, uint*,
            uint> setup,
        delegate* unmanaged[Cdecl]<IntPtr, void> cleanup
    );
}
