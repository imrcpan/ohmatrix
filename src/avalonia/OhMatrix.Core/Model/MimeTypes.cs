namespace OhMatrix.Core.Model;

/// <summary>What kind a file is, from its name; a file with no extension can be told from its first bytes (<see cref="SniffExtension"/>).</summary>
public static class MimeTypes {
    private static readonly Dictionary<string, string> ByExtension =
        new(StringComparer.OrdinalIgnoreCase) {
            [".png"] = "image/png",
            [".jpg"] = "image/jpeg",
            [".jpeg"] = "image/jpeg",
            [".gif"] = "image/gif",
            [".webp"] = "image/webp",
            [".bmp"] = "image/bmp",
            [".mp4"] = "video/mp4",
            [".webm"] = "video/webm",
            [".mov"] = "video/quicktime",
            [".mp3"] = "audio/mpeg",
            [".ogg"] = "audio/ogg",
            [".opus"] = "audio/ogg",
            [".wav"] = "audio/wav",
            [".m4a"] = "audio/mp4",
            [".pdf"] = "application/pdf",
            [".txt"] = "text/plain",
            [".zip"] = "application/zip",
        };

    public static string For(string path)
    {
        return ByExtension.GetValueOrDefault(Path.GetExtension(path),
            "application/octet-stream");
    }

    /// <summary>The extension of a picture or a video from its first bytes, for a file that was saved with none (a sticker); null when it is not one of them.</summary>
    public static string? SniffExtension(string path)
    {
        Span<byte> head = stackalloc byte[12];
        int read;
        using (var stream = File.OpenRead(path))
            read = stream.ReadAtLeast(head, 4, throwOnEndOfStream: false);
        var h = head[..read];
        if (h.Length >= 4 && h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E &&
            h[3] == 0x47)
            return ".png";
        if (h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF)
            return ".jpg";
        if (h.Length >= 4 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' &&
            h[3] == '8')
            return ".gif";
        if (h.Length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' &&
            h[3] == 'F' && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' &&
            h[11] == 'P')
            return ".webp";
        return null;
    }

    public static bool IsImage(string mime)
    {
        return mime.StartsWith("image/", StringComparison.Ordinal);
    }
}
