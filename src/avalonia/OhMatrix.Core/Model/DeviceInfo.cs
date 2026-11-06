namespace OhMatrix.Core.Model;

/// <summary>A session of my account: where I am signed in.</summary>
public sealed record DeviceInfo(
    string Id,
    string Name,
    long? LastSeenTs,
    string? LastSeenIp,
    bool Current
);
