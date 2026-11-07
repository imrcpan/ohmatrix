namespace OhMatrix.Core.Model;

/// <summary>Who I am on the server: the name others see and the picture (an <c>mxc://</c> address), if I have set them.</summary>
public sealed record Profile(
    string UserId,
    string? DisplayName,
    string? AvatarUrl) {
    /// <summary>My status line, when I have set one.</summary>
    public string? Status { get; init; }
}
