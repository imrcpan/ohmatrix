namespace OhMatrix.Core.Ui;

/// <summary>What kind a file is, from its name (there is no sniffing of the content).</summary>
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
        return ByExtension.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream");
    }

    public static bool IsImage(string mime)
    {
        return mime.StartsWith("image/", StringComparison.Ordinal);
    }
}
