using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that asks the homeserver what is at a link (it does the fetching, so the client reveals nothing to the site).</summary>
public interface ILinkPreviewEngine {
    /// <summary>The preview of a link, or null when the server has none (or does not give previews).</summary>
    Task<LinkPreview?> Preview(string url);
}
