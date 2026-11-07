namespace OhMatrix.Core.Model;

/// <summary>The kinds of shared media a room's gallery can be filtered by (<c>MediaKind</c> of the TypeScript core). Voice messages are audio.</summary>
public enum MediaKind {
    Image,
    Video,
    Audio,
    File,
}

/// <summary>One page of a room's media, newest first. <paramref name="Next"/> is where the following page starts; null at the room's beginning.</summary>
public sealed record SharedMediaPage(
    IReadOnlyList<TimelineItem> Items,
    int? Next);

public static class MediaKinds {
    /// <summary>The kind of media a line carries; null for a line without any.</summary>
    public static MediaKind? Of(TimelineItem item)
    {
        if (item.Image is not null)
            return MediaKind.Image;
        return item.File?.Kind switch {
            FileKind.Video => MediaKind.Video,
            FileKind.Audio => MediaKind.Audio,
            FileKind.File => MediaKind.File,
            _ => null,
        };
    }
}
