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
    /// <summary>Stays the same for the item as it is edited or sent.</summary>
    public required string Id { get; init; }

    public TimelineKind Kind { get; init; } = TimelineKind.Message;
    public string Body { get; init; } = "";
    public string SenderId { get; init; } = "";
    public string SenderName { get; init; } = "";
    public bool IsOwn { get; init; }

    /// <summary>Milliseconds since the epoch.</summary>
    public long Ts { get; init; }

    /// <summary>Mine, and not yet taken by the server.</summary>
    public bool Sending { get; init; }

    public bool Failed { get; init; }
    public bool Edited { get; init; }

    /// <summary>The id the server gave the event; null while it is being sent.</summary>
    public string? EventId { get; init; }

    public IReadOnlyList<ReactionCount> Reactions { get; init; } = [];

    /// <summary>The message this one answers, as it is quoted at the top of the bubble.</summary>
    public ReplyQuote? Reply { get; init; }
}

/// <summary>A reaction under a message: the key (an emoji), how many gave it, and whether I did.</summary>
public sealed record ReactionCount(string Key, int Count, bool Mine);

/// <summary>The quoted message of a reply: who wrote it and the start of what was written.</summary>
public sealed record ReplyQuote(string SenderName, string Preview, string? EventId);
