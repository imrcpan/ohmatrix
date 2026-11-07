namespace OhMatrix.Core.Model;

/// <summary>What happened to somebody's membership of a room (the values of the SDK's <c>MembershipChange</c> that matter here).</summary>
public enum MembershipKind {
    None,
    Joined,
    Left,
    Kicked,
    Invited,
    Other,
}

/// <summary>
/// The line a chat shows for an event that is not a message ("alice joined", "alice changed the room name to …"); the words are those of the
/// React Native engine (<c>serviceText.ts</c>), so the same room reads the same on every platform. Null is an event the chat does not show.
/// </summary>
public static class ServiceText {
    /// <summary>A person as the chat names them: their display name, or else the part of their id before the colon.</summary>
    public static string PersonName(string? displayName, string userId)
    {
        return !string.IsNullOrEmpty(displayName) && displayName != userId
            ? displayName
            : userId.TrimStart('@').Split(':')[0];
    }

    /// <summary>The line for someone's membership changing; <paramref name="who"/> is whose it is, <paramref name="by"/> who did it.</summary>
    public static string? ForMembership(MembershipKind change, string who,
        string by)
    {
        return change switch {
            MembershipKind.Joined => $"{who} joined",
            MembershipKind.Left => $"{who} left",
            MembershipKind.Kicked => $"{who} was removed",
            MembershipKind.Invited => $"{by} invited {who}",
            _ => null,
        };
    }

    /// <summary>The line for a change of the state of the room, made by <paramref name="by"/>; <paramref name="kind"/> is <c>RoomCreate</c>, <c>RoomName</c> or <c>RoomTopic</c>.</summary>
    public static string? ForState(string kind, string? value, string by)
    {
        return kind switch {
            "RoomCreate" => $"{by} created the room",
            "RoomName" => string.IsNullOrEmpty(value)
                ? $"{by} removed the room name"
                : $"{by} changed the room name to “{value}”",
            "RoomTopic" => $"{by} changed the description",
            _ => null,
        };
    }
}
