using OhMatrix.Core.Model;

namespace OhMatrix.Engine;

/// <summary>
/// The paging of the shared media of a room, apart from the SDK: history is asked
/// for until there are lines enough, and the page is made from the very snapshot
/// that said there were.
/// </summary>
public static class MediaPaging {
    /// <summary>
    /// <paramref name="take"/> gives the snapshot now; <paramref name="loadOlder"/>
    /// asks the room for older history and tells whether the start of the room
    /// was reached; <paramref name="arrival"/> waits for what that brought.
    /// Each round takes one snapshot, keeps it in a local, and either makes the
    /// page from it or asks for more; the snapshot is never taken again between
    /// the decision and the page, so the count and the page are of one list
    /// (a delete or a reset in between is for the next request).
    /// </summary>
    public static async Task<(SharedMediaPage Page, bool AtStart)> Read(
        Func<TimelineSnapshot> take, Func<Task<bool>> loadOlder,
        Func<Task> arrival, bool atStart, MediaKind kind, int offset,
        int want, int rounds = 40)
    {
        for (var n = 0; n < rounds; n++) {
            var snapshot = take();
            if (atStart || snapshot.Count(kind) > offset + want)
                return (snapshot.Page(kind, offset, want, atStart), atStart);
            atStart = await loadOlder();
            await arrival();
        }

        // Out of rounds: the page of what there is now, from one snapshot.
        var last = take();
        return (last.Page(kind, offset, want, atStart), atStart);
    }
}
