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
);

/// <summary>What the info panel of a room shows (<c>RoomDetails</c> of the TypeScript core, as far as it is ported).</summary>
public sealed record RoomDetails(string? Topic, IReadOnlyList<RoomMemberInfo> Members);
