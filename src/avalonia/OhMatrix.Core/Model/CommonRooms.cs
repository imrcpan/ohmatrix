namespace OhMatrix.Core.Model;

/// <summary>
/// The progress of the search for the groups two people share: how many of
/// the groups are checked, out of how many, and the ones they share so far.
/// </summary>
public sealed record CommonRoomsProgress(
    int Checked,
    int Total,
    IReadOnlyList<RoomSummary> Shared,
    // The name of the group being checked now, when one is.
    string? Checking = null
);

/// <summary>The search of the groups shared with one person: whether it is still going on, and its progress.</summary>
public sealed record CommonRoomsState(
    string UserId,
    bool Done,
    CommonRoomsProgress Progress
);
