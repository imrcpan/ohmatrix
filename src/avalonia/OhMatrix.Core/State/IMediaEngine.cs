namespace OhMatrix.Core.State;

/// <summary>The part of an engine that fetches pictures from the homeserver (<c>media</c> of the TypeScript core).</summary>
public interface IMediaEngine {
    /// <summary>A thumbnail (cropped to the size) of the <c>mxc://</c> picture, as an encoded image; null when there is none.</summary>
    Task<byte[]?> Thumbnail(string mxc, int width, int height);
}
