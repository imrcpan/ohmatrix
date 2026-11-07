namespace OhMatrix.Core.Model;

public enum MemberRole {
    Member,
    Moderator,
    Admin,
}

/// <summary>A person in a room, as the info panel lists them.</summary>
public sealed record RoomMemberInfo(
    string UserId,
    string Name,
    string? AvatarUrl,
    MemberRole Role
) {
    /// <summary>The power level; null for a room creator, who has no limit.</summary>
    public int? Power { get; init; }
}

/// <summary>A person who is banned from a room, with the reason if one was given.</summary>
public sealed record BannedMemberInfo(
    string UserId,
    string Name,
    string? Reason);

/// <summary>Who can read the room's history: from now on for new members (joined), from their invite, all of it, or anyone.</summary>
public enum HistoryVisibility {
    Shared,
    Invited,
    Joined,
    WorldReadable,
}

/// <summary>How people get in. Knock and Restricted exist on servers but are only shown, not offered.</summary>
public enum JoinRule {
    Public,
    Invite,
    Knock,
    Restricted,
    Other,
}

/// <summary>The power level an action needs (m.room.power_levels). Anyone at or above it may do the action.</summary>
public sealed record PowerThresholds(
    int Invite,
    int Kick,
    int Ban,
    int Redact,
    int SendMessages,
    int ChangeSettings,
    int ChangeLevels
);

/// <summary>What I am allowed to do here, according to the room's power levels.</summary>
public sealed record RoomPermissions(
    bool EditInfo,
    bool Invite,
    bool Kick,
    bool Ban,
    bool ChangeRoles,
    bool Pin,
    bool ChangeSettings
);

/// <summary>What the info panel of a room shows (RoomDetails of the TypeScript core).</summary>
public sealed record RoomDetails(
    string? Topic,
    IReadOnlyList<RoomMemberInfo> Members,
    IReadOnlyList<string> Aliases,
    JoinRule JoinRule,
    HistoryVisibility HistoryVisibility,
    PowerThresholds Levels,
    RoomPermissions Can,
    bool IsDirect
) {
    public bool IsEncrypted { get; init; }
    public IReadOnlyList<BannedMemberInfo> Banned { get; init; } = [];
}
