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

/// <summary>A public room being joined: shown above the chat list until the join ends (<c>Joining</c> of the React Native app).</summary>
public sealed record JoiningRoom(
    string Id,
    string Name,
    string? AvatarUrl,
    DateTimeOffset Since);
