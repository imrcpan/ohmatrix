#if OHMATRIX_NATIVE_SDK
using System.Threading.Channels;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Infra.Logging;
using uniffi.matrix_sdk;
using uniffi.matrix_sdk_ffi;
using MatrixSdk = uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>
/// The chat list of the engine over the Matrix SDK (<c>sync</c> and the room list of <c>RustEngineCore</c>): the SDK delivers the list as changes
/// over its own order, and a row needs more than the list holds (the room's info and its newest event, both asked for). So the changes are
/// applied to a list of rooms, each room's summary is made and kept up to date, and the whole list is handed on.
/// </summary>
public sealed class MatrixRoomsEngine(MatrixAuthEngine auth) : IRoomsEngine {
    private static readonly Logger logger = Logger.GetDefault();

    // One queue for each run of the sync: the changes of a run that is over
    // are not read by the next, whose list they do not belong to.
    private readonly RunChannel<RoomListEntriesUpdate[]> updates = new();

    // What the list knows (the rooms, their summaries in order, and the run of
    // the sync they belong to); the ids of the rooms are asked of the SDK once.
    private readonly RoomBook<Room> book = new(room => room.Id());

    private readonly Dictionary<string, TaskHandle> watching = [];

    // Handing the list on is one at a time, and a run that is over does not.
    private readonly Lock emitGate = new();

    // The notices of the rooms that come close together are one hand-over.
    private readonly Burst burst = new(TimeSpan.FromMilliseconds(40),
        TimeProvider.System);

    // The rooms read at the same time are few, whatever the number of changes.
    private readonly KeyedWork work = new(MaxReading);
    private const int MaxReading = 16;

    // The newest message of a room whose newest event is not one (the join
    // of an account that is new, a name that changed): the SDK keeps one event
    // of a room it has not read, so the row of the room would say there is
    // none. A few rooms are read at a time, once each, and only the recent
    // events of the room: no history is asked for beyond that.
    private readonly KeyedWork recovering = new(MaxRecovering);
    private const int MaxRecovering = 3;
    private const int RecentPages = 2;

    private readonly System.Collections.Concurrent.ConcurrentDictionary<string,
        Recent> recent = new();

    private readonly MatrixChatEngine chats = new(auth);

    // Text is null for a room that was read and has no message in its recent events.
    private sealed record Recent(string? Text, string? Sender, long Ts);

    /// <summary>How many rooms have their changes watched; the rooms of the list, and no others.</summary>
    public int WatchedRooms => Volatile.Read(ref watchedRooms);

    private int watchedRooms;
    private bool emitted;

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

    public async Task<string> CreateRoom(string? name, bool direct,
        IReadOnlyList<string> invite)
    {
        try {
            var client = Signed();
            return await client.CreateRoom(
                new CreateRoomParameters(
                    name,
                    false,
                    new RoomVisibility.Private(),
                    direct
                        ? RoomPreset.TrustedPrivateChat
                        : RoomPreset.PrivateChat,
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
            var banned = new List<BannedMemberInfo>();
            while (members.NextChunk(100) is { Length: > 0 } chunk) {
                foreach (var m in chunk.Where(m =>
                             m.Membership is MembershipState.Ban))
                    banned.Add(new BannedMemberInfo(m.UserId,
                        m.DisplayName ?? m.UserId.TrimStart('@').Split(':')[0],
                        string.IsNullOrWhiteSpace(m.MembershipChangeReason)
                            ? null
                            : m.MembershipChangeReason));
                foreach (var m in chunk.Where(m =>
                             m.Membership is MembershipState.Join)) {
                    people.Add(new RoomMemberInfo(
                        m.UserId,
                        m.DisplayName ?? m.UserId.TrimStart('@').Split(':')[0],
                        m.AvatarUrl,
                        m.SuggestedRoleForPowerLevel switch {
                            RoomMemberRole.Administrator
                                or RoomMemberRole.Creator => MemberRole
                                    .Admin,
                            RoomMemberRole.Moderator => MemberRole.Moderator,
                            _ => MemberRole.Member,
                        }
                    ) {
                        Power = m.PowerLevel is PowerLevel.Value v
                            ? (int)v.ValueValue
                            : null
                    });
                }
            }

            var canonical = room.CanonicalAlias();
            var alt = room.AlternativeAliases();
            var aliases = new List<string>();
            if (canonical != null)
                aliases.Add(canonical);
            aliases.AddRange(alt.Where(a => a != canonical));

            var rawJoinRule = info.JoinRule;
            var joinRule = rawJoinRule switch {
                MatrixSdk.JoinRule.Public =>
                    OhMatrix.Core.Model.JoinRule.Public,
                MatrixSdk.JoinRule.Invite =>
                    OhMatrix.Core.Model.JoinRule.Invite,
                MatrixSdk.JoinRule.Knock => OhMatrix.Core.Model.JoinRule.Knock,
                MatrixSdk.JoinRule.Restricted => OhMatrix.Core.Model.JoinRule
                    .Restricted,
                _ => OhMatrix.Core.Model.JoinRule.Other,
            };

            var rawHistory = info.HistoryVisibility;
            var history = rawHistory switch {
                MatrixSdk.RoomHistoryVisibility.Invited =>
                    OhMatrix.Core.Model.HistoryVisibility.Invited,
                MatrixSdk.RoomHistoryVisibility.Joined =>
                    OhMatrix.Core.Model.HistoryVisibility.Joined,
                MatrixSdk.RoomHistoryVisibility.Shared =>
                    OhMatrix.Core.Model.HistoryVisibility.Shared,
                MatrixSdk.RoomHistoryVisibility.WorldReadable =>
                    OhMatrix.Core.Model.HistoryVisibility.WorldReadable,
                _ => OhMatrix.Core.Model.HistoryVisibility.Shared,
            };

            var levels = await room.GetPowerLevels();
            var vals = levels.Values();
            var thresholds = new PowerThresholds(
                (int)vals.Invite,
                (int)vals.Kick,
                (int)vals.Ban,
                (int)vals.Redact,
                (int)vals.EventsDefault,
                (int)vals.StateDefault,
                (int)vals.StateDefault
            );

            var isDirect = info.IsDirect;
            var me = Signed().UserId();
            var can = new RoomPermissions(
                EditInfo: !isDirect &&
                          levels.CanUserSendState(me,
                              new StateEventType.RoomName()),
                Invite: !isDirect && levels.CanUserInvite(me),
                Kick: !isDirect && levels.CanUserKick(me),
                Ban: !isDirect && levels.CanUserBan(me),
                ChangeRoles: !isDirect &&
                             levels.CanUserSendState(me,
                                 new StateEventType.RoomPowerLevels()),
                Pin: !isDirect && levels.CanUserPinUnpin(me),
                ChangeSettings: !isDirect &&
                                levels.CanUserSendState(me,
                                    new StateEventType.RoomJoinRules())
            );

            return new RoomDetails(
                string.IsNullOrWhiteSpace(info.Topic) ? null : info.Topic,
                [.. people.OrderByDescending(p => p.Role).ThenBy(p => p.Name)],
                aliases,
                joinRule,
                history,
                thresholds,
                can,
                isDirect
            ) {
                IsEncrypted = await room.IsEncrypted(),
                Banned = banned,
            };
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

    public async Task<IReadOnlyList<PublicRoom>> SearchPublicRooms(
        string filter, string? server)
    {
        try {
            using var search = Signed().RoomDirectorySearch();
            var listener = new DirectoryListener();
            using var handle = await search.Results(listener);
            await search.Search(
                string.IsNullOrWhiteSpace(filter) ? null : filter.Trim(), 30,
                server);
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

    private sealed class
        DirectoryListener : RoomDirectorySearchEntriesListener {
        private readonly List<RoomDescription> rooms = [];

        private int version;
        public int Version => Volatile.Read(ref version);

        public IReadOnlyList<PublicRoom> Rooms()
        {
            lock (rooms) {
                return [
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
                    ApplyUpdate(update);
                }
            }

            Interlocked.Increment(ref version);
        }

        private void ApplyUpdate(RoomDirectorySearchEntryUpdate update)
        {
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
                case RoomDirectorySearchEntryUpdate.PopFront
                    when rooms.Count > 0:
                    rooms.RemoveAt(0);
                    break;
                case RoomDirectorySearchEntryUpdate.PopBack
                    when rooms.Count > 0:
                    rooms.RemoveAt(rooms.Count - 1);
                    break;
                case RoomDirectorySearchEntryUpdate.Insert i
                    when i.Index <= rooms.Count:
                    rooms.Insert((int)i.Index, i.Value);
                    break;
                case RoomDirectorySearchEntryUpdate.Set s
                    when s.Index < rooms.Count:
                    rooms[(int)s.Index] = s.Value;
                    break;
                case RoomDirectorySearchEntryUpdate.Remove x
                    when x.Index < rooms.Count:
                    rooms.RemoveAt((int)x.Index);
                    break;
                case RoomDirectorySearchEntryUpdate.Truncate t
                    when t.Length < rooms.Count:
                    rooms.RemoveRange((int)t.Length,
                        rooms.Count - (int)t.Length);
                    break;
            }
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
                } catch (Exception e) {
                    logger.Unexpected("MatrixRoomsEngine", e);
                    break;
                }
            }

            var rooms = await list.Rooms();
            return [
                .. rooms.Where(r => r.RoomId != spaceId).Select(r =>
                    new SpaceChild(
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
            return [
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

    public Task SetMemberPower(string roomId, string userId, int level)
    {
        return Act(roomId, room => room.UpdatePowerLevelsForUsers([
            new UserPowerLevelUpdate(userId, level)
        ]));
    }

    public Task UnbanMember(string roomId, string userId)
    {
        return Act(roomId, room => room.UnbanUser(userId, null));
    }

    public Task RemoveMember(string roomId, string userId)
    {
        return Act(roomId, room => room.KickUser(userId, null));
    }

    public Task BanMember(string roomId, string userId, string? reason)
    {
        return Act(roomId, room => room.BanUser(userId, reason));
    }

    public Task SetJoinRule(string roomId, OhMatrix.Core.Model.JoinRule rule)
    {
        uniffi.matrix_sdk_ffi.JoinRule sdk = rule switch {
            OhMatrix.Core.Model.JoinRule.Public =>
                new MatrixSdk.JoinRule.Public(),
            OhMatrix.Core.Model.JoinRule.Invite =>
                new MatrixSdk.JoinRule.Invite(),
            OhMatrix.Core.Model.JoinRule.Knock =>
                new MatrixSdk.JoinRule.Knock(),
            OhMatrix.Core.Model.JoinRule.Restricted =>
                new MatrixSdk.JoinRule.Restricted([]),
            _ => new MatrixSdk.JoinRule.Invite(),
        };
        return Act(roomId, room => room.UpdateJoinRules(sdk));
    }

    public Task SetHistoryVisibility(string roomId,
        OhMatrix.Core.Model.HistoryVisibility visibility)
    {
        uniffi.matrix_sdk_ffi.RoomHistoryVisibility sdk = visibility switch {
            OhMatrix.Core.Model.HistoryVisibility.Invited =>
                new MatrixSdk.RoomHistoryVisibility.Invited(),
            OhMatrix.Core.Model.HistoryVisibility.Joined =>
                new MatrixSdk.RoomHistoryVisibility.Joined(),
            OhMatrix.Core.Model.HistoryVisibility.Shared =>
                new MatrixSdk.RoomHistoryVisibility.Shared(),
            OhMatrix.Core.Model.HistoryVisibility.WorldReadable =>
                new MatrixSdk.RoomHistoryVisibility.WorldReadable(),
            _ => new MatrixSdk.RoomHistoryVisibility.Shared(),
        };
        return Act(roomId, room => room.UpdateHistoryVisibility(sdk));
    }

    public async Task<bool> IsAliasAvailable(string alias)
    {
        try {
            return !await Signed().RoomAliasExists(alias);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public Task AddRoomAlias(string roomId, string alias)
    {
        return Act(roomId, async room => {
            await room.PublishRoomAliasInRoomDirectory(alias);
            // It is listed with the room: as the main address when there is none, otherwise as another one.
            var canonical = room.CanonicalAlias();
            var alt = room.AlternativeAliases().Where(a => a != alias).ToList();
            if (canonical == null)
                await room.UpdateCanonicalAlias(alias, [.. alt]);
            else if (canonical != alias) {
                alt.Add(alias);
                await room.UpdateCanonicalAlias(canonical, [.. alt]);
            }
        });
    }

    public Task RemoveRoomAlias(string roomId, string alias)
    {
        return Act(roomId,
            room => room.RemoveRoomAliasFromRoomDirectory(alias));
    }

    public Task SetMainAlias(string roomId, string? alias)
    {
        return Act(roomId, async room => {
            var alt = room.AlternativeAliases().Where(a => a != alias)
                .ToArray();
            await room.UpdateCanonicalAlias(alias, alt);
        });
    }

    public Task SetPowerThresholds(string roomId, PowerThresholds thresholds)
    {
        return Act(roomId, async room => {
            var changes = new uniffi.matrix_sdk.RoomPowerLevelChanges(
                Ban: (long)thresholds.Ban,
                Invite: (long)thresholds.Invite,
                Kick: (long)thresholds.Kick,
                Redact: (long)thresholds.Redact,
                EventsDefault: (long)thresholds.SendMessages,
                StateDefault: (long)thresholds.ChangeSettings
            );
            await room.ApplyPowerLevelChanges(changes);
        });
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
                await settings.SetRoomNotificationMode(roomId,
                    RoomNotificationMode.Mute);
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
            // The run is started before the SDK can make a change: its queue,
            // its generation and its reader belong together.
            var queue = updates.Open();
            var gen = book.Begin();
            entries = list.EntriesWithDynamicAdapters(200,
                new EntriesListener(queue.Writer));
            entries.Controller()
                .SetFilter(new RoomListEntriesDynamicFilterKind.NonLeft());
            entriesTask = entries.EntriesStream();
            loop = new CancellationTokenSource();
            _ = Pump(queue.Reader, loop.Token, gen);
            await sync.Start();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task StopSync()
    {
        // The run is over at once: a read that is on its way is not written.
        book.End();
        recent.Clear();
        updates.Close();
        loop?.Cancel();
        loop = null;
        try {
            if (sync != null)
                await sync.Stop();
        } finally {
            foreach (var handle in watching.Values)
                handle.Dispose();
            watching.Clear();
            Volatile.Write(ref watchedRooms, 0);
            emitted = false;
            entriesTask?.Dispose();
            stateTask?.Dispose();
            entriesTask = null;
            stateTask = null;
            entries = null;
            sync = null;
            SyncChanged?.Invoke(SyncState.Stopped);
            lock (emitGate)
                RoomsChanged?.Invoke([]);
        }
    }

    // One reader, so that the changes are applied in the order the SDK made them.
    private async Task Pump(ChannelReader<RoomListEntriesUpdate[]> queue,
        CancellationToken stop, int gen)
    {
        try {
            await foreach (var batch in queue.ReadAllAsync(stop)) {
                var (added, left) = book.Apply(gen, batch.Select(ToOp));
                // A room that left the list is not watched any more.
                foreach (var id in left) {
                    if (watching.Remove(id, out var handle)) {
                        handle.Dispose();
                        Interlocked.Decrement(ref watchedRooms);
                    }
                }

                // Only the rooms that are in the list when the batch is over.
                foreach (var entered in added) {
                    // A room that was put in again has a new stay: it is
                    // watched anew, for what the old watch reads is old.
                    if (watching.Remove(entered.Id, out var old)) {
                        old.Dispose();
                        Interlocked.Decrement(ref watchedRooms);
                    }

                    watching[entered.Id] =
                        entered.Item.SubscribeToRoomInfoUpdates(
                            new InfoListener(this, entered, gen));
                    Interlocked.Increment(ref watchedRooms);
                }

                // Two calls to the SDK for each room, for rooms that do not
                // wait for each other.
                var changed = await Task.WhenAll(added.Select(entered =>
                    work.Limit(() => Refresh(entered, gen))));
                // The list is handed on when a row changed or a room left;
                // a change of order alone is not a change of what is shown.
                // The first batch is always handed on: it tells that the
                // list has been read, even when it is empty.
                if (!emitted || left.Count > 0 || changed.Contains(true)) {
                    emitted = true;
                    Emit(gen);
                }
            }
        } catch (OperationCanceledException) {
            // Stopped.
        }
    }

    private static ListOp<Room> ToOp(RoomListEntriesUpdate u)
    {
        return u switch {
            RoomListEntriesUpdate.Append a =>
                new ListOp<Room>(ListOpKind.Append, Values: a.Values),
            RoomListEntriesUpdate.Clear => new ListOp<Room>(ListOpKind.Clear),
            RoomListEntriesUpdate.PushFront f =>
                new ListOp<Room>(ListOpKind.PushFront, Value: f.Value),
            RoomListEntriesUpdate.PushBack b =>
                new ListOp<Room>(ListOpKind.PushBack, Value: b.Value),
            RoomListEntriesUpdate.PopFront =>
                new ListOp<Room>(ListOpKind.PopFront),
            RoomListEntriesUpdate.PopBack =>
                new ListOp<Room>(ListOpKind.PopBack),
            RoomListEntriesUpdate.Insert i =>
                new ListOp<Room>(ListOpKind.Insert, Value: i.Value,
                    Index: (int)i.Index),
            RoomListEntriesUpdate.Set s =>
                new ListOp<Room>(ListOpKind.Set, Value: s.Value,
                    Index: (int)s.Index),
            RoomListEntriesUpdate.Remove r =>
                new ListOp<Room>(ListOpKind.Remove, Index: (int)r.Index),
            RoomListEntriesUpdate.Truncate t =>
                new ListOp<Room>(ListOpKind.Truncate, Index: (int)t.Length),
            RoomListEntriesUpdate.Reset r =>
                new ListOp<Room>(ListOpKind.Reset, Values: r.Values),
            _ => throw new InvalidOperationException("Unknown change."),
        };
    }

    // True when the row of the room is not what it was. What is read after the
    // run is over, or for a room that has left the list, is not written.
    private async Task<bool> Refresh(RoomBook<Room>.Entered entered, int gen)
    {
        try {
            var info = await entered.Item.RoomInfo();
            var latest = await entered.Item.LatestEvent();
            var summary = Summarize(info, latest);
            if (summary != null && NeedsRecent(summary))
                summary = WithRecent(summary, entered, gen);
            return book.Write(gen, entered.Id, entered.Entry, summary);
        } catch (Exception e) {
            logger.Unexpected("MatrixRoomsEngine", e);
            // The room is gone, or the SDK is not ready: the next change tries again.
            return false;
        }
    }

    // A room that is not an invite or a space, whose row has no message.
    private static bool NeedsRecent(RoomSummary room)
    {
        return room.Inviter == null && !room.IsSpace &&
               (room.LastMessage == null || room.LastIsLine);
    }

    // The row with the newest message read for the room; when it has not
    // been read yet, the row as it is, and the room is read.
    private RoomSummary WithRecent(RoomSummary room,
        RoomBook<Room>.Entered entered, int gen)
    {
        if (!recent.TryGetValue(entered.Id, out var found)) {
            recovering.Request($"{entered.Id}#{entered.Entry}",
                () => ReadRecent(entered, gen));
            return room;
        }

        if (found.Text == null)
            return room;
        return room with {
            LastMessage = found.Text,
            LastSender = found.Sender,
            LastIsLine = false,
            LastActivityTs = Math.Max(room.LastActivityTs, found.Ts),
        };
    }

    private async Task ReadRecent(RoomBook<Room>.Entered entered, int gen)
    {
        Recent result;
        try {
            result = await FindRecent(entered.Id);
        } catch (Exception e) {
            // Read again by the next change of the room.
            logger.Warn($"Recent messages of {entered.Id}: {e.Message}");
            return;
        }

        recent[entered.Id] = result;
        if (result.Text != null && await Refresh(entered, gen))
            burst.Poke(() => Emit(gen));
    }

    private async Task<Recent> FindRecent(string roomId)
    {
        using var session = await chats.Open(roomId);
        for (var page = 0;; page++) {
            // The lines come from the SDK on their own: waited for a moment.
            for (var wait = 0;
                 wait < 15 && Newest(session.Items) == null;
                 wait++)
                await Task.Delay(100);
            if (Newest(session.Items) is { } message)
                return message;
            if (page == RecentPages || await session.LoadOlder())
                return new Recent(null, null, 0);
        }
    }

    private static Recent? Newest(
        IReadOnlyList<OhMatrix.Core.Model.TimelineItem> items)
    {
        for (var i = items.Count - 1; i >= 0; i--) {
            var item = items[i];
            if (item.Kind != TimelineKind.Message)
                continue;
            var text = item.Body.Length > 0 ? item.Body : item.File?.Name;
            if (string.IsNullOrEmpty(text))
                continue;
            var sender = item.IsOwn
                ? null
                : item.SenderName.Length > 0
                    ? item.SenderName
                    : item.SenderId;
            return new Recent(text, sender, item.Ts);
        }

        return null;
    }

    private void Emit(int gen)
    {
        lock (emitGate) {
            var all = book.Snapshot(gen);
            if (all != null)
                RoomsChanged?.Invoke(all);
        }
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
                    remote.Profile is ProfileDetails.Ready {
                        DisplayName: { } who
                    }
                        ? who
                        : ServiceText.PersonName(null, remote.Sender)
                );
            if (!remote.IsOwn &&
                remote.Content is TimelineItemContent.MsgLike) {
                sender = remote.Profile is ProfileDetails.Ready {
                    DisplayName: { } name
                }
                    ? name
                    : ServiceText.PersonName(null, remote.Sender);
            }
        }

        return new RoomSummary {
            Id = id,
            Name = info.DisplayName ?? info.RawName ?? id,
            AvatarUrl = info.AvatarUrl,
            Inviter = info.Membership == Membership.Invited
                ? info.Inviter?.DisplayName ?? info.Inviter?.UserId ?? ""
                : null,
            Muted = info.CachedUserDefinedNotificationMode ==
                    RoomNotificationMode.Mute,
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
                latest is LatestEventValue.Remote {
                    Content: not TimelineItemContent.MsgLike
                },
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

    private sealed class StateObserver(MatrixRoomsEngine engine)
        : SyncServiceStateObserver {
        public void OnUpdate(SyncServiceState state)
        {
            engine.SyncChanged?.Invoke(ToState(state));
        }
    }

    private sealed class EntriesListener(
        ChannelWriter<RoomListEntriesUpdate[]> writer)
        : RoomListEntriesListener {
        public void OnUpdate(RoomListEntriesUpdate[] roomEntriesUpdate)
        {
            writer.TryWrite(roomEntriesUpdate);
        }
    }

    private sealed class InfoListener(
        MatrixRoomsEngine engine,
        RoomBook<Room>.Entered entered,
        int gen
    ) : RoomInfoListener {
        // The info carries no newest event, so the room is read again as a
        // whole; once for a burst of changes, and the list is handed on only
        // when the row is another one.
        public void Call(RoomInfo roomInfo)
        {
            // The key has the stay of the room in it: the reads of an old stay
            // and of a new one never share a run, and the old one is dropped
            // when it writes.
            engine.work.Request($"{entered.Id}#{entered.Entry}", async () => {
                if (await engine.Refresh(entered, gen))
                    engine.burst.Poke(() => engine.Emit(gen));
            });
        }
    }
}
#endif
