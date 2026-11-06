namespace OhMatrix.Core.Model;

/// <summary>One row of the chat list (<c>RoomSummary</c> of the TypeScript core): what is shown of a room without opening it.</summary>
public sealed record RoomSummary {
    public required string Id { get; init; }
    public string Name { get; init; } = "";

    /// <summary>The picture of the room as an <c>mxc://</c> address, if it has one.</summary>
    public string? AvatarUrl { get; init; }

    /// <summary>The display name of who invited me, when this is a pending invitation.</summary>
    public string? Inviter { get; init; }

    public bool Invite => Inviter is not null;
    public bool Muted { get; init; }

    /// <summary>Pinned chats float to the top of the list.</summary>
    public bool Pinned { get; init; }

    /// <summary>Marked unread by hand: a badge shows even with nothing unread.</summary>
    public bool MarkedUnread { get; init; }

    public bool IsDirect { get; init; }

    /// <summary>A space, not a chat.</summary>
    public bool IsSpace { get; init; }

    public int MemberCount { get; init; }
    public int UnreadCount { get; init; }
    public int HighlightCount { get; init; }

    /// <summary>The text of the newest message, as the list shows it; null when there is none.</summary>
    public string? LastMessage { get; init; }

    /// <summary>Who sent the newest message (a display name); null for mine.</summary>
    public string? LastSender { get; init; }

    /// <summary>Milliseconds since the epoch of the latest activity; the list is ordered by it.</summary>
    public long LastActivityTs { get; init; }
}
