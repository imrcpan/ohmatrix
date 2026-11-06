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
            var session = new Session(timeline);
            await session.Start();
            return session;
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    /// <summary>One open chat: the SDK's changes are applied to a list of its items, in order, and the lines are made from them.</summary>
    private sealed class Session(Timeline timeline) : IChatSession {
        private readonly Channel<TimelineDiff[]> diffs = Channel.CreateUnbounded<TimelineDiff[]>();
        private readonly List<SdkTimelineItem> items = [];
        private readonly CancellationTokenSource stop = new();
        private TaskHandle? handle;

        public event Action<IReadOnlyList<TimelineItem>>? Changed;

        public IReadOnlyList<TimelineItem> Items { get; private set; } = [];

        public async Task Start()
        {
            handle = await timeline.AddListener(new Listener(diffs.Writer));
            _ = Pump(stop.Token);
            // The first page of history; more is asked for as the person scrolls up.
            _ = Quietly(() => timeline.PaginateBackwards(30));
        }

        public async Task Send(string text)
        {
            try {
                var content = MatrixSdkFfiMethods.MessageEventContentFromMarkdown(text);
                await timeline.Send(content);
            } catch (Exception e) when (e is not EngineException) {
                throw MatrixAuthEngine.Translate(e);
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
                    Items = items.Select(Convert).OfType<TimelineItem>().ToList();
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
                    items.RemoveRange((int)t.Length, items.Count - (int)t.Length);
                    break;
                case TimelineDiff.Reset r:
                    items.Clear();
                    items.AddRange(r.Values);
                    break;
            }
        }

        /// <summary>The line for an item of the SDK; null for what is not shown yet (read markers, kinds not ported).</summary>
        private static TimelineItem? Convert(SdkTimelineItem item)
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
            var name = e.SenderProfile is ProfileDetails.Ready { DisplayName: { } n }
                ? n
                : e.Sender;
            if (e.Content is TimelineItemContent.MsgLike { Content.Kind: MsgLikeKind.Message m }) {
                return new TimelineItem {
                    Id = id,
                    Body = m.Content.Body,
                    SenderId = e.Sender,
                    SenderName = name,
                    IsOwn = e.IsOwn,
                    Ts = (long)e.Timestamp,
                    Sending = e.LocalSendState is EventSendState.NotSentYet,
                    Failed = e.LocalSendState is EventSendState.SendingFailed,
                    Edited = m.Content.IsEdited,
                };
            }

            return null;
        }

        private sealed class Listener(ChannelWriter<TimelineDiff[]> writer) : TimelineListener {
            public void OnUpdate(TimelineDiff[] diff)
            {
                writer.TryWrite(diff);
            }
        }
    }
}
#endif
