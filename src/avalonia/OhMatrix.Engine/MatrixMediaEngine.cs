#if OHMATRIX_NATIVE_SDK
using System.Security.Cryptography;
using System.Text;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>Fetches pictures over the Matrix SDK (<c>media</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixMediaEngine(MatrixAuthEngine auth) : IMediaEngine {
    public async Task<byte[]?> Thumbnail(string mxc, int width, int height)
    {
        var client = auth.Client;
        if (client == null)
            return null;
        try {
            using var source = mxc.StartsWith('{')
                ? MediaSource.FromJson(mxc)
                : MediaSource.FromUrl(mxc);
            return await client.GetMediaThumbnail(
                source, (ulong)width, (ulong)height);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<string?> Download(string source, string fileName,
        string mimeType)
    {
        var client = auth.Client;
        if (client == null)
            return null;
        try {
            // One copy of a file: it is kept where its source says, and a
            // second request is answered with that copy, not a new one.
            var to = CopyPath(source, fileName);
            if (File.Exists(to) && new System.IO.FileInfo(to).Length > 0)
                return to;
            using var media = source.StartsWith('{')
                ? MediaSource.FromJson(source)
                : MediaSource.FromUrl(source);
            // The handle's file is removed when the handle is disposed; the
            // copy here is the only one that stays.
            using var handle = await client.GetMediaFile(
                media, fileName, mimeType, true, null);
            Directory.CreateDirectory(Path.GetDirectoryName(to)!);
            var partial = to + ".part";
            File.Copy(handle.Path(), partial, true);
            File.Move(partial, to, true);
            return to;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    // The folder of the copies, and the path of the copy of a file: a hash of
    // its source (the same file has the same source), in a folder of its own,
    // with the name of the file so that the system knows what it is.
    private static string CopyPath(string source, string fileName)
    {
        var hash = Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(source)))[..32];
        var name = Path.GetFileName(fileName);
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        if (name.Length == 0)
            name = "file";
        return Path.Combine(Path.GetTempPath(), "ohmatrix-media", hash, name);
    }
}
#endif
