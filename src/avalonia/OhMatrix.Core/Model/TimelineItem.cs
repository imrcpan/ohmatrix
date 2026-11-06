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
}
