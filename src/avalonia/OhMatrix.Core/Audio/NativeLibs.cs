using System.Reflection;
using System.Runtime.InteropServices;

namespace OhMatrix.Core.Audio;

/// <summary>
/// Finds the media libraries of the system at run time (VLC for playing, GStreamer for calls), by a short name each P/Invoke uses. There is one
/// resolver for the assembly, so every library is listed here. A library that is not there is a <see cref="DllNotFoundException"/> where it is
/// used, which the callers turn into "not available".
/// </summary>
internal static class NativeLibs {
    private const string Frameworks =
        "/Library/Frameworks/GStreamer.framework/Libraries/";

    private static readonly Dictionary<string, string[]> Candidates = new() {
        ["vlc"] = [
            "libvlc.so.5", "libvlc.so", "libvlc.dll",
            "/Applications/VLC.app/Contents/MacOS/lib/libvlc.dylib",
            "C:\\Program Files\\VideoLAN\\VLC\\libvlc.dll",
        ],
        ["gst"] = [
            "libgstreamer-1.0.so.0", "gstreamer-1.0-0.dll",
            Frameworks + "libgstreamer-1.0.0.dylib",
            "libgstreamer-1.0.0.dylib",
        ],
        ["gobject"] = [
            "libgobject-2.0.so.0", "gobject-2.0-0.dll",
            Frameworks + "libgobject-2.0.0.dylib",
            "libgobject-2.0.0.dylib",
        ],
        ["glib"] = [
            "libglib-2.0.so.0", "glib-2.0-0.dll",
            Frameworks + "libglib-2.0.0.dylib",
            "libglib-2.0.0.dylib",
        ],
        ["gstsdp"] = [
            "libgstsdp-1.0.so.0", "gstsdp-1.0-0.dll",
            Frameworks + "libgstsdp-1.0.0.dylib",
            "libgstsdp-1.0.0.dylib",
        ],
        ["gstwebrtc"] = [
            "libgstwebrtc-1.0.so.0", "gstwebrtc-1.0-0.dll",
            Frameworks + "libgstwebrtc-1.0.0.dylib",
            "libgstwebrtc-1.0.0.dylib",
        ],
        ["gstapp"] = [
            "libgstapp-1.0.so.0", "gstapp-1.0-0.dll",
            Frameworks + "libgstapp-1.0.0.dylib",
            "libgstapp-1.0.0.dylib",
        ],
    };

    private static readonly Dictionary<string, IntPtr> Loaded = new();

    static NativeLibs()
    {
        NativeLibrary.SetDllImportResolver(typeof(NativeLibs).Assembly,
            Resolve);
    }

    /// <summary>Makes sure the resolver is in place before the first call into a library.</summary>
    public static void Init()
    {
    }

    private static IntPtr Resolve(string name, Assembly assembly,
        DllImportSearchPath? path)
    {
        if (!Candidates.TryGetValue(name, out var names))
            return IntPtr.Zero;
        lock (Loaded) {
            if (Loaded.TryGetValue(name, out var known))
                return known;
            foreach (var candidate in names) {
                if (NativeLibrary.TryLoad(candidate, out var handle))
                    return Loaded[name] = handle;
            }
        }

        return IntPtr.Zero;
    }
}
