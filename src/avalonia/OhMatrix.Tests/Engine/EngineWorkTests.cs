using Microsoft.Extensions.Time.Testing;
using OhMatrix.Core.Model;
using OhMatrix.Engine;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class EngineWorkTests {
    [Fact]
    public void A_row_is_the_same_when_it_shows_the_same()
    {
        var a = new RoomSummary {
            Id = "!a",
            Name = "Team",
            PinnedEventIds = ["$1", "$2"]
        };
        // Made again: the same things in other lists.
        var b = new RoomSummary {
            Id = "!a",
            Name = "Team",
            PinnedEventIds = ["$1", "$2"]
        };
        Assert.NotEqual(a, b);
        Assert.True(a.SameAs(b));
        Assert.False(a.SameAs(b with {
            PinnedEventIds = ["$1"]
        }));
        Assert.False(a.SameAs(b with {
            Name = "Crew"
        }));
        Assert.False(a.SameAs(b with {
            UnreadCount = 1
        }));
    }

    [Fact]
    public async Task
        Work_for_a_key_asked_in_a_burst_runs_once_more_not_for_each()
    {
        var work = new KeyedWork(4);
        var runs = 0;
        var first = new TaskCompletionSource();
        work.Request("!a", async () => {
            Interlocked.Increment(ref runs);
            await first.Task;
        });
        // Asked 50 times while it runs.
        for (var i = 0; i < 50; i++)
            work.Request("!a", () => {
                Interlocked.Increment(ref runs);
                return Task.CompletedTask;
            });
        first.SetResult();
        for (var i = 0; i < 100 && Volatile.Read(ref runs) < 2; i++)
            await Task.Delay(20);
        await Task.Delay(100);
        Assert.Equal(2, Volatile.Read(ref runs));
    }

    [Fact]
    public async Task No_more_than_the_limit_of_jobs_run_at_once()
    {
        var work = new KeyedWork(3);
        var now = 0;
        var most = 0;
        var jobs = Enumerable.Range(0, 20).Select(_ => work.Limit(async () => {
            var n = Interlocked.Increment(ref now);
            int seen;
            do {
                seen = Volatile.Read(ref most);
            } while (n > seen &&
                     Interlocked.CompareExchange(ref most, n, seen) != seen);

            await Task.Delay(20);
            Interlocked.Decrement(ref now);
        }));
        await Task.WhenAll(jobs);
        Assert.Equal(3, most);

        // Different keys asked for at once are held to it too.
        most = 0;
        var done = new CountdownEvent(12);
        for (var i = 0; i < 12; i++)
            work.Request("!r" + i, async () => {
                var n = Interlocked.Increment(ref now);
                int seen;
                do {
                    seen = Volatile.Read(ref most);
                } while (n > seen &&
                         Interlocked.CompareExchange(ref most, n, seen) !=
                         seen);

                await Task.Delay(20);
                Interlocked.Decrement(ref now);
                done.Signal();
            });
        Assert.True(done.Wait(10000));
        Assert.InRange(most, 1, 3);
    }

    [Fact]
    public void A_room_put_in_and_taken_out_by_one_batch_is_not_watched()
    {
        var book = new RoomBook<string>(id => id);
        var gen = book.Begin();
        var (added, left) = book.Apply(gen, [Append("A"), Remove(0)]);
        Assert.Empty(added);
        Assert.Equal(["A"], left);
        Assert.False(book.Has("A"));
        Assert.False(Write(book, gen, "A", Row("A")));
        Assert.Empty(book.Snapshot(gen)!);

        // The same after a reset, and with other rooms in the batch.
        (added, left) = book.Apply(gen, [
            new ListOp<string>(ListOpKind.Reset, Values: ["B", "C", "D"]),
            Remove(1),
            new ListOp<string>(ListOpKind.PopBack),
        ]);
        Assert.Equal(["B"], added.Select(e => e.Item));
        Assert.Equal(["C", "D"], left.Order());

        // Put in, taken out and put in again: the last one is the room.
        var again = new RoomBook<string>(id => id[..1]);
        var g = again.Begin();
        (added, left) = again.Apply(g, [
            Append("A1"),
            Remove(0),
            Append("A2"),
        ]);
        Assert.Equal(["A2"], added.Select(e => e.Item));
        Assert.Empty(left);
    }

    [Fact]
    public void
        A_read_that_comes_after_the_room_left_or_the_run_ended_is_not_written()
    {
        var book = new RoomBook<string>(id => id);
        var gen = book.Begin();
        book.Apply(gen, [Append("A", "B")]);
        Assert.True(Write(book, gen, "A", Row("A", 5)));
        Assert.True(Write(book, gen, "B", Row("B", 4)));

        // B leaves while a read of it is on its way.
        book.Apply(gen, [Remove(1)]);
        Assert.False(Write(book, gen, "B", Row("B", 9)));
        Assert.Equal(["A"], book.Snapshot(gen)!.Select(r => r.Id));

        // The run is over (a stop) while a read of A is on its way: nothing
        // is written, nothing is handed on, and the book is empty.
        book.End();
        Assert.False(Write(book, gen, "A", Row("A", 7)));
        Assert.Null(book.Snapshot(gen));
        Assert.Equal(0, book.Count);

        // A new run does not take what the old one reads late.
        var next = book.Begin();
        book.Apply(next, [Append("A")]);
        Assert.False(Write(book, gen, "A", Row("A", 8)));
        Assert.True(Write(book, next, "A", Row("A", 8)));
        // Nor the batches the old run was still to apply.
        Assert.Empty(book.Apply(gen, [Append("Z")]).Added);
        Assert.False(book.Has("Z"));
    }

    [Fact]
    public void The_summaries_are_kept_in_the_order_of_the_chat_list()
    {
        var book = new RoomBook<string>(id => id);
        var gen = book.Begin();
        string[] ids = ["a", "b", "c", "d", "e"];
        book.Apply(gen, [Append(ids)]);
        var rows = new Dictionary<string, RoomSummary>();
        var random = new Random(7);

        List<string> Expected() => [
            .. rows.Values.OrderByDescending(r => r.Pinned)
                .ThenByDescending(r => r.LastActivityTs)
                .ThenBy(r => r.Id, StringComparer.Ordinal).Select(r => r.Id)
        ];

        // Many changes, with equal times and pins that come and go.
        for (var i = 0; i < 300; i++) {
            var id = ids[random.Next(ids.Length)];
            var row = Row(id, random.Next(4), random.Next(4) == 0);
            Write(book, gen, id, row);
            rows[id] = row;
            Assert.Equal(Expected(), book.Snapshot(gen)!.Select(r => r.Id));
        }

        // The same row again changes nothing.
        Assert.False(Write(book, gen, "a", rows["a"] with {
        }));
        // A room that is not listed any more is out of the order.
        Assert.True(Write(book, gen, "a", null));
        rows.Remove("a");
        Assert.Equal(Expected(), book.Snapshot(gen)!.Select(r => r.Id));
    }

    [Fact]
    public async Task Notices_that_come_together_are_one_hand_over()
    {
        var clock = new FakeTimeProvider();
        var burst = new Burst(TimeSpan.FromMilliseconds(40), clock);
        var done = new List<string>();
        for (var i = 0; i < 50; i++) {
            var name = "n" + i;
            burst.Poke(() => {
                lock (done)
                    done.Add(name);
            });
        }

        clock.Advance(TimeSpan.FromMilliseconds(39));
        await Task.Delay(30);
        lock (done)
            Assert.Empty(done);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        await WaitFor(() => {
            lock (done)
                return done.Count == 1;
        });
        // The latest is what is done; the next notice starts a new pause.
        lock (done)
            Assert.Equal(["n49"], done);
        burst.Poke(() => {
            lock (done)
                done.Add("later");
        });
        clock.Advance(TimeSpan.FromMilliseconds(40));
        await WaitFor(() => {
            lock (done)
                return done.Count == 2;
        });
        lock (done)
            Assert.Equal(["n49", "later"], done);
    }

    [Fact]
    public async Task A_failed_try_is_made_again_after_a_pause_that_grows()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        var task = Retrying.Until(() => {
                if (++tries < 4)
                    throw new InvalidOperationException("not yet");
                return Task.FromResult("done");
            }, e => e is InvalidOperationException, 30,
            TimeSpan.FromMilliseconds(100), TimeSpan.FromSeconds(1), clock);
        Assert.Equal(1, tries);
        // The pauses: 100 ms, 200 ms, 400 ms.
        clock.Advance(TimeSpan.FromMilliseconds(99));
        Assert.Equal(1, tries);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        await WaitFor(() => tries == 2);
        clock.Advance(TimeSpan.FromMilliseconds(200));
        await WaitFor(() => tries == 3);
        clock.Advance(TimeSpan.FromMilliseconds(399));
        Assert.Equal(3, tries);
        Assert.False(task.IsCompleted);
        clock.Advance(TimeSpan.FromMilliseconds(1));
        Assert.Equal("done", await task);
        Assert.Equal(4, tries);
    }

    [Fact]
    public async Task The_pause_stops_growing_and_the_last_failure_is_thrown()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        var task = Retrying.Until<int>(() => {
                tries++;
                throw new InvalidOperationException("try " + tries);
            }, e => e is InvalidOperationException, 6,
            TimeSpan.FromMilliseconds(100), TimeSpan.FromMilliseconds(300),
            clock);
        // 100, 200, 300, 300, 300, 300: then the sixth retry has failed too.
        foreach (var ms in new[] {
                     100, 200, 300, 300, 300, 300
                 }) {
            var want = tries + 1;
            clock.Advance(TimeSpan.FromMilliseconds(ms));
            await WaitFor(() => tries >= want || task.IsCompleted);
        }

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Equal("try 7", e.Message);
        Assert.Equal(7, tries);
    }

    [Fact]
    public async Task
        A_failure_that_is_not_to_be_tried_again_is_thrown_at_once()
    {
        var clock = new FakeTimeProvider();
        var tries = 0;
        await Assert.ThrowsAsync<ArgumentException>(() => Retrying.Until<int>(
            () => {
                tries++;
                throw new ArgumentException("no");
            }, e => e is InvalidOperationException, 30,
            TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1), clock));
        Assert.Equal(1, tries);
    }

    [Fact]
    public void A_list_in_order_is_not_sorted_or_copied_again()
    {
        IReadOnlyList<RoomSummary> ready = [
            Row("p", 1, true), Row("a", 9), Row("b", 9), Row("c", 2),
        ];
        Assert.Same(ready, OhMatrix.Core.State.AppController.Order(ready));

        // Not in order: sorted as before, and ties keep their places.
        IReadOnlyList<RoomSummary> mixed = [
            Row("c", 2), Row("a", 9), Row("p", 1, true), Row("b", 9),
        ];
        var sorted = OhMatrix.Core.State.AppController.Order(mixed);
        Assert.NotSame(mixed, sorted);
        Assert.Equal(["p", "a", "b", "c"], sorted.Select(r => r.Id));
        Assert.Equal(["p", "a", "b", "c"], OhMatrix.Core.State.AppController
            .Order(sorted).Select(r => r.Id));
    }

    private static bool Write(RoomBook<string> book, int gen, string id,
        RoomSummary? summary) => book.Write(gen, id, book.Entry(id), summary);

    private static ListOp<string> Append(params string[] ids) =>
        new(ListOpKind.Append, Values: ids);

    private static ListOp<string> Remove(int index) =>
        new(ListOpKind.Remove, Index: index);

    private static RoomSummary
        Row(string id, long ts = 0, bool pinned = false) =>
        new() {
            Id = id,
            Name = id,
            LastActivityTs = ts,
            Pinned = pinned
        };

    [Fact]
    public void An_old_read_does_not_overwrite_a_room_that_came_in_again()
    {
        var book = new RoomBook<string>(id => id);
        var gen = book.Begin();
        var (first, _) = book.Apply(gen, [Append("A")]);
        var old = first.Single();

        // A is taken out and put in again, in the same run of the sync.
        book.Apply(gen, [Remove(0)]);
        var (second, _) = book.Apply(gen, [Append("A")]);
        var now = second.Single();
        Assert.NotEqual(old.Entry, now.Entry);

        // The new read comes first, the old one after it.
        Assert.True(book.Write(gen, "A", now.Entry, Row("A", 9)));
        Assert.False(book.Write(gen, "A", old.Entry, Row("A", 1)));
        Assert.Equal(9, book.Snapshot(gen)!.Single().LastActivityTs);

        // An old read of a room that is out of the list is not written either.
        book.Apply(gen, [Remove(0)]);
        Assert.False(book.Write(gen, "A", now.Entry, Row("A", 10)));
        Assert.Empty(book.Snapshot(gen)!);

        // A room that moves inside the list stays in its entry.
        var (third, _) = book.Apply(gen, [Append("A", "B")]);
        var a = third.Single(e => e.Id == "A").Entry;
        book.Apply(gen, [
            new ListOp<string>(ListOpKind.Remove, Index: 0),
            new ListOp<string>(ListOpKind.PushBack, Value: "A"),
        ]);
        Assert.False(book.Write(gen, "A", a, Row("A", 2)));
        Assert.True(book.Write(gen, "B", third.Single(e => e.Id == "B").Entry,
            Row("B", 2)));
    }

    [Fact]
    public async Task What_a_run_queued_is_not_read_by_the_next_run()
    {
        var runs = new RunChannel<int[]>();
        var first = runs.Open();
        // Changes the old run's reader did not get to.
        first.Writer.TryWrite([1]);
        first.Writer.TryWrite([2]);
        runs.Close();
        // Stopped: nothing more is queued for the run that ended.
        Assert.False(first.Writer.TryWrite([3]));

        var second = runs.Open();
        second.Writer.TryWrite([10]);
        // The new run's reader sees its own changes and none of the old.
        second.Writer.Complete();
        var seen = new List<int>();
        await foreach (var batch in second.Reader.ReadAllAsync())
            seen.AddRange(batch);
        Assert.Equal([10], seen);

        // Starting again without a stop closes the one before.
        var third = runs.Open();
        var fourth = runs.Open();
        Assert.False(third.Writer.TryWrite([5]));
        Assert.True(fourth.Writer.TryWrite([6]));

        // The changes of the old run cannot be applied to the new list.
        var book = new RoomBook<string>(id => id);
        var gen1 = book.Begin();
        book.Apply(gen1, [Append("A", "B")]);
        book.End();
        var gen2 = book.Begin();
        book.Apply(gen2, [Append("C")]);
        // An index of the old list, taken for the new one, would be wrong.
        Assert.Empty(book.Apply(gen1, [Remove(1)]).Left);
        Assert.True(book.Has("C"));
    }

    private static TimelineItem Media(string id, FileKind kind) => new() {
        Id = id,
        File = new FileAttachment(id, 1, "mxc://s/" + id, "x/y", kind, null),
    };

    [Fact]
    public async Task A_page_is_read_from_the_list_its_count_belongs_to()
    {
        // Counts and list made together: a reader that holds a snapshot has
        // a count of the very list it reads, whatever is published after.
        TimelineItem[] three = [
            Media("a", FileKind.File), Media("b", FileKind.File),
            Media("c", FileKind.File),
        ];
        TimelineItem[] six = [
            .. three, Media("d", FileKind.File), Media("e", FileKind.File),
            Media("f", FileKind.File),
        ];
        var old = new TimelineSnapshot(three, Count(three));
        var next = new TimelineSnapshot(six, Count(six));
        Assert.Equal(3, old.Count(MediaKind.File));
        Assert.Equal(6, next.Count(MediaKind.File));
        Assert.Equal(0, old.Count(MediaKind.Image));

        // The old snapshot gives what it has: three, and a next page only
        // because the history is not all loaded. The count and the page of
        // one snapshot agree; a count of 6 never reaches a list of 3.
        var page = old.Page(MediaKind.File, 0, 5, atStart: false);
        Assert.Equal(["c", "b", "a"], page.Items.Select(i => i.Id));
        Assert.Equal(5, page.Next);
        Assert.Null(old.Page(MediaKind.File, 0, 5, atStart: true).Next);
        var newer = next.Page(MediaKind.File, 0, 5, atStart: true);
        Assert.Equal(["f", "e", "d", "c", "b"], newer.Items.Select(i => i.Id));
        Assert.Equal(5, newer.Next);
        Assert.Equal(["a"], next.Page(MediaKind.File, 5, 5, true).Items
            .Select(i => i.Id));
        Assert.Null(next.Page(MediaKind.File, 5, 5, true).Next);

        // Publishing the pair as one object, while a reader reads: a reader
        // never sees a count of 6 with a list of 3, or the other way.
        TimelineSnapshot shown = old;
        var stop = false;
        var torn = 0;
        var reader = Task.Run(() => {
            while (!Volatile.Read(ref stop)) {
                var snap = Volatile.Read(ref shown);
                var seen = snap.Items.Count(i =>
                    MediaKinds.Of(i) == MediaKind.File);
                if (seen != snap.Count(MediaKind.File))
                    Interlocked.Increment(ref torn);
            }
        });
        for (var i = 0; i < 20000; i++)
            Volatile.Write(ref shown, i % 2 == 0 ? next : old);
        Volatile.Write(ref stop, true);
        await reader;
        Assert.Equal(0, torn);
    }

    private static int[] Count(IEnumerable<TimelineItem> lines)
    {
        var media = new int[4];
        foreach (var line in lines) {
            var kind = MediaKinds.Of(line);
            if (kind != null)
                media[(int)kind]++;
        }

        return media;
    }

    [Fact]
    public async Task
        A_page_is_made_from_the_snapshot_that_decided_it_was_enough()
    {
        TimelineItem[] Files(int n) => [
            .. Enumerable.Range(0, n)
                .Select(i => Media("f" + i, FileKind.File))
        ];

        var six = new TimelineSnapshot(Files(6), Count(Files(6)));
        var three = new TimelineSnapshot(Files(3), Count(Files(3)));

        // The snapshot is replaced by a smaller one (a delete or a reset)
        // right after the one that decided; the page is still of the first.
        var takes = 0;
        var (page, atStart) = await MediaPaging.Read(
            () => takes++ == 0 ? six : three,
            () => Task.FromResult(false), () => Task.CompletedTask,
            false, MediaKind.File, 0, 5);
        Assert.Equal(1, takes);
        Assert.Equal(5, page.Items.Count);
        Assert.Equal(5, page.Next);
        Assert.False(atStart);

        // With the pair of reads of before, this was 3 lines and a next page.
        // When it takes the snapshot again it is for the next round, and a
        // page is always of one snapshot: its lines and its Next agree.
        takes = 0;
        var asked = 0;
        var result = await MediaPaging.Read(
            () => takes++ switch { 0 => three, _ => six },
            () => {
                asked++;
                return Task.FromResult(false);
            }, () => Task.CompletedTask, false, MediaKind.File, 0, 5);
        Assert.Equal(1, asked);
        Assert.Equal(2, takes);
        Assert.Equal(5, result.Page.Items.Count);
        Assert.Equal(5, result.Page.Next);

        // Short of lines and at the start of the room: all it has, no next.
        var short3 = await MediaPaging.Read(() => three,
            () => Task.FromResult(true), () => Task.CompletedTask, false,
            MediaKind.File, 0, 5);
        Assert.Equal(3, short3.Page.Items.Count);
        Assert.Null(short3.Page.Next);
        Assert.True(short3.AtStart);

        // Out of rounds the page is of one snapshot too: its lines are the
        // ones of the last, and Next says there is more to ask for.
        var rounds = 0;
        takes = 0;
        var spent = await MediaPaging.Read(
            () => {
                takes++;
                return three;
            }, () => {
                rounds++;
                return Task.FromResult(false);
            }, () => Task.CompletedTask, false, MediaKind.File, 0, 5, 4);
        Assert.Equal(4, rounds);
        Assert.Equal(5, takes);
        Assert.Equal(3, spent.Page.Items.Count);
        Assert.Equal(5, spent.Page.Next);
    }

    private static async Task WaitFor(Func<bool> condition)
    {
        for (var i = 0; i < 200 && !condition(); i++)
            await Task.Delay(10);
        Assert.True(condition());
    }
}
