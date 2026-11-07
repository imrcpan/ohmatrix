#if OHMATRIX_NATIVE_SDK
using System.Threading.Channels;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk;
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

    public async Task<string> JoinRoom(string idOrAlias)
    {
        try {
            var client = Signed();
            using var room = await client.JoinRoomByIdOrAlias(idOrAlias, []);
            return room.Id();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<string> CreateRoom(string? name, bool direct, IReadOnlyList<string> invite)
    {
        try {
            var client = Signed();
            return await client.CreateRoom(
                new CreateRoomParameters(
                    name,
                    false,
                    new RoomVisibility.Private(),
                    direct ? RoomPreset.TrustedPrivateChat : RoomPreset.PrivateChat,
                    null,
                    direct,
                    invite.Count == 0 ? null : [.. invite]
                )
            );
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<RoomDetails> Details(string roomId)
    {
        try {
            var room = Signed().GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound,
                "No such chat."
            );
            var info = await room.RoomInfo();
            var people = new List<RoomMemberInfo>();
            using var members = await room.Members();
            while (members.NextChunk(100) is { Length: > 0 } chunk) {
                foreach (var m in chunk.Where(m => m.Membership is MembershipState.Join)) {
                    people.Add(new RoomMemberInfo(
                        m.UserId,
                        m.DisplayName ?? m.UserId.TrimStart('@').Split(':')[0],
                        m.AvatarUrl,
                        m.SuggestedRoleForPowerLevel switch {
                            RoomMemberRole.Administrator or RoomMemberRole.Creator => MemberRole.Admin,
                            RoomMemberRole.Moderator => MemberRole.Moderator,
                            _ => MemberRole.Member,
                        }
                    ));
                }
            }

            return new RoomDetails(
                string.IsNullOrWhiteSpace(info.Topic) ? null : info.Topic,
                [.. people.OrderByDescending(p => p.Role).ThenBy(p => p.Name)]
            );
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public Task SetRoomName(string roomId, string name)
    {
        return Act(roomId, room => room.SetName(name));
    }

    public Task SetRoomTopic(string roomId, string topic)
    {
        return Act(roomId, room => room.SetTopic(topic));
    }

    public async Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(string filter, string? server)
    {
        try {
            using var search = Signed().RoomDirectorySearch();
            var listener = new DirectoryListener();
            using var handle = await search.Results(listener);
            await search.Search(string.IsNullOrWhiteSpace(filter) ? null : filter.Trim(), 30, server);
            // The entries come through the listener; the list is taken once it has stopped changing.
            var last = -1;
            for (var i = 0; i < 40; i++) {
                await Task.Delay(250);
                var now = listener.Version;
                if (now > 0 && now == last)
                    break;
                last = now;
            }

            return listener.Rooms();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private sealed class DirectoryListener : RoomDirectorySearchEntriesListener {
        private readonly List<RoomDescription> rooms = [];
        private int version;

        public int Version => Volatile.Read(ref version);

        public IReadOnlyList<PublicRoom> Rooms()
        {
            lock (rooms) {
                return
                [
                    .. rooms.Select(r => new PublicRoom(
                        r.RoomId,
                        r.Name ?? r.Alias ?? r.RoomId,
                        string.IsNullOrWhiteSpace(r.Topic) ? null : r.Topic,
                        r.Alias,
                        r.AvatarUrl,
                        (long)r.JoinedMembers
                    ))
                ];
            }
        }

        public void OnUpdate(RoomDirectorySearchEntryUpdate[] roomEntriesUpdate)
        {
            lock (rooms) {
                foreach (var update in roomEntriesUpdate) {
                    switch (update) {
                        case RoomDirectorySearchEntryUpdate.Append a:
                            rooms.AddRange(a.Values);
                            break;
                        case RoomDirectorySearchEntryUpdate.Reset r:
                            rooms.Clear();
                            rooms.AddRange(r.Values);
                            break;
                        case RoomDirectorySearchEntryUpdate.Clear:
                            rooms.Clear();
                            break;
                        case RoomDirectorySearchEntryUpdate.PushFront f:
                            rooms.Insert(0, f.Value);
                            break;
                        case RoomDirectorySearchEntryUpdate.PushBack b:
                            rooms.Add(b.Value);
                            break;
                        case RoomDirectorySearchEntryUpdate.PopFront when rooms.Count > 0:
                            rooms.RemoveAt(0);
                            break;
                        case RoomDirectorySearchEntryUpdate.PopBack when rooms.Count > 0:
                            rooms.RemoveAt(rooms.Count - 1);
                            break;
                        case RoomDirectorySearchEntryUpdate.Insert i when i.Index <= rooms.Count:
                            rooms.Insert((int)i.Index, i.Value);
                            break;
                        case RoomDirectorySearchEntryUpdate.Set s when s.Index < rooms.Count:
                            rooms[(int)s.Index] = s.Value;
                            break;
                        case RoomDirectorySearchEntryUpdate.Remove x when x.Index < rooms.Count:
                            rooms.RemoveAt((int)x.Index);
                            break;
                        case RoomDirectorySearchEntryUpdate.Truncate t when t.Length < rooms.Count:
                            rooms.RemoveRange((int)t.Length, rooms.Count - (int)t.Length);
                            break;
                    }
                }
            }

            Interlocked.Increment(ref version);
        }
    }

    public async Task<IReadOnlyList<SpaceChild>> SpaceChildren(string spaceId)
    {
        try {
            var service = await Signed().SpaceService();
            using var list = await service.SpaceRoomList(spaceId);
            // A page at a time, a few pages: a very large space shows its first rooms.
            for (var i = 0; i < 4; i++) {
                try {
                    await list.Paginate();
                } catch (Exception) {
                    break;
                }
            }

            var rooms = await list.Rooms();
            return
            [
                .. rooms.Where(r => r.RoomId != spaceId).Select(r => new SpaceChild(
                    r.RoomId,
                    r.DisplayName,
                    string.IsNullOrWhiteSpace(r.Topic) ? null : r.Topic,
                    r.AvatarUrl,
                    (long)r.NumJoinedMembers,
                    r.RoomType is RoomType.Space
                ))
            ];
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public Task SetRoomAvatar(string roomId, string mimeType, byte[] data)
    {
        return Act(roomId, room => room.UploadAvatar(mimeType, data, null));
    }

    public Task LeaveRoom(string roomId)
    {
        return Act(roomId, room => room.Leave());
    }

    public async Task BlockUser(string userId)
    {
        try {
            await Signed().IgnoreUser(userId);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<IReadOnlyList<PersonInfo>> SearchPeople(string term)
    {
        try {
            var found = await Signed().SearchUsers(term, 20);
            return
            [
                .. found.Results.Select(u => new PersonInfo(
                    u.UserId,
                    string.IsNullOrWhiteSpace(u.DisplayName)
                        ? u.UserId.TrimStart('@').Split(':')[0]
                        : u.DisplayName,
                    u.AvatarUrl
                ))
            ];
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public Task InviteToRoom(string roomId, IReadOnlyList<string> userIds)
    {
        return Act(roomId, async room => {
            foreach (var id in userIds)
                await room.InviteUserById(id);
        });
    }

    public Task SetMemberRole(string roomId, string userId, MemberRole role)
    {
        var level = role switch {
            MemberRole.Admin => 100L,
            MemberRole.Moderator => 50L,
            _ => 0L,
        };
        return Act(roomId, room => room.UpdatePowerLevelsForUsers([
            new UserPowerLevelUpdate(userId, level)
        ]));
    }

    public Task RemoveMember(string roomId, string userId)
    {
        return Act(roomId, room => room.KickUser(userId, null));
    }

    public Task BanMember(string roomId, string userId, string? reason)
    {
        return Act(roomId, room => room.BanUser(userId, reason));
    }

    public Task AcceptInvite(string roomId)
    {
        return Act(roomId, room => room.Join());
    }

    public Task DeclineInvite(string roomId)
    {
        return Act(roomId, room => room.Leave());
    }

    public Task SetPinned(string roomId, bool pinned)
    {
        return Act(roomId, room => room.SetIsFavourite(pinned, null));
    }

    public Task SetMarkedUnread(string roomId, bool unread)
    {
        return Act(roomId, room => room.SetUnreadFlag(unread));
    }

    public Task SetMuted(string roomId, bool muted)
    {
        return Run(async () => {
            var settings = await Signed().GetNotificationSettings();
            if (muted)
                await settings.SetRoomNotificationMode(roomId, RoomNotificationMode.Mute);
            else
                await settings.RestoreDefaultRoomNotificationMode(roomId);
        });
    }

    public Task MarkRoomRead(string roomId)
    {
        return Act(roomId, async room => {
            await room.SetUnreadFlag(false);
            using var timeline = await room.Timeline();
            await timeline.MarkAsRead(ReceiptType.Read);
        });
    }

    private Task Act(string roomId, Func<Room, Task> action)
    {
        return Run(async () => {
            var room = Signed().GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound,
                "No such chat."
            );
            await action(room);
        });
    }

    private static async Task Run(Func<Task> action)
    {
        try {
            await action();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private Client Signed()
    {
        return auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
    }

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
            else
                text = ServiceLines.For(
                    remote.Content,
                    remote.Profile is ProfileDetails.Ready { DisplayName: { } who }
                        ? who
                        : ServiceText.PersonName(null, remote.Sender)
                );
            if (!remote.IsOwn && remote.Content is TimelineItemContent.MsgLike) {
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
            LastIsLine =
 latest is LatestEventValue.Remote { Content: not TimelineItemContent.MsgLike },
            LastActivityTs = ts,
            PinnedEventIds = info.PinnedEventIds,
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
