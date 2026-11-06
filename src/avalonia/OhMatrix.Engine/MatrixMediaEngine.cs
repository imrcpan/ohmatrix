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
            using var source = MediaSource.FromUrl(mxc);
            return await client.GetMediaThumbnail(source, (ulong)width, (ulong)height);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }
}
#endif
