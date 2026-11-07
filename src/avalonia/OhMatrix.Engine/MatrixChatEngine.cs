#if OHMATRIX_NATIVE_SDK
using System.Threading.Channels;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;
using TimelineItem = OhMatrix.Core.Model.TimelineItem;
using SdkTimelineItem = uniffi.matrix_sdk_ffi.TimelineItem;

namespace OhMatrix.Engine;

/// <summary>Opens chats over the Matrix SDK (<c>timeline</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixChatEngine(MatrixAuthEngine auth) : IChatEngine {
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
            var timeline = await room.Timeline();
            var session = new Session(timeline, room, client.UserId());
            await session.Start();
            return session;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private sealed class Gallery(IChatSession session) {
        public IChatSession Session { get; } = session;
        public bool AtStart { get; set; }
    }

    private readonly Dictionary<string, Gallery> galleries = [];

    public async Task<SharedMediaPage> SharedMedia(string roomId,
        MediaKind kind, int offset, int want)
    {
        Gallery? gallery;
        lock (galleries)
            galleries.TryGetValue(roomId, out gallery);
        if (gallery is null) {
            gallery = new Gallery(await Open(roomId));
            lock (galleries)
                galleries[roomId] = gallery;
            // The first page of history comes with opening; let it arrive.
            for (var i = 0; i < 20 && gallery.Session.Items.Count == 0; i++)
                await Task.Delay(100);
        }

        List<TimelineItem> Found() => [
            .. gallery.Session.Items.Where(i => MediaKinds.Of(i) == kind)
                .Reverse()
        ];

        // Ask the room for more until it has what the page needs (and one more, to know whether there is a next page).
        for (var n = 0;
             Found().Count <= offset + want && !gallery.AtStart && n < 40;
             n++) {
            gallery.AtStart = await gallery.Session.LoadOlder();
            await Task.Delay(100);
        }

        var all = Found();
        var more = all.Count > offset + want || !gallery.AtStart;
        return new SharedMediaPage([.. all.Skip(offset).Take(want)],
            more ? offset + want : null);
    }

    /// <summary>One open chat: the SDK's changes are applied to a list of its items, in order, and the lines are made from them.</summary>
    private sealed class Session(Timeline timeline, Room room, string me)
        : IChatSession {
        private readonly Channel<TimelineDiff[]> diffs =
            Channel.CreateUnbounded<TimelineDiff[]>();

        private readonly List<SdkTimelineItem> items = [];
        private readonly CancellationTokenSource stop = new();
        private TaskHandle? handle;
        private TaskHandle? typingHandle;
        private readonly Dictionary<string, SdkTimelineItem> byId = [];

        public event Action<IReadOnlyList<TimelineItem>>? Changed;
        public event Action<IReadOnlyList<string>>? TypingChanged;

        public IReadOnlyList<TimelineItem> Items { get; private set; } = [];

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
                if (replyToEventId is null)
                    await timeline.Send(content);
                else
                    await timeline.SendReply(content, replyToEventId);
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
            if (e is null)
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
            if (e is null)
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

            if (item?.AsEvent() is not { } e)
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
            } catch (Exception) {
                return false;
            }
        }

        private async Task Pump(CancellationToken token)
        {
            try {
                await foreach (var batch in diffs.Reader.ReadAllAsync(token)) {
                    foreach (var d in batch)
                        Apply(d);
                    lock (byId) {
                        byId.Clear();
                        foreach (var i in items)
                            byId[i.UniqueId().Id] = i;
                    }

                    Items = items.Select(i => Convert(i, me))
                        .OfType<TimelineItem>().ToList();
                    Changed?.Invoke(Items);
                }
            } catch (OperationCanceledException) {
                // Closed.
            }
        }

        private void Apply(TimelineDiff d)
        {
            switch (d) {
                case TimelineDiff.Append a:
                    items.AddRange(a.Values);
                    break;
                case TimelineDiff.Clear:
                    items.Clear();
                    break;
                case TimelineDiff.PushFront f:
                    items.Insert(0, f.Value);
                    break;
                case TimelineDiff.PushBack b:
                    items.Add(b.Value);
                    break;
                case TimelineDiff.PopFront:
                    items.RemoveAt(0);
                    break;
                case TimelineDiff.PopBack:
                    items.RemoveAt(items.Count - 1);
                    break;
                case TimelineDiff.Insert i:
                    items.Insert((int)i.Index, i.Value);
                    break;
                case TimelineDiff.Set s:
                    items[(int)s.Index] = s.Value;
                    break;
                case TimelineDiff.Remove r:
                    items.RemoveAt((int)r.Index);
                    break;
                case TimelineDiff.Truncate t:
                    items.RemoveRange((int)t.Length,
                        items.Count - (int)t.Length);
                    break;
                case TimelineDiff.Reset r:
                    items.Clear();
                    items.AddRange(r.Values);
                    break;
            }
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

            if (item.AsEvent() is not { } e)
                return null;
            var name = e.SenderProfile is ProfileDetails.Ready {
                DisplayName: { } n
            }
                ? n
                : e.Sender;
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
                    ReadBy = [
                        .. e.ReadReceipts.Keys.Where(u => u != e.Sender)
                    ],
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
            if (ServiceLines.For(e.Content, name) is { } line) {
                return new TimelineItem {
                    Id = id,
                    Kind = TimelineKind.Service,
                    Body = line,
                    Ts = (long)e.Timestamp,
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
            if (reply is null)
                return null;
            if (reply.Event() is not EmbeddedEventDetails.Ready ready)
                return new ReplyQuote("", "…", reply.EventId());
            var name = ready.SenderProfile is ProfileDetails.Ready {
                DisplayName: { } n
            }
                ? n
                : ready.Sender;
            var text =
                ready.Content is TimelineItemContent.MsgLike {
                    Content.Kind: MsgLikeKind.Message m
                }
                    ? m.Content.Body
                    : "";
            return new ReplyQuote(name, text, reply.EventId());
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
