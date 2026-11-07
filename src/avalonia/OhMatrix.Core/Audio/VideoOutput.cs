using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

namespace OhMatrix.Core.Audio;

/// <summary>
/// Where the frames of a clip land: libvlc draws each one into a buffer here (32 bits a pixel, blue first, the order of
/// <c>Bgra8888</c>), and the screen copies the latest into a bitmap. No native window is involved, so it works the same on every platform.
/// </summary>
public sealed unsafe class VideoOutput : IDisposable {
    /// <summary>The biggest picture asked of libvlc, which scales to it: a chat clip needs no more.</summary>
    private const uint MaxWidth = 960;

    private readonly object gate = new();
    private GCHandle self;
    private byte* buffer;
    private bool fresh;

    public int Width { get; private set; }

    public int Height { get; private set; }

    /// <summary>Hands the latest frame to <paramref name="copy"/> (the buffer, its width, height and bytes in a row) when there is one not seen yet.</summary>
    public bool TryTakeFrame(Action<IntPtr, int, int> copy)
    {
        lock (gate) {
            if (!fresh || buffer == null)
                return false;
            fresh = false;
            copy((IntPtr)buffer, Width, Height);
            return true;
        }
    }

    internal void Attach(IntPtr player)
    {
        self = GCHandle.Alloc(this);
        LibVlc.libvlc_video_set_format_callbacks(player, &Setup, &Cleanup);
        LibVlc.libvlc_video_set_callbacks(player, &Lock, &Unlock, &Display,
            GCHandle.ToIntPtr(self));
    }

    private static VideoOutput Of(IntPtr opaque)
    {
        return (VideoOutput)GCHandle.FromIntPtr(opaque).Target!;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static uint Setup(IntPtr* opaque, byte* chroma, uint* width,
        uint* height,
        uint* pitches, uint* lines)
    {
        var output = Of(*opaque);
        chroma[0] = (byte)'R';
        chroma[1] = (byte)'V';
        chroma[2] = (byte)'3';
        chroma[3] = (byte)'2';
        if (*width > MaxWidth) {
            *height = (uint)((ulong)*height * MaxWidth / *width);
            *width = MaxWidth;
        }

        // An odd size is rounded down: the converter wants even sides.
        *width &= ~1u;
        *height &= ~1u;
        lock (output.gate) {
            if (output.buffer != null)
                NativeMemory.Free(output.buffer);
            output.Width = (int)*width;
            output.Height = (int)*height;
            output.buffer =
                (byte*)NativeMemory.AllocZeroed(*width * *height * 4);
        }

        pitches[0] = *width * 4;
        lines[0] = *height;
        return 1;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Cleanup(IntPtr opaque)
    {
    }

    // Held from lock to unlock, so the screen never copies a half-drawn frame.
    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static IntPtr Lock(IntPtr opaque, IntPtr* planes)
    {
        var output = Of(opaque);
        Monitor.Enter(output.gate);
        *planes = (IntPtr)output.buffer;
        return IntPtr.Zero;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Unlock(IntPtr opaque, IntPtr picture, IntPtr* planes)
    {
        var output = Of(opaque);
        output.fresh = true;
        Monitor.Exit(output.gate);
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Display(IntPtr opaque, IntPtr picture)
    {
    }

    public void Dispose()
    {
        lock (gate) {
            if (buffer != null)
                NativeMemory.Free(buffer);
            buffer = null;
        }

        if (self.IsAllocated)
            self.Free();
    }
}
