#if OHMATRIX_NATIVE_SDK
using System.Threading.Channels;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;
using TimelineItem = OhMatrix.Core.Model.TimelineItem;
using SdkTimelineItem = uniffi.matrix_sdk_ffi.TimelineItem;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Engine;

/// <summary>Opens chats over the Matrix SDK (<c>timeline</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixChatEngine(MatrixAuthEngine auth) : IChatEngine {
    private static readonly Logger logger = Logger.GetDefault();

    public async Task SendMessageContent(string roomId,
        System.Text.Json.Nodes.JsonObject content)
    {
        try {
            var client = auth.Client ?? throw new EngineException(
                EngineErrorCode.Unauthorized,
                "Not signed in."
            );
            var room = client.GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound,
                "No such chat."
            );
            await room.SendRaw("m.room.message", content.ToJsonString());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task<IChatSession> Open(string roomId)
    {
        try {
            var client = auth.Client ?? throw new EngineException(
                EngineErrorCode.Unauthorized,
                "Not signed in."
            );
            var room = client.GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound,
                "No such chat."
            );
            return await OpenSession(client, room);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private static async Task<Session> OpenSession(Client client, Room room)
    {
        var timeline = await room.Timeline();
        var session = new Session(timeline, room, client.UserId());
        await session.Start();
        return session;
    }

    private sealed class Gallery(Session session) {
        public Session Session { get; } = session;
        public bool AtStart { get; set; }
    }

    private readonly Dictionary<string, Gallery> galleries = [];

    // How long to wait for what a request for history brings, when it does
    // not tell of a change; it comes at once otherwise.
    private static readonly TimeSpan ArrivalWait =
        TimeSpan.FromMilliseconds(100);

    private static readonly TimeSpan FirstPageWait = TimeSpan.FromSeconds(2);

    public async Task<SharedMediaPage> SharedMedia(string roomId,
        MediaKind kind, int offset, int want)
    {
        Gallery? gallery;
        lock (galleries)
            galleries.TryGetValue(roomId, out gallery);
        using var change = new Change();
        if (gallery == null) {
            gallery = new Gallery(await OpenGallery(roomId));
            lock (galleries)
                galleries[roomId] = gallery;
            // The first page of history comes with opening; let it arrive.
            change.Watch(gallery.Session);
            var late = Task.Delay(FirstPageWait);
            while (gallery.Session.Items.Count == 0) {
                var next = change.Next;
                if (gallery.Session.Items.Count != 0 ||
                    await Task.WhenAny(next, late) != next)
                    break;
            }
        }

        change.Watch(gallery.Session);

        // Ask the room for more until it has what the page needs (and one
        // more, to know whether there is a next page); the page is made from
        // the snapshot that decided it was enough.
        Task coming = Task.CompletedTask;
        var read = await MediaPaging.Read(
            () => gallery.Session.Snapshot,
            async () => {
                // Taken before the request, so that a quick change is not
                // missed.
                coming = change.Next;
                return await gallery.Session.LoadOlder();
            },
            // What it brought comes as a change of the session a moment later.
            () => Task.WhenAny(coming, Task.Delay(ArrivalWait)),
            gallery.AtStart, kind, offset, want);
        gallery.AtStart = read.AtStart;
        return read.Page;
    }

    private async Task<Session> OpenGallery(string roomId)
    {
        try {
            var client = auth.Client ?? throw new EngineException(
                EngineErrorCode.Unauthorized,
                "Not signed in."
            );
            var room = client.GetRoom(roomId) ?? throw new EngineException(
                EngineErrorCode.NotFound,
                "No such chat."
            );
            return await OpenSession(client, room);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    /// <summary>
    /// Tells when a session has changed: <see cref="Next"/> is the task of the
    /// next change, taken before the request that is to cause it, so that a
    /// change that is quick is not missed.
    /// </summary>
    private sealed class Change : IDisposable {
        private TaskCompletionSource next = New();
        private IChatSession? watched;

        public Task Next => Volatile.Read(ref next).Task;

        private static TaskCompletionSource New() =>
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void Watch(IChatSession session)
        {
            if (ReferenceEquals(watched, session))
                return;
            watched = session;
            session.Changed += OnChanged;
        }

        private void OnChanged(IReadOnlyList<TimelineItem> _)
        {
            Interlocked.Exchange(ref next, New()).TrySetResult();
        }

        public void Dispose()
        {
            if (watched != null)
                watched.Changed -= OnChanged;
        }
    }

    /// <summary>One open chat: the SDK's changes are applied to a list of its items, in order, and the lines are made from them.</summary>
    private sealed class Session(Timeline timeline, Room room, string me)
        : IChatSession {
        private readonly Channel<TimelineDiff[]> diffs =
            Channel.CreateUnbounded<TimelineDiff[]>();

        // One slot per item of the SDK, in order: the item, its id and the
        // line made from it (null for what is not shown). A diff makes
        // lines only for the items it adds or replaces.
        private sealed record Slot(
            SdkTimelineItem Item,
            string Id,
            TimelineItem? Line
        );

        private readonly List<Slot> items = [];

        // The lines and the count of each kind of media, published together:
        // what a reader takes is a list and the count of that list.
        private TimelineSnapshot snapshot = TimelineSnapshot.Empty;

        /// <summary>The lines now with their media counts, as one.</summary>
        public TimelineSnapshot Snapshot => Volatile.Read(ref snapshot);

        private static int[] CountMedia(IEnumerable<TimelineItem> lines)
        {
            var media = new int[4];
            foreach (var line in lines) {
                var kind = MediaKinds.Of(line);
                if (kind != null)
                    media[(int)kind]++;
            }

            return media;
        }

        private readonly CancellationTokenSource stop = new();
        private TaskHandle? handle;
        private TaskHandle? typingHandle;
        private readonly Dictionary<string, SdkTimelineItem> byId = [];

        public event Action<IReadOnlyList<TimelineItem>>? Changed;
        public event Action<IReadOnlyList<string>>? TypingChanged;

        public IReadOnlyList<TimelineItem> Items => Snapshot.Items;

        public string Me => me;

        public async Task Start()
        {
            handle = await timeline.AddListener(new Listener(diffs.Writer));
            typingHandle =
                room.SubscribeToTypingNotifications(new TypingListener(this));
            _ = Pump(stop.Token);
            // The first page of history; more is asked for as the person scrolls up.
            _ = Quietly(() => timeline.PaginateBackwards(30));
        }

        public async Task SetTyping(bool typing)
        {
            try {
                await room.TypingNotice(typing);
            } catch (Exception) {
                // A typing notice that is lost is not worth a message.
            }
        }

        public async Task Send(string text, string? replyToEventId = null,
            IReadOnlyList<string>? mentions = null)
        {
            try {
                var content =
                    MatrixSdkFfiMethods.MessageEventContentFromMarkdown(text);
                // The people named are told, whatever the room's settings: that is what m.mentions is for.
                if (mentions is { Count: > 0 })
                    content = content.WithMentions(
                        new uniffi.matrix_sdk_ffi.Mentions([.. mentions],
                            false));
                if (replyToEventId == null)
                    await timeline.Send(content);
                else
                    await timeline.SendReply(content, replyToEventId);
            } catch (Exception e) when (e is not EngineException) {
                throw MatrixAuthEngine.Translate(e);
            }
        }

        public async Task SendSticker(Sticker picture)
        {
            try {
                // The picture is on the server already: its address is sent, not the picture.
                var info = new uniffi.matrix_sdk_ffi.ImageInfo(
                    Height: (ulong?)picture.Height,
                    Width: (ulong?)picture.Width,
                    Mimetype: picture.MimeType,
                    Size: (ulong?)picture.Size,
                    ThumbnailInfo: null,
                    ThumbnailSource: null,
                    Blurhash: null,
                    IsAnimated: null);
                await timeline.SendSticker(picture.Shortcode, info,
                    uniffi.matrix_sdk_ffi.MediaSource.FromUrl(picture.Url));
            } catch (Exception e) when (e is not EngineException) {
                throw MatrixAuthEngine.Translate(e);
            }
        }

        public async Task SendAttachment(string path, string mimeType,
            int? width, int? height)
        {
            try {
                var size = (ulong)new System.IO.FileInfo(path).Length;
                var upload =
                    new UploadParameters(new UploadSource.File(path), null,
                        null, null, null);
                if (mimeType.StartsWith("image/", StringComparison.Ordinal)) {
                    using var handle = timeline.SendImage(
                        upload,
                        null,
                        new ImageInfo((ulong?)height, (ulong?)width, mimeType,
                            size, null, null, null, null)
                    );
                    await handle.Join();
                } else {
                    using var handle = timeline.SendFile(
                        upload,
                        new uniffi.matrix_sdk_ffi.FileInfo(mimeType, size, null,
                            null)
                    );
                    await handle.Join();
                }
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public async Task SendVoice(string path, string mimeType,
            TimeSpan duration, IReadOnlyList<float> waveform)
        {
            try {
                var size = (ulong)new System.IO.FileInfo(path).Length;
                var upload =
                    new UploadParameters(new UploadSource.File(path), null,
                        null, null, null);
                using var handle = timeline.SendVoiceMessage(upload,
                    new AudioInfo(duration, size, mimeType),
                    [.. waveform]);
                await handle.Join();
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public async Task SetPinned(string itemId, bool pinned)
        {
            if (Event(itemId)?.EventOrTransactionId is not
                EventOrTransactionId.EventId id)
                return;
            try {
                if (pinned)
                    await timeline.PinEvent(id.EventIdValue);
                else
                    await timeline.UnpinEvent(id.EventIdValue);
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public async Task Edit(string itemId, string text)
        {
            var e = Event(itemId);
            if (e == null)
                return;
            try {
                var content =
                    MatrixSdkFfiMethods.MessageEventContentFromMarkdown(text);
                await timeline.Edit(e.EventOrTransactionId,
                    new EditedContent.RoomMessage(content));
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public async Task Delete(string itemId)
        {
            var e = Event(itemId);
            if (e == null)
                return;
            try {
                await timeline.RedactEvent(e.EventOrTransactionId, null);
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public Task Resend(string itemId)
        {
            try {
                // The send queue stops after a failure; enabling it again sends what waits in it.
                room.EnableSendQueue(true);
                return Task.CompletedTask;
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public Task Discard(string itemId)
        {
            return Delete(itemId);
        }

        private EventTimelineItem? Event(string itemId)
        {
            lock (byId) {
                return byId.TryGetValue(itemId, out var item)
                    ? item.AsEvent()
                    : null;
            }
        }

        public async Task ToggleReaction(string itemId, string key)
        {
            SdkTimelineItem? item;
            lock (byId) {
                byId.TryGetValue(itemId, out item);
            }

            var e = item?.AsEvent();
            if (e == null)
                return;
            try {
                await timeline.ToggleReaction(e.EventOrTransactionId, key);
            } catch (Exception ex) when (ex is not EngineException) {
                throw MatrixAuthEngine.Translate(ex);
            }
        }

        public async Task<bool> LoadOlder()
        {
            try {
                // True when the start of the room was reached.
                return !await timeline.PaginateBackwards(30);
            } catch (Exception e) when (e is not EngineException) {
                throw MatrixAuthEngine.Translate(e);
            }
        }

        public Task MarkRead()
        {
            return timeline.MarkAsRead(ReceiptType.Read);
        }

        public void Dispose()
        {
            stop.Cancel();
            handle?.Dispose();
            typingHandle?.Dispose();
            timeline.Dispose();
        }

        private static async Task<bool> Quietly(Func<Task<bool>> run)
        {
            try {
                return await run();
            } catch (Exception e) {
                logger.Unexpected("MatrixChatEngine", e);
                return false;
            }
        }

        private async Task Pump(CancellationToken token)
        {
            try {
                await foreach (var batch in diffs.Reader.ReadAllAsync(token)) {
                    lock (byId) {
                        foreach (var d in batch)
                            Apply(d);
                    }

                    var lines = items.Select(i => i.Line).OfType<TimelineItem>()
                        .ToList();
                    Volatile.Write(ref snapshot,
                        new TimelineSnapshot(lines, CountMedia(lines)));
                    Changed?.Invoke(lines);
                }
            } catch (OperationCanceledException) {
                // Closed.
            }
        }

        // A reply comes without the message it answers until it is asked for:
        // the SDK sends the reply again with the quote filled in. Each one is
        // asked for once.
        private readonly HashSet<string> askedQuotes = [];

        private void AskForQuote(SdkTimelineItem item)
        {
            var e = item.AsEvent();
            if (e == null)
                return;
            if (e.Content is not TimelineItemContent.MsgLike {
                    Content:
                    { Kind: MsgLikeKind.Message m, InReplyTo: { } reply }
                })
                return;
            if (reply.Event() is EmbeddedEventDetails.Ready)
                return;
            if (e.EventOrTransactionId is not EventOrTransactionId.EventId ev)
                return;
            if (!askedQuotes.Add(ev.EventIdValue))
                return;
            _ = Quietly(async () => {
                await timeline.FetchDetailsForEvent(ev.EventIdValue);
                return true;
            });
        }

        private Slot Make(SdkTimelineItem item)
        {
            AskForQuote(item);
            var slot = new Slot(item, item.UniqueId().Id, Convert(item, me));
            byId[slot.Id] = item;
            return slot;
        }

        private void Forget(Slot slot)
        {
            byId.Remove(slot.Id);
        }

        private void RemoveAt(int index)
        {
            Forget(items[index]);
            items.RemoveAt(index);
        }

        // Called with the lock of byId held.
        private void Apply(TimelineDiff d)
        {
            switch (d) {
                case TimelineDiff.Append a:
                    items.AddRange(a.Values.Select(Make));
                    break;
                case TimelineDiff.Clear:
                    ClearAll();
                    break;
                case TimelineDiff.PushFront f:
                    items.Insert(0, Make(f.Value));
                    break;
                case TimelineDiff.PushBack b:
                    items.Add(Make(b.Value));
                    break;
                case TimelineDiff.PopFront:
                    RemoveAt(0);
                    break;
                case TimelineDiff.PopBack:
                    RemoveAt(items.Count - 1);
                    break;
                case TimelineDiff.Insert i:
                    items.Insert((int)i.Index, Make(i.Value));
                    break;
                case TimelineDiff.Set s:
                    Forget(items[(int)s.Index]);
                    items[(int)s.Index] = Make(s.Value);
                    break;
                case TimelineDiff.Remove r:
                    RemoveAt((int)r.Index);
                    break;
                case TimelineDiff.Truncate t:
                    for (var k = items.Count - 1; k >= (int)t.Length; k--)
                        RemoveAt(k);
                    break;
                case TimelineDiff.Reset r:
                    ClearAll();
                    items.AddRange(r.Values.Select(Make));
                    break;
            }
        }

        private void ClearAll()
        {
            items.Clear();
            byId.Clear();
        }

        /// <summary>The line for an item of the SDK; null for what is not shown yet (read markers, kinds not ported).</summary>
        private static TimelineItem? Convert(SdkTimelineItem item, string me)
        {
            var id = item.UniqueId().Id;
            if (item.AsVirtual() is VirtualTimelineItem.DateDivider divider) {
                return new TimelineItem {
                    Id = id,
                    Kind = TimelineKind.Date,
                    Ts = (long)divider.Ts
                };
            }

            var e = item.AsEvent();
            if (e == null)
                return null;
            // Without a display name the person is named by their id's part
            // before the colon, not by the whole id.
            var name = e.SenderProfile is ProfileDetails.Ready {
                DisplayName: { } n
            }
                ? n
                : ServiceText.PersonName(null, e.Sender);
            var avatar = e.SenderProfile is ProfileDetails.Ready {
                AvatarUrl: { } picture
            }
                ? picture
                : null;
            if (e.Content is TimelineItemContent.MsgLike {
                    Content: { Kind: MsgLikeKind.Message m } msg
                }) {
                return new TimelineItem {
                    Id = id,
                    Body = m.Content.MsgType switch {
                        MessageType.Image img => img.Content.Caption ?? "",
                        MessageType.File f => f.Content.Caption ?? "",
                        MessageType.Audio a => a.Content.Caption ?? "",
                        MessageType.Video v => v.Content.Caption ?? "",
                        _ => m.Content.Body,
                    },
                    FormattedBody = m.Content.MsgType is MessageType.Text {
                        Content:
                        { Formatted: { Format: MessageFormat.Html } formatted }
                    }
                        ? formatted.Body
                        : null,
                    File = m.Content.MsgType switch {
                        MessageType.File file => new FileAttachment(
                            file.Content.Filename,
                            (long)(file.Content.Info?.Size ?? 0),
                            file.Content.Source.ToJson(),
                            file.Content.Info?.Mimetype ??
                            "application/octet-stream"
                        ),
                        MessageType.Audio audio => new FileAttachment(
                            audio.Content.Filename,
                            (long)(audio.Content.Info?.Size ?? 0),
                            audio.Content.Source.ToJson(),
                            audio.Content.Info?.Mimetype ?? "audio/mpeg",
                            FileKind.Audio,
                            audio.Content.Info?.Duration
                            ?? audio.Content.Audio?.Duration,
                            audio.Content.Voice != null,
                            // The samples come as 0 to 1024.
                            audio.Content.Audio?.Waveform
                                .Select(w => w / 1024f).ToArray()
                        ),
                        MessageType.Video video => new FileAttachment(
                            video.Content.Filename,
                            (long)(video.Content.Info?.Size ?? 0),
                            video.Content.Source.ToJson(),
                            video.Content.Info?.Mimetype ?? "video/mp4",
                            FileKind.Video,
                            video.Content.Info?.Duration
                        ),
                        _ => null,
                    },
                    Image = m.Content.MsgType is MessageType.Image im
                        ? new ImageAttachment(
                            im.Content.Source.ToJson(),
                            (int?)im.Content.Info?.Width,
                            (int?)im.Content.Info?.Height,
                            im.Content.Filename
                        )
                        : null,
                    SenderId = e.Sender,
                    SenderName = name,
                    SenderAvatar = avatar,
                    // Only my own messages show who has read them.
                    ReadBy = e.IsOwn
                        ? [.. e.ReadReceipts.Keys.Where(u => u != e.Sender)]
                        : [],
                    IsOwn = e.IsOwn,
                    Read = e.IsOwn &&
                           e.ReadReceipts.Keys.Any(u => u != e.Sender),
                    Ts = (long)e.Timestamp,
                    Sending = e.LocalSendState is EventSendState.NotSentYet,
                    Failed = e.LocalSendState is EventSendState.SendingFailed,
                    Edited = m.Content.IsEdited,
                    EventId =
                        e.EventOrTransactionId is EventOrTransactionId.EventId
                            ev
                            ? ev.EventIdValue
                            : null,
                    Reactions = [
                        ..
                        msg.Reactions.Select(r => new ReactionCount(
                            r.Key,
                            r.Senders.Length,
                            r.Senders.Any(x => x.SenderId == me)
                        ))
                    ],
                    Reply = Quote(msg.InReplyTo),
                };
            }

            // Someone joining, leaving or being invited, and the room being made or renamed, are lines of their own.
            var line = ServiceLines.For(e.Content, name);
            if (line != null) {
                return new TimelineItem {
                    Id = id,
                    Kind = TimelineKind.Service,
                    Body = line,
                    Ts = (long)e.Timestamp,
                };
            }

            // A sticker is a picture with no caption. Its shortcode is kept as the
            // file name: that is how the copy shown while it is sent is found.
            if (e.Content is TimelineItemContent.MsgLike {
                    Content.Kind: MsgLikeKind.Sticker st
                }) {
                return new TimelineItem {
                    Id = id,
                    Body = "",
                    SenderId = e.Sender,
                    SenderName = name,
                    SenderAvatar = avatar,
                    ReadBy = e.IsOwn
                        ? [.. e.ReadReceipts.Keys.Where(u => u != e.Sender)]
                        : [],
                    IsOwn = e.IsOwn,
                    Read = e.IsOwn &&
                           e.ReadReceipts.Keys.Any(u => u != e.Sender),
                    Ts = (long)e.Timestamp,
                    Sending = e.LocalSendState is EventSendState.NotSentYet,
                    Failed = e.LocalSendState is EventSendState.SendingFailed,
                    EventId =
                        e.EventOrTransactionId is EventOrTransactionId.EventId
                            ev3
                            ? ev3.EventIdValue
                            : null,
                    Image = new ImageAttachment(
                        st.Source.ToJson(),
                        (int?)st.Info.Width,
                        (int?)st.Info.Height,
                        st.Body,
                        Sticker: true
                    ),
                };
            }

            // A message this device cannot read (its keys have not come): shown as a line, not left out.
            if (e.Content is TimelineItemContent.MsgLike {
                    Content.Kind: MsgLikeKind.UnableToDecrypt
                }) {
                return new TimelineItem {
                    Id = id,
                    Kind = TimelineKind.Service,
                    Body = TimelineItem.Undecryptable,
                    Ts = (long)e.Timestamp,
                    EventId =
                        e.EventOrTransactionId is EventOrTransactionId.EventId
                            ev2
                            ? ev2.EventIdValue
                            : null,
                };
            }

            return null;
        }

        /// <summary>The quote of a reply, when the message it answers is known.</summary>
        private static ReplyQuote? Quote(InReplyToDetails? reply)
        {
            if (reply == null)
                return null;
            if (reply.Event() is not EmbeddedEventDetails.Ready ready)
                return new ReplyQuote("", "…", reply.EventId());
            var name = ready.SenderProfile is ProfileDetails.Ready {
                DisplayName: { } n
            }
                ? n
                : ServiceText.PersonName(null, ready.Sender);
            var text =
                ready.Content is TimelineItemContent.MsgLike {
                    Content.Kind: MsgLikeKind.Message m
                }
                    ? m.Content.Body
                    : "";
            var picture = ready.Content is TimelineItemContent.MsgLike {
                Content.Kind: MsgLikeKind.Message {
                    Content.MsgType: MessageType.Image
                }
            };
            return new ReplyQuote(name, text, reply.EventId(), ready.Sender,
                picture);
        }

        private sealed class TypingListener(Session session)
            : TypingNotificationsListener {
            public void Call(string[] typingUserIds)
            {
                var names = typingUserIds
                    .Where(u => u != session.Me)
                    .Select(u => u.TrimStart('@').Split(':')[0])
                    .ToList();
                session.TypingChanged?.Invoke(names);
            }
        }

        private sealed class Listener(ChannelWriter<TimelineDiff[]> writer)
            : TimelineListener {
            public void OnUpdate(TimelineDiff[] diff)
            {
                writer.TryWrite(diff);
            }
        }
    }
}
#endif
