namespace OhMatrix.Core.Model;

/// <summary>What is kept of a sign-in to start the app signed in again.</summary>
public sealed record Session(
    string Homeserver,
    string UserId,
    string DeviceId,
    string AccessToken,
    string? Native = null
);
