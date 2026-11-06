#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>Fetches pictures over the Matrix SDK (<c>media</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixMediaEngine(MatrixAuthEngine auth) : IMediaEngine {
    public async Task<byte[]?> Thumbnail(string mxc, int width, int height)
    {
        var client = auth.Client;
        if (client is null)
            return null;
        try {
            using var source =
 mxc.StartsWith('{') ? MediaSource.FromJson(mxc) : MediaSource.FromUrl(mxc);
            return await client.GetMediaThumbnail(source, (ulong)width, (ulong)height);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<string?> Download(string source, string fileName, string mimeType)
    {
        var client = auth.Client;
        if (client is null)
            return null;
        try {
            using var media = source.StartsWith('{')
                ? MediaSource.FromJson(source)
                : MediaSource.FromUrl(source);
            using var handle = await client.GetMediaFile(media, fileName, mimeType, true, null);
            var from = handle.Path();
            // The handle removes its file when it goes; the copy stays for the viewer of the system.
            var dir =
 Path.Combine(Path.GetTempPath(), "ohmatrix-media", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            var to = Path.Combine(dir, Path.GetFileName(fileName));
            File.Copy(from, to, true);
            return to;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }
}
#endif
