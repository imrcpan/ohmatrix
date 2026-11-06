namespace OhMatrix.Core.State;

/// <summary>The part of an engine that fetches pictures from the homeserver (<c>media</c> of the TypeScript core).</summary>
public interface IMediaEngine {
    /// <summary>A thumbnail of a picture (an <c>mxc://</c> address, or the JSON of an encrypted file), as an encoded image; null when there is none.</summary>
    Task<byte[]?> Thumbnail(string mxc, int width, int height);

    /// <summary>Fetches a file (the <c>mxc://</c> address, or the JSON of an encrypted file) to disk and gives its path; null when there is none.</summary>
    Task<string?> Download(string source, string fileName, string mimeType);
}
