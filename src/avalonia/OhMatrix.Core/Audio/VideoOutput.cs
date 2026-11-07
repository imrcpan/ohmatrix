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

    // Three buffers, so that nobody waits for anybody to copy: libvlc draws
    // into one, the last drawn frame waits in another, and the screen copies
    // the third. Frames pass between them by swapping, which is all that is
    // done under the lock.
    private const int Draw = 0;
    private const int Ready = 1;
    private const int Read = 2;

    private readonly object gate = new();
    private readonly IntPtr[] buffers = new IntPtr[3];
    private GCHandle self;
    private bool fresh;
    private int readers;

    public int Width { get; private set; }

    public int Height { get; private set; }

    /// <summary>Hands the latest frame to <paramref name="copy"/> (the buffer, its width, height and bytes in a row) when there is one not seen yet.</summary>
    public bool TryTakeFrame(Action<IntPtr, int, int> copy)
    {
        IntPtr frame;
        int width;
        int height;
        lock (gate) {
            if (!fresh || buffers[Ready] == IntPtr.Zero)
                return false;
            fresh = false;
            (buffers[Ready], buffers[Read]) = (buffers[Read], buffers[Ready]);
            frame = buffers[Read];
            width = Width;
            height = Height;
            readers++;
        }

        // The copy runs outside the lock: the decoder goes on drawing into
        // another buffer meanwhile.
        try {
            copy(frame, width, height);
        } finally {
            lock (gate) {
                readers--;
                Monitor.PulseAll(gate);
            }
        }

        return true;
    }

    // Buffers are only freed or replaced when no copy is going on.
    private void WaitForReaders()
    {
        while (readers > 0)
            Monitor.Wait(gate);
    }

    private void FreeBuffers()
    {
        for (var i = 0; i < buffers.Length; i++) {
            if (buffers[i] != IntPtr.Zero)
                NativeMemory.Free((void*)buffers[i]);
            buffers[i] = IntPtr.Zero;
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
            output.WaitForReaders();
            output.FreeBuffers();
            output.Width = (int)*width;
            output.Height = (int)*height;
            for (var i = 0; i < output.buffers.Length; i++)
                output.buffers[i] = (IntPtr)NativeMemory.AllocZeroed(
                    *width * *height * 4);
            output.fresh = false;
        }

        pitches[0] = *width * 4;
        lines[0] = *height;
        return 1;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Cleanup(IntPtr opaque)
    {
    }

    // libvlc draws into the buffer it is given between lock and unlock; only
    // the decoder uses that one, so no lock is held while it draws.
    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static IntPtr Lock(IntPtr opaque, IntPtr* planes)
    {
        var output = Of(opaque);
        *planes = output.buffers[Draw];
        return IntPtr.Zero;
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Unlock(IntPtr opaque, IntPtr picture, IntPtr* planes)
    {
        var output = Of(opaque);
        lock (output.gate) {
            (output.buffers[Draw], output.buffers[Ready]) =
                (output.buffers[Ready], output.buffers[Draw]);
            output.fresh = true;
        }
    }

    [UnmanagedCallersOnly(CallConvs = [typeof(CallConvCdecl)])]
    private static void Display(IntPtr opaque, IntPtr picture)
    {
    }

    public void Dispose()
    {
        lock (gate) {
            WaitForReaders();
            FreeBuffers();
        }

        if (self.IsAllocated)
            self.Free();
    }
}
