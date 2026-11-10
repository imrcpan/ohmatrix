using OhMatrix.Core.Model;

namespace OhMatrix.Engine;

/// <summary>
/// The lines of a chat and how many of each kind of media they hold, made
/// together and published as one object: a reader that takes it has a count that
/// is the count of the list it holds, whatever the session does meanwhile.
/// </summary>
public sealed record TimelineSnapshot(
    IReadOnlyList<TimelineItem> Items,
    IReadOnlyList<int> Media
) {
    public static readonly TimelineSnapshot Empty = new([], new int[4]);

    public int Count(MediaKind kind) => Media[(int)kind];

    /// <summary>
    /// A page of the media of a kind, the newest first, read from this snapshot
    /// alone; the next page starts at the end of this one when there is more
    /// (a line beyond, or history that is not all loaded).
    /// </summary>
    public SharedMediaPage Page(MediaKind kind, int offset, int want,
        bool atStart)
    {
        var page = new List<TimelineItem>(want);
        var seen = 0;
        var beyond = false;
        for (var i = Items.Count - 1; i >= 0; i--) {
            if (MediaKinds.Of(Items[i]) != kind)
                continue;
            if (seen >= offset + want) {
                beyond = true;
                break;
            }

            if (seen++ >= offset)
                page.Add(Items[i]);
        }

        return new SharedMediaPage(page,
            beyond || !atStart ? offset + want : null);
    }
}
