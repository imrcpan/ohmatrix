namespace OhMatrix.Core.Model;

/// <summary>A room (or a space) listed in a space, joined or not.</summary>
public sealed record SpaceChild(
    string RoomId,
    string Name,
    string? Topic,
    string? AvatarUrl,
    long Members,
    bool IsSpace
);
