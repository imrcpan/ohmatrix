namespace OhMatrix.Core.Calls.Gst;

/// <summary>The microphones and cameras of the machine, as GStreamer's device monitor lists them.</summary>
internal static class GstDevices {
    /// <summary>The names of the devices of a class ("Audio/Source" or "Video/Source"), each once, in the order the system gives them.</summary>
    public static unsafe IReadOnlyList<string> Names(string deviceClass)
    {
        var names = new List<string>();
        if (!LibGst.Available)
            return names;
        var monitor = LibGst.gst_device_monitor_new();
        try {
            LibGst.gst_device_monitor_add_filter(monitor, LibGst.Utf8(deviceClass), IntPtr.Zero);
            var list = LibGst.gst_device_monitor_get_devices(monitor);
            for (var node = list; node != IntPtr.Zero; node = *(IntPtr*)((byte*)node + 8)) {
                var device = *(IntPtr*)node;
                var raw = LibGst.gst_device_get_display_name(device);
                if (LibGst.Text(raw) is { Length: > 0 } name && !names.Contains(name))
                    names.Add(name);
                LibGst.g_free(raw);
                LibGst.g_object_unref(device);
            }

            LibGst.g_list_free(list);
        } finally {
            LibGst.g_object_unref(monitor);
        }

        return names;
    }

    /// <summary>A source element for the device of that name, or zero when it is gone.</summary>
    public static unsafe IntPtr CreateSource(string deviceClass, string wanted, string elementName)
    {
        var result = IntPtr.Zero;
        var monitor = LibGst.gst_device_monitor_new();
        try {
            LibGst.gst_device_monitor_add_filter(monitor, LibGst.Utf8(deviceClass), IntPtr.Zero);
            var list = LibGst.gst_device_monitor_get_devices(monitor);
            for (var node = list; node != IntPtr.Zero; node = *(IntPtr*)((byte*)node + 8)) {
                var device = *(IntPtr*)node;
                var raw = LibGst.gst_device_get_display_name(device);
                var match = LibGst.Text(raw) == wanted;
                LibGst.g_free(raw);
                if (match && result == IntPtr.Zero) {
                    var bytes = LibGst.Utf8(elementName);
                    fixed (byte* name = bytes)
                        result = LibGst.gst_device_create_element(device, (IntPtr)name);
                }

                LibGst.g_object_unref(device);
            }

            LibGst.g_list_free(list);
        } finally {
            LibGst.g_object_unref(monitor);
        }

        return result;
    }
}
