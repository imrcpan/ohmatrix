#if OHMATRIX_NATIVE_SDK
using System.Threading.Channels;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>
/// The chat list of the engine over the Matrix SDK (<c>sync</c> and the room list of <c>RustEngineCore</c>): the SDK delivers the list as changes
/// over its own order, and a row needs more than the list holds (the room's info and its newest event, both asked for). So the changes are
/// applied to a list of rooms, each room's summary is made and kept up to date, and the whole list is handed on.
/// </summary>
public sealed class MatrixRoomsEngine(MatrixAuthEngine auth) : IRoomsEngine {
    private readonly Channel<RoomListEntriesUpdate[]> updates =
        Channel.CreateUnbounded<RoomListEntriesUpdate[]>();

    private readonly List<Room> items = [];
    private readonly Dictionary<string, RoomSummary> summaries = [];
    private readonly Dictionary<string, TaskHandle> watching = [];
    private readonly Lock gate = new();

    private SyncService? sync;
    private RoomListEntriesWithDynamicAdaptersResult? entries;
    private TaskHandle? entriesTask;
    private TaskHandle? stateTask;
    private CancellationTokenSource? loop;

    public event Action<IReadOnlyList<RoomSummary>>? RoomsChanged;
    public event Action<SyncState>? SyncChanged;

    public async Task StartSync()
    {
        try {
            var client = auth.Client ?? throw new EngineException(
                EngineErrorCode.Unauthorized,
                "Not signed in."
            );
            sync ??= await client.SyncService().Finish();
            stateTask = sync.State(new StateObserver(this));
            var list = await sync.RoomListService().AllRooms();
            entries = list.EntriesWithDynamicAdapters(200, new EntriesListener(updates.Writer));
            entries.Controller().SetFilter(new RoomListEntriesDynamicFilterKind.NonLeft());
            entriesTask = entries.EntriesStream();
            loop = new CancellationTokenSource();
            _ = Pump(loop.Token);
            await sync.Start();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task StopSync()
    {
        loop?.Cancel();
        loop = null;
        try {
            if (sync is not null)
                await sync.Stop();
        } finally {
            foreach (var handle in watching.Values)
                handle.Dispose();
            watching.Clear();
            entriesTask?.Dispose();
            stateTask?.Dispose();
            entriesTask = null;
            stateTask = null;
            entries = null;
            sync = null;
            lock (gate) {
                items.Clear();
                summaries.Clear();
            }

            SyncChanged?.Invoke(SyncState.Stopped);
            RoomsChanged?.Invoke([]);
        }
    }

    // One reader, so that the changes are applied in the order the SDK made them.
    private async Task Pump(CancellationToken stop)
    {
        try {
            await foreach (var batch in updates.Reader.ReadAllAsync(stop)) {
                var added = Apply(batch);
                foreach (var room in added) {
                    var id = room.Id();
                    if (watching.ContainsKey(id))
                        continue;
                    watching[id] = room.SubscribeToRoomInfoUpdates(new InfoListener(this, room));
                }

                foreach (var room in added)
                    await Refresh(room);
                Emit();
            }
        } catch (OperationCanceledException) {
            // Stopped.
        }
    }

    private List<Room> Apply(RoomListEntriesUpdate[] batch)
    {
        var added = new List<Room>();
        lock (gate) {
            foreach (var u in batch) {
                switch (u) {
                    case RoomListEntriesUpdate.Append a:
                        items.AddRange(a.Values);
                        added.AddRange(a.Values);
                        break;
                    case RoomListEntriesUpdate.Clear:
                        items.Clear();
                        break;
                    case RoomListEntriesUpdate.PushFront f:
                        items.Insert(0, f.Value);
                        added.Add(f.Value);
                        break;
                    case RoomListEntriesUpdate.PushBack b:
                        items.Add(b.Value);
                        added.Add(b.Value);
                        break;
                    case RoomListEntriesUpdate.PopFront:
                        items.RemoveAt(0);
                        break;
                    case RoomListEntriesUpdate.PopBack:
                        items.RemoveAt(items.Count - 1);
                        break;
                    case RoomListEntriesUpdate.Insert i:
                        items.Insert((int)i.Index, i.Value);
                        added.Add(i.Value);
                        break;
                    case RoomListEntriesUpdate.Set s:
                        items[(int)s.Index] = s.Value;
                        added.Add(s.Value);
                        break;
                    case RoomListEntriesUpdate.Remove r:
                        items.RemoveAt((int)r.Index);
                        break;
                    case RoomListEntriesUpdate.Truncate t:
                        items.RemoveRange((int)t.Length, items.Count - (int)t.Length);
                        break;
                    case RoomListEntriesUpdate.Reset r:
                        items.Clear();
                        items.AddRange(r.Values);
                        added.AddRange(r.Values);
                        break;
                }
            }

            var ids = items.Select(r => r.Id()).ToHashSet();
            foreach (var gone in summaries.Keys.Where(k => !ids.Contains(k)).ToList())
                summaries.Remove(gone);
        }

        return added;
    }

    private async Task Refresh(Room room)
    {
        try {
            var info = await room.RoomInfo();
            var latest = await room.LatestEvent();
            var summary = Summarize(info, latest);
            lock (gate) {
                if (summary is null)
                    summaries.Remove(info.Id);
                else
                    summaries[info.Id] = summary;
            }
        } catch (Exception) {
            // The room is gone, or the SDK is not ready: the next change tries again.
        }
    }

    private void Emit()
    {
        List<RoomSummary> all;
        lock (gate) {
            all = [.. summaries.Values];
        }

        RoomsChanged?.Invoke(all);
    }

    /// <summary>The row of a room; null for a room that is not listed (left or banned).</summary>
    public static RoomSummary? Summarize(RoomInfo info, LatestEventValue latest)
    {
        if (info.Membership is Membership.Left or Membership.Banned)
            return null;
        var id = info.Id;
        string? text = null;
        string? sender = null;
        long ts = 0;
        if (latest is LatestEventValue.Remote remote) {
            ts = (long)remote.Timestamp;
            if (remote.Content is TimelineItemContent.MsgLike {
                Content.Kind: MsgLikeKind.Message m
            })
                text = m.Content.Body;
            if (!remote.IsOwn) {
                sender = remote.Profile is ProfileDetails.Ready { DisplayName: { } name }
                    ? name
                    : remote.Sender;
            }
        }

        return new RoomSummary {
            Id = id,
            Name = info.DisplayName ?? info.RawName ?? id,
            AvatarUrl = info.AvatarUrl,
            Inviter = info.Membership == Membership.Invited
                ? info.Inviter?.DisplayName ?? info.Inviter?.UserId ?? ""
                : null,
            Muted = info.CachedUserDefinedNotificationMode == RoomNotificationMode.Mute,
            Pinned = info.IsFavourite,
            MarkedUnread = info.IsMarkedUnread,
            IsDirect = info.IsDirect,
            IsSpace = info.IsSpace,
            MemberCount = (int)info.JoinedMembersCount,
            UnreadCount = (int)info.NumUnreadMessages,
            HighlightCount = (int)info.NumUnreadMentions,
            LastMessage = text,
            LastSender = sender,
            LastActivityTs = ts,
        };
    }

    private static SyncState ToState(SyncServiceState s)
    {
        return s switch {
            SyncServiceState.Running => SyncState.Syncing,
            SyncServiceState.Offline => SyncState.Connecting,
            SyncServiceState.Error => SyncState.Error,
            _ => SyncState.Stopped,
        };
    }

    private sealed class StateObserver(MatrixRoomsEngine engine) : SyncServiceStateObserver {
        public void OnUpdate(SyncServiceState state)
        {
            engine.SyncChanged?.Invoke(ToState(state));
        }
    }

    private sealed class EntriesListener(ChannelWriter<RoomListEntriesUpdate[]> writer)
        : RoomListEntriesListener {
        public void OnUpdate(RoomListEntriesUpdate[] roomEntriesUpdate)
        {
            writer.TryWrite(roomEntriesUpdate);
        }
    }

    private sealed class InfoListener(MatrixRoomsEngine engine, Room room) : RoomInfoListener {
        // The info carries no newest event, so the room is read again as a whole.
        public void Call(RoomInfo roomInfo)
        {
            _ = Task.Run(async () => {
                await engine.Refresh(room);
                engine.Emit();
            });
        }
    }
}
#endif
