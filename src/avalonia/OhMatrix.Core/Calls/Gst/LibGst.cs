using System.Runtime.InteropServices;
using System.Text;
using OhMatrix.Core.Audio;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Calls.Gst;

[StructLayout(LayoutKind.Sequential)]
internal struct GValue {
    public nuint Type;
    public ulong Data0;
    public ulong Data1;
}

[StructLayout(LayoutKind.Sequential)]
internal unsafe struct GstMapInfo {
    public IntPtr Memory;
    public int Flags;
    public byte* Data;
    public nuint Size;
    public nuint MaxSize;
    public fixed ulong UserData[4];
    public fixed ulong Reserved[4];
}

/// <summary>
/// The functions of GStreamer, GObject and GLib that a call needs, called directly (no wrapper package), the libraries being the system's, found
/// at run time. Signals with arguments are emitted through <c>g_signal_emitv</c> (the variadic <c>g_signal_emit_by_name</c> is not portable to call).
/// </summary>
internal static unsafe partial class LibGst {
    private static readonly Logger logger = Logger.GetDefault();

    public const nuint TypeBoolean = 5 << 2;
    public const nuint TypeInt = 6 << 2;
    public const nuint TypeUint = 7 << 2;
    public const nuint TypeString = 16 << 2;
    public const nuint TypePointer = 17 << 2;
    public const nuint TypeBoxed = 18 << 2;
    public const nuint TypeObject = 20 << 2;

    public const int StateNull = 1;
    public const int StatePlaying = 4;

    private static bool tried;
    private static bool ready;

    static LibGst()
    {
        NativeLibs.Init();
    }

    /// <summary>Whether GStreamer with its WebRTC element is on the system; initialises it on the first ask.</summary>
    public static bool Available {
        get {
            if (tried)
                return ready;
            tried = true;
            try {
                gst_init(IntPtr.Zero, IntPtr.Zero);
                // webrtcbin does nothing without the elements of libnice (a separate package on some systems).
                ready = Has("webrtcbin") && Has("nicesrc") && Has("opusenc") &&
                        Has("vp8enc");
            } catch (Exception e) when (e is DllNotFoundException
                                            or EntryPointNotFoundException) {
                logger.Exception("LibGst", e);
                ready = false;
            }

            return ready;
        }
    }

    /// <summary>Whether the elements that record sound (and, with <paramref name="video"/>, the camera) are on the system.</summary>
    public static bool CanRecord(bool video)
    {
        try {
            gst_init(IntPtr.Zero, IntPtr.Zero);
            return Has("autoaudiosrc") && Has("opusenc") && Has("oggmux")
                   && (!video || Has("autovideosrc") && Has("vp8enc") &&
                       Has("webmmux"));
        } catch (Exception e) when (e is DllNotFoundException
                                        or EntryPointNotFoundException) {
            logger.Exception("LibGst", e);
            return false;
        }
    }

    private static bool Has(string element)
    {
        var factory = gst_element_factory_find(Utf8(element));
        if (factory == IntPtr.Zero)
            return false;
        g_object_unref(factory);
        return true;
    }

    public static byte[] Utf8(string text)
    {
        return [.. Encoding.UTF8.GetBytes(text), 0];
    }

    public static string? Text(IntPtr c)
    {
        return c == IntPtr.Zero ? null : Marshal.PtrToStringUTF8(c);
    }

    /// <summary>The GType of a GObject instance: the first field of its class.</summary>
    public static nuint TypeOf(IntPtr instance)
    {
        return **(nuint**)instance;
    }

    /// <summary>Emits an action signal with the given values after the instance; the return value (if the signal has one) is not read.</summary>
    public static void Emit(IntPtr instance, string name,
        params GValue[] arguments)
    {
        Emit(instance, name, null, arguments);
    }

    /// <summary>Emits an action signal; <paramref name="result"/> is a GValue of the return type, for a signal that returns something.</summary>
    public static void Emit(IntPtr instance, string name, GValue* result,
        params GValue[] arguments)
    {
        var values = new GValue[arguments.Length + 1];
        values[0] = default;
        g_value_init(ref values[0], TypeOf(instance));
        g_value_set_object(ref values[0], instance);
        for (var i = 0; i < arguments.Length; i++)
            values[i + 1] = arguments[i];
        var id = g_signal_lookup(Utf8(name), TypeOf(instance));
        fixed (GValue* all = values) {
            g_signal_emitv(all, id, 0, result);
        }

        // The values were made for this emission; each holds its own copy or reference.
        for (var i = 0; i < values.Length; i++)
            g_value_unset(ref values[i]);
    }

    public static GValue UInt(uint v)
    {
        var g = default(GValue);
        g_value_init(ref g, TypeUint);
        g_value_set_uint(ref g, v);
        return g;
    }

    public static GValue Str(string v)
    {
        var g = default(GValue);
        g_value_init(ref g, TypeString);
        g_value_set_string(ref g, Utf8(v));
        return g;
    }

    /// <summary>A GstPromise as a signal argument.</summary>
    public static GValue Promise(IntPtr promise)
    {
        // Mini objects are boxed types: the value holds a reference of its own, given back when the value is unset after the emission.
        return Boxed(gst_promise_get_type(), promise);
    }

    /// <summary>A null GstStructure (no options) as a signal argument.</summary>
    public static GValue NoStructure()
    {
        return Boxed(gst_structure_get_type(), IntPtr.Zero);
    }

    public static GValue Description(IntPtr description)
    {
        return Boxed(gst_webrtc_session_description_get_type(), description);
    }

    public static GValue Pointer(IntPtr v)
    {
        var g = default(GValue);
        g_value_init(ref g, TypePointer);
        g_value_set_pointer(ref g, v);
        return g;
    }

    public static GValue Boxed(nuint type, IntPtr v)
    {
        var g = default(GValue);
        g_value_init(ref g, type);
        g_value_set_boxed(ref g, v);
        return g;
    }

    /// <summary>Sets a property of an object, whatever its type: <paramref name="value"/> must already be a GValue of that type.</summary>
    public static void SetProperty(IntPtr obj, string name, GValue value)
    {
        g_object_set_property(obj, Utf8(name), &value);
        g_value_unset(ref value);
    }

    public static void SetBool(IntPtr obj, string name, bool value)
    {
        var g = default(GValue);
        g_value_init(ref g, TypeBoolean);
        g_value_set_boolean(ref g, value ? 1 : 0);
        SetProperty(obj, name, g);
    }

    public static void SetString(IntPtr obj, string name, string value)
    {
        SetProperty(obj, name, Str(value));
    }

    public static int GetInt(IntPtr obj, string name)
    {
        var g = default(GValue);
        g_value_init(ref g, TypeInt);
        g_object_get_property(obj, Utf8(name), &g);
        var result = g_value_get_int(ref g);
        g_value_unset(ref g);
        return result;
    }

    /// <summary>The kind of media a pad of webrtcbin carries (its transceiver's <c>kind</c>): 1 audio, 2 video, 0 unknown.</summary>
    public static int KindOfPad(IntPtr pad)
    {
        var g = default(GValue);
        g_value_init(ref g, TypeObject);
        g_object_get_property(pad, Utf8("transceiver"), &g);
        var transceiver = g_value_get_object(ref g);
        var kind = transceiver == IntPtr.Zero ? 0 : GetInt(transceiver, "kind");
        g_value_unset(ref g);
        return kind;
    }

    public static ulong Connect(IntPtr instance, string signal, IntPtr handler,
        IntPtr data)
    {
        return g_signal_connect_data(instance, Utf8(signal), handler, data,
            IntPtr.Zero, 0);
    }

    // GObject / GLib
    [LibraryImport("gobject")]
    public static partial void g_value_init(ref GValue value, nuint type);

    [LibraryImport("gobject")]
    public static partial void g_value_unset(ref GValue value);

    [LibraryImport("gobject")]
    public static partial void g_value_set_uint(ref GValue value, uint v);

    [LibraryImport("gobject")]
    public static partial void g_value_set_boolean(ref GValue value, int v);

    [LibraryImport("gobject")]
    public static partial void g_value_set_string(ref GValue value, byte[] v);

    [LibraryImport("gobject")]
    public static partial void g_value_set_object(ref GValue value, IntPtr v);

    [LibraryImport("gobject")]
    public static partial void g_value_set_pointer(ref GValue value, IntPtr v);

    [LibraryImport("gobject")]
    public static partial void g_value_set_boxed(ref GValue value, IntPtr v);

    [LibraryImport("gobject")]
    public static partial int g_value_get_int(ref GValue value);

    [LibraryImport("gobject")]
    public static partial IntPtr g_value_get_boxed(IntPtr value);

    [LibraryImport("gobject")]
    public static partial IntPtr g_value_get_object(ref GValue value);

    [LibraryImport("gobject")]
    public static partial uint g_signal_lookup(byte[] name, nuint type);

    [LibraryImport("gobject")]
    public static partial void g_signal_emitv(GValue* values, uint signalId,
        uint detail,
        GValue* result);

    [LibraryImport("gobject")]
    public static partial ulong g_signal_connect_data(
        IntPtr instance,
        byte[] signal,
        IntPtr handler,
        IntPtr data,
        IntPtr destroy,
        int flags
    );

    [LibraryImport("gobject")]
    public static partial void g_object_set_property(IntPtr obj, byte[] name,
        GValue* value);

    [LibraryImport("gobject")]
    public static partial void g_object_get_property(IntPtr obj, byte[] name,
        GValue* value);

    [LibraryImport("gobject")]
    public static partial void g_object_unref(IntPtr obj);

    [LibraryImport("gobject")]
    public static partial IntPtr g_object_ref(IntPtr obj);

    [LibraryImport("glib")]
    public static partial void g_free(IntPtr p);

    // GStreamer core
    [LibraryImport("gst")]
    public static partial void gst_init(IntPtr argc, IntPtr argv);

    [LibraryImport("gst")]
    public static partial IntPtr gst_element_factory_find(byte[] name);

    [LibraryImport("gst")]
    public static partial IntPtr gst_device_monitor_new();

    [LibraryImport("gst")]
    public static partial uint gst_device_monitor_add_filter(IntPtr monitor,
        byte[] classes,
        IntPtr caps);

    [LibraryImport("gst")]
    public static partial IntPtr gst_device_monitor_get_devices(IntPtr monitor);

    [LibraryImport("gst")]
    public static partial IntPtr gst_device_get_display_name(IntPtr device);

    [LibraryImport("gst")]
    public static partial IntPtr gst_device_create_element(IntPtr device,
        IntPtr name);

    [LibraryImport("gst")]
    public static partial int gst_element_link(IntPtr src, IntPtr sink);

    [LibraryImport("gst")]
    public static partial int gst_element_unlink(IntPtr src, IntPtr sink);

    [LibraryImport("gst")]
    public static partial int gst_bin_remove(IntPtr bin, IntPtr element);

    [LibraryImport("glib")]
    public static partial void g_list_free(IntPtr list);

    [LibraryImport("gst")]
    public static partial IntPtr gst_parse_launch(byte[] description,
        out IntPtr error);

    [LibraryImport("gst")]
    public static partial IntPtr gst_parse_bin_from_description(
        byte[] description, int ghostPads,
        out IntPtr error);

    [LibraryImport("gst")]
    public static partial IntPtr gst_bin_get_by_name(IntPtr bin, byte[] name);

    [LibraryImport("gst")]
    public static partial int gst_bin_add(IntPtr bin, IntPtr element);

    [LibraryImport("gst")]
    public static partial int gst_element_set_state(IntPtr element, int state);

    [LibraryImport("gst")]
    public static partial int
        gst_element_sync_state_with_parent(IntPtr element);

    [LibraryImport("gst")]
    public static partial IntPtr gst_event_new_eos();

    [LibraryImport("gst")]
    public static partial int
        gst_element_send_event(IntPtr element, IntPtr evt);

    [LibraryImport("gst")]
    public static partial IntPtr gst_element_get_bus(IntPtr element);

    /// <summary>Waits for a message of the kinds in <paramref name="types"/> (bit flags: 1 end of stream, 2 error); zero when none came in time.</summary>
    [LibraryImport("gst")]
    public static partial IntPtr gst_bus_timed_pop_filtered(IntPtr bus,
        ulong timeoutNs, int types);

    [LibraryImport("gst")]
    public static partial IntPtr gst_element_get_static_pad(IntPtr element,
        byte[] name);

    [LibraryImport("gst")]
    public static partial int gst_pad_link(IntPtr src, IntPtr sink);

    [LibraryImport("gst")]
    public static partial IntPtr gst_object_get_name(IntPtr obj);

    [LibraryImport("gst")]
    public static partial IntPtr gst_pad_query_caps(IntPtr pad, IntPtr filter);

    [LibraryImport("gst")]
    public static partial IntPtr
        gst_caps_get_structure(IntPtr caps, uint index);

    [LibraryImport("gst")]
    public static partial IntPtr gst_caps_to_string(IntPtr caps);

    [LibraryImport("gst")]
    public static partial IntPtr gst_pad_get_current_caps(IntPtr pad);

    [LibraryImport("gst")]
    public static partial IntPtr gst_structure_get_string(IntPtr structure,
        byte[] name);

    [LibraryImport("gst")]
    public static partial int gst_structure_get_int(IntPtr structure,
        byte[] name, out int value);

    [LibraryImport("gst")]
    public static partial IntPtr gst_structure_get_value(IntPtr structure,
        byte[] name);

    [LibraryImport("gst")]
    public static partial IntPtr gst_promise_new_with_change_func(IntPtr func,
        IntPtr data,
        IntPtr notify);

    [LibraryImport("gst")]
    public static partial IntPtr gst_promise_get_reply(IntPtr promise);

    [LibraryImport("gst")]
    public static partial nuint gst_promise_get_type();

    [LibraryImport("gst")]
    public static partial nuint gst_structure_get_type();

    [LibraryImport("gst")]
    public static partial void gst_mini_object_unref(IntPtr obj);

    [LibraryImport("gst")]
    public static partial IntPtr gst_sample_get_buffer(IntPtr sample);

    [LibraryImport("gst")]
    public static partial IntPtr gst_sample_get_caps(IntPtr sample);

    [LibraryImport("gst")]
    public static partial int gst_buffer_map(IntPtr buffer, GstMapInfo* info,
        int flags);

    [LibraryImport("gst")]
    public static partial void
        gst_buffer_unmap(IntPtr buffer, GstMapInfo* info);

    // SDP and WebRTC
    [LibraryImport("gstsdp")]
    public static partial int gst_sdp_message_new(out IntPtr message);

    [LibraryImport("gstsdp")]
    public static partial int gst_sdp_message_parse_buffer(byte[] data,
        uint size, IntPtr message);

    [LibraryImport("gstsdp")]
    public static partial IntPtr gst_sdp_message_as_text(IntPtr message);

    [LibraryImport("gstsdp")]
    public static partial int gst_sdp_message_free(IntPtr message);

    [LibraryImport("gstwebrtc")]
    public static partial IntPtr gst_webrtc_session_description_new(int type,
        IntPtr sdp);

    [LibraryImport("gstwebrtc")]
    public static partial nuint gst_webrtc_session_description_get_type();

    [LibraryImport("gstwebrtc")]
    public static partial void gst_webrtc_session_description_free(
        IntPtr description);

    [LibraryImport("gstapp")]
    public static partial IntPtr gst_app_sink_try_pull_sample(IntPtr sink,
        ulong timeout);
}
