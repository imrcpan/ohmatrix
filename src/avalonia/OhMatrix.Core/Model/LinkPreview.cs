namespace OhMatrix.Core.Model;

/// <summary>What a homeserver found at a link (the open-graph data): a card shown under the message.</summary>
public sealed record LinkPreview(
    string Url,
    string? Title,
    string? Description,
    string? SiteName,
    string? Image,
    int? ImageWidth,
    int? ImageHeight
);
