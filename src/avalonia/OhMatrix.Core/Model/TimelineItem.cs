namespace OhMatrix.Core.Model;

public enum TimelineKind {
    /// <summary>A message with text.</summary>
    Message,

    /// <summary>A divider between two days.</summary>
    Date,

    /// <summary>Something that happened in the room (someone joined, the name changed), shown as a centred line.</summary>
    Service,
}

/// <summary>One line of a chat (<c>TimelineItem</c> of the TypeScript core, for the kinds that are ported so far).</summary>
public sealed record TimelineItem {
    /// <summary>The <see cref="Body"/> of a <see cref="TimelineKind.Service"/> line for a message that cannot be decrypted; the pane words it.</summary>
    public const string Undecryptable = "undecryptable";

    /// <summary>Stays the same for the item as it is edited or sent.</summary>
    public required string Id { get; init; }

    public TimelineKind Kind { get; init; } = TimelineKind.Message;
    public string Body { get; init; } = "";

    /// <summary>The HTML of the body when the sender formatted it; null for a plain text.</summary>
    public string? FormattedBody { get; init; }

    public string SenderId { get; init; } = "";
    public string SenderName { get; init; } = "";

    /// <summary>The picture of the sender (an mxc address), when the profile has one.</summary>
    public string? SenderAvatar { get; init; }

    public bool IsOwn { get; init; }

    /// <summary>Milliseconds since the epoch.</summary>
    public long Ts { get; init; }

    /// <summary>Mine, and not yet taken by the server.</summary>
    public bool Sending { get; init; }

    public bool Failed { get; init; }

    /// <summary>Mine, and someone else has read up to it.</summary>
    public bool Read { get; init; }

    /// <summary>The people other than the sender whose read marker is at or past this line (the ids), for the label of the tick.</summary>
    public IReadOnlyList<string> ReadBy { get; init; } = [];

    public bool Edited { get; init; }

    /// <summary>The id the server gave the event; null while it is being sent.</summary>
    public string? EventId { get; init; }

    public IReadOnlyList<ReactionCount> Reactions { get; init; } = [];

    /// <summary>The message this one answers, as it is quoted at the top of the bubble.</summary>
    public ReplyQuote? Reply { get; init; }

    /// <summary>The picture of an image message; <see cref="Body"/> is then its caption (empty when it has none).</summary>
    public ImageAttachment? Image { get; init; }

    /// <summary>The file of a file message; <see cref="Body"/> is then its caption.</summary>
    public FileAttachment? File { get; init; }
}

public enum FileKind {
    File,
    Audio,
    Video,
}

/// <summary>
/// A file in a message: its name and size in bytes (0 when unknown); <paramref name="Source"/> is what the engine needs to fetch it (like
/// <see cref="ImageAttachment.Source"/>), <paramref name="Kind"/> tells an audio or video message from a plain file.
/// </summary>
public sealed record FileAttachment(
    string Name,
    long Size,
    string Source = "",
    string Mime = "",
    FileKind Kind = FileKind.File,
    TimeSpan? Duration = null
);

/// <summary>
/// A picture in a message. <paramref name="Source"/> is what the engine needs to fetch it (the <c>mxc://</c> address, or the JSON of an
/// encrypted file); the size is the one the sender gave, if any.
/// </summary>
public sealed record ImageAttachment(
    string Source,
    int? Width,
    int? Height,
    string FileName);

/// <summary>A reaction under a message: the key (an emoji), how many gave it, and whether I did.</summary>
public sealed record ReactionCount(string Key, int Count, bool Mine);

/// <summary>The quoted message of a reply: who wrote it and the start of what was written.</summary>
public sealed record ReplyQuote(
    string SenderName,
    string Preview,
    string? EventId,
    string SenderId = "",
    bool IsImage = false);
