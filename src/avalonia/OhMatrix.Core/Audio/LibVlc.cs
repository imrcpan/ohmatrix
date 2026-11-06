using System.Reflection;
using System.Runtime.InteropServices;

namespace OhMatrix.Core.Audio;

/// <summary>
/// The few functions of libvlc the player needs, called directly (no wrapper package). The library is the one of the system's VLC, found at
/// run time: where there is none, <see cref="Available"/> is false and the app opens files with the program of the system instead.
/// </summary>
internal static partial class LibVlc {
    private const string Name = "vlc";

    private static readonly string[] Candidates = [
        "libvlc.so.5", "libvlc.so", "libvlc.dll",
        "/Applications/VLC.app/Contents/MacOS/lib/libvlc.dylib",
        "C:\\Program Files\\VideoLAN\\VLC\\libvlc.dll",
    ];

    private static IntPtr library;
    private static IntPtr instance;
    private static bool tried;

    /// <summary>The state numbers of <c>libvlc_state_t</c> that matter here.</summary>
    public const int Playing = 3;

    public const int Paused = 4;
    public const int Ended = 6;
    public const int Error = 7;

    static LibVlc()
    {
        NativeLibrary.SetDllImportResolver(typeof(LibVlc).Assembly, Resolve);
    }

    private static IntPtr Resolve(string name, Assembly assembly, DllImportSearchPath? path)
    {
        if (name != Name)
            return IntPtr.Zero;
        if (library != IntPtr.Zero)
            return library;
        foreach (var candidate in Candidates) {
            if (NativeLibrary.TryLoad(candidate, out var handle))
                return library = handle;
        }

        return IntPtr.Zero;
    }

    /// <summary>The VLC instance of the app, made on first use; null when libvlc is not on the system.</summary>
    public static IntPtr Instance()
    {
        if (tried)
            return instance;
        tried = true;
        try {
            instance = libvlc_new(3, ["--no-video", "--quiet", "--no-xlib"]);
        } catch (Exception e) when (e is DllNotFoundException or EntryPointNotFoundException) {
            instance = IntPtr.Zero;
        }

        return instance;
    }

    public static bool Available => Instance() != IntPtr.Zero;

    public static byte[] Utf8(string text)
    {
        return [.. System.Text.Encoding.UTF8.GetBytes(text), 0];
    }

    [LibraryImport(Name)]
    private static partial IntPtr libvlc_new(
        int argc,
        [MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPUTF8Str)]
        string[] argv
    );

    [LibraryImport(Name)]
    public static partial IntPtr libvlc_media_new_path(IntPtr instance, byte[] path);

    [LibraryImport(Name)]
    public static partial void libvlc_media_release(IntPtr media);

    [LibraryImport(Name)]
    public static partial IntPtr libvlc_media_player_new_from_media(IntPtr media);

    [LibraryImport(Name)]
    public static partial int libvlc_media_player_play(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_set_pause(IntPtr player, int pause);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_stop(IntPtr player);

    [LibraryImport(Name)]
    public static partial long libvlc_media_player_get_time(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_set_time(IntPtr player, long ms);

    [LibraryImport(Name)]
    public static partial long libvlc_media_player_get_length(IntPtr player);

    [LibraryImport(Name)]
    public static partial int libvlc_media_player_get_state(IntPtr player);

    [LibraryImport(Name)]
    public static partial void libvlc_media_player_release(IntPtr player);
}
