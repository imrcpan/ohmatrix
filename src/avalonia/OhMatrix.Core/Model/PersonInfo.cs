namespace OhMatrix.Core.Model;

/// <summary>A person found in the user directory.</summary>
public sealed record PersonInfo(string UserId, string Name, string? AvatarUrl);
