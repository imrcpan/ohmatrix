using OhMatrix.Core.Model;

namespace OhMatrix.Engine;

/// <summary>The kinds of change the SDK makes to its list of rooms, without the SDK.</summary>
public enum ListOpKind {
    Append,
    Clear,
    PushFront,
    PushBack,
    PopFront,
    PopBack,
    Insert,
    Set,
    Remove,
    Truncate,
    Reset,
}

/// <summary>One change of the list: <see cref="Values"/> for Append and Reset, <see cref="Value"/> and <see cref="Index"/> for the others (the length for Truncate).</summary>
public sealed record ListOp<T>(
    ListOpKind Kind,
    IReadOnlyList<T>? Values = null,
    T? Value = default,
    int Index = 0
);

/// <summary>
/// What the chat list of the engine knows, apart from the SDK so that it can be
/// tested: the rooms in the order the SDK keeps them, how many places of the list
/// each room has, the summary of each room and the summaries in the order of
/// the chat list (pinned first, the newest activity first).
/// A <em>generation</em> belongs to one run of the sync: a result that comes
/// from an earlier one, or for a room that is not in the list any more, is not
/// written.
/// </summary>
public sealed class RoomBook<T>(Func<T, string> idOf) {
    private readonly Lock gate = new();
    private readonly List<(T Item, string Id)> items = [];

    // How many places of the list have a room: a room is there once, but a
    // change may put it somewhere before it takes it from where it was.
    private readonly Dictionary<string, int> places = [];
    private readonly Dictionary<string, RoomSummary> summaries = [];

    // Kept in order as the summaries change, by a search for the place, so
    // that handing the list on is a copy and no sort.
    private readonly List<RoomSummary> ordered = [];
    private int generation;

    public int Generation => Volatile.Read(ref generation);

    public int Count {
        get {
            lock (gate)
                return items.Count;
        }
    }

    public bool Has(string id)
    {
        lock (gate)
            return places.ContainsKey(id);
    }

    /// <summary>Starts a run of the sync and gives its generation.</summary>
    public int Begin()
    {
        return Interlocked.Increment(ref generation);
    }

    /// <summary>Ends the run: what comes late from it is not written, and the book is emptied.</summary>
    public void End()
    {
        lock (gate) {
            generation++;
            items.Clear();
            places.Clear();
            summaries.Clear();
            ordered.Clear();
        }
    }

    /// <summary>
    /// Applies a batch of changes. Gives the rooms to watch and read (those
    /// that are in the list when the batch is over, once for each id: a room put
    /// in and taken out by the same batch is not one) and the ids of the rooms
    /// that are not in the list any more (their summaries are dropped).
    /// </summary>
    public (List<T> Added, List<string> Left) Apply(int gen,
        IEnumerable<ListOp<T>> batch)
    {
        var added = new List<(T Item, string Id)>();
        var removed = new HashSet<string>();
        lock (gate) {
            if (gen != generation)
                return ([], []);

            (T Item, string Id) Take(T item)
            {
                var entry = (item, idOf(item));
                places[entry.Item2] = places.GetValueOrDefault(entry.Item2) + 1;
                added.Add(entry);
                return entry;
            }

            void Drop((T Item, string Id) entry)
            {
                removed.Add(entry.Id);
                if (places[entry.Id] == 1)
                    places.Remove(entry.Id);
                else
                    places[entry.Id]--;
            }

            void DropAll()
            {
                foreach (var entry in items)
                    removed.Add(entry.Id);
                items.Clear();
                places.Clear();
            }

            foreach (var op in batch) {
                switch (op.Kind) {
                    case ListOpKind.Append:
                        items.AddRange(op.Values!.Select(Take));
                        break;
                    case ListOpKind.Clear:
                        DropAll();
                        break;
                    case ListOpKind.PushFront:
                        items.Insert(0, Take(op.Value!));
                        break;
                    case ListOpKind.PushBack:
                        items.Add(Take(op.Value!));
                        break;
                    case ListOpKind.PopFront:
                        Drop(items[0]);
                        items.RemoveAt(0);
                        break;
                    case ListOpKind.PopBack:
                        Drop(items[^1]);
                        items.RemoveAt(items.Count - 1);
                        break;
                    case ListOpKind.Insert:
                        items.Insert(op.Index, Take(op.Value!));
                        break;
                    case ListOpKind.Set:
                        Drop(items[op.Index]);
                        items[op.Index] = Take(op.Value!);
                        break;
                    case ListOpKind.Remove:
                        Drop(items[op.Index]);
                        items.RemoveAt(op.Index);
                        break;
                    case ListOpKind.Truncate:
                        for (var k = items.Count - 1; k >= op.Index; k--)
                            Drop(items[k]);
                        items.RemoveRange(op.Index, items.Count - op.Index);
                        break;
                    case ListOpKind.Reset:
                        DropAll();
                        items.AddRange(op.Values!.Select(Take));
                        break;
                }
            }

            var left = removed.Where(id => !places.ContainsKey(id)).ToList();
            foreach (var id in left)
                RemoveSummary(id);
            // Only what the list holds now, and the last room that was put in
            // for an id.
            var latest = new Dictionary<string, T>();
            foreach (var (item, id) in added) {
                if (places.ContainsKey(id))
                    latest[id] = item;
            }

            return ([.. latest.Values], left);
        }
    }

    /// <summary>
    /// Writes the summary of a room that was read (null: the room is not
    /// listed). Not written when the read belongs to an earlier run or the
    /// room is not in the list. True when what the list shows changed.
    /// </summary>
    public bool Write(int gen, string id, RoomSummary? summary)
    {
        lock (gate) {
            if (gen != generation || !places.ContainsKey(id))
                return false;
            if (summary is null)
                return RemoveSummary(id);
            if (summaries.TryGetValue(id, out var was)) {
                if (was.SameAs(summary))
                    return false;
                ordered.RemoveAt(ordered.BinarySearch(was, Order));
            }

            summaries[id] = summary;
            var at = ordered.BinarySearch(summary, Order);
            ordered.Insert(at < 0 ? ~at : at, summary);
            return true;
        }
    }

    /// <summary>The summaries in the order of the chat list; null when the run is over.</summary>
    public IReadOnlyList<RoomSummary>? Snapshot(int gen)
    {
        lock (gate)
            return gen == generation ? [.. ordered] : null;
    }

    private bool RemoveSummary(string id)
    {
        if (!summaries.Remove(id, out var was))
            return false;
        ordered.RemoveAt(ordered.BinarySearch(was, Order));
        return true;
    }

    // Pinned first, then the newest activity, and the id to tell the rest apart
    // (a search for a place needs an order in which no two rows are equal).
    private static readonly Comparer<RoomSummary> Order =
        Comparer<RoomSummary>.Create((a, b) => {
            var c = b.Pinned.CompareTo(a.Pinned);
            if (c != 0)
                return c;
            c = b.LastActivityTs.CompareTo(a.LastActivityTs);
            return c != 0 ? c : string.CompareOrdinal(a.Id, b.Id);
        });
}
