namespace OhMatrix.Core.Model;

/// <summary>A room of the public directory of a server.</summary>
public sealed record PublicRoom(
    string RoomId,
    string Name,
    string? Topic,
    string? Alias,
    string? AvatarUrl,
    long Members
);
