using System.Collections.ObjectModel;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Templates;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

public sealed partial class ChatPane {
    private sealed class MessageEntry(TimelineItem item) {
        public TimelineItem Item = item;
        public int Index;
        public bool Above;
        public bool Below;
        public MessageView? View;
        public Control? Container;
    }

    private sealed class MessageView {
        public readonly Border Root = new();
        public Border? Frame;
        public StackPanel? Column;
        public Bubble? Bubble;
        public Control? Reactions;
        public Border? SelectionMark;
        public TimelineItem? Shown;
        public bool Above;
        public bool Below;
        public int Presentation = -1;
        public bool Selecting;
        public bool Chosen;
    }

    private readonly ObservableCollection<MessageEntry> messageEntries = [];
    private readonly Dictionary<string, MessageEntry> messagesById = [];
    private readonly Dictionary<Control, MessageEntry> containers = [];
    private readonly HashSet<MessageEntry> realizedMessages = [];
    private readonly Dictionary<string, string> memberNames = [];
    private IReadOnlyList<RoomMemberInfo>? indexedMembers;
    private ColorTokens? messageColors;
    private FontFamily? messageFont;
    private string? messageLocale;
    private bool messageAccent;
    private bool messageGroup;
    private DateTime messageDay;
    private int presentationVersion;
    private int roomVersion;
    private int scrollVersion;
    private bool updatingMessages;
    private bool messagesDirty;
    private bool adjustingScroll;
    private bool historyStart;
    private bool scrollInputPending;
    private int scrollInputVersion;
    private double bubbleWidth;

    private sealed record ScrollAnchor(string Id, double Y);

    static ChatPane()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ChatPane>((pane, _) =>
            pane.Apply());
    }

    private void InitializeMessages()
    {
        scroller.AddHandler(PointerWheelChangedEvent, (_, _) => ScrollInput(),
            Avalonia.Interactivity.RoutingStrategies.Tunnel);
        scroller.AddHandler(PointerPressedEvent, (_, _) => ScrollInput(),
            Avalonia.Interactivity.RoutingStrategies.Tunnel);
        scroller.AddHandler(PointerMovedEvent, (_, e) => {
            if (e.GetCurrentPoint(scroller).Properties.IsLeftButtonPressed)
                ScrollInput();
        }, Avalonia.Interactivity.RoutingStrategies.Tunnel);
        scroller.AddHandler(KeyDownEvent, (_, _) => ScrollInput(),
            Avalonia.Interactivity.RoutingStrategies.Tunnel);
        list.ItemsPanel = new FuncTemplate<Panel?>(() =>
            new VirtualizingStackPanel {
                CacheLength = 0.5
            });
        list.ItemTemplate = new FuncDataTemplate<MessageEntry>((entry, _) =>
                entry is null ? null : RealizeMessage(entry),
            supportsRecycling: false);
        list.ItemsSource = messageEntries;
        list.ContainerPrepared += (_, e) => {
            if (e.Index >= 0 && e.Index < messageEntries.Count) {
                var entry = messageEntries[e.Index];
                entry.Container = e.Container;
                containers[e.Container] = entry;
            }
        };
        list.ContainerClearing += (_, e) => {
            if (!containers.Remove(e.Container, out var entry) ||
                !ReferenceEquals(entry.Container, e.Container))
                return;
            if (entry.View?.Frame is { } frame &&
                rowsById.TryGetValue(entry.Item.Id, out var current) &&
                ReferenceEquals(frame, current))
                rowsById.Remove(entry.Item.Id);
            realizedMessages.Remove(entry);
            entry.Container = null;
            entry.View = null;
        };
    }

    // Whether the open room is a group. The room is looked for again when
    // the snapshot of the rooms or the open room changes (its summary can
    // arrive after it is selected, and IsDirect can change); a room that is
    // not there yet is not remembered.
    private IReadOnlyList<RoomSummary>? groupRooms;
    private string? groupRoomId;
    private bool cachedIsGroup;

    private bool IsGroup(AppState state)
    {
        if (ReferenceEquals(groupRooms, state.Rooms) &&
            groupRoomId == state.SelectedRoomId)
            return cachedIsGroup;
        var room = state.Rooms.FirstOrDefault(r =>
            r.Id == state.SelectedRoomId);
        cachedIsGroup = room is { IsDirect: false };
        if (room is null) {
            groupRooms = null;
            groupRoomId = null;
        } else {
            groupRooms = state.Rooms;
            groupRoomId = state.SelectedRoomId;
        }

        return cachedIsGroup;
    }

    private bool MessagePresentationChanged(AppState state, ColorTokens colors)
    {
        return shownRoom != state.SelectedRoomId || messageColors != colors ||
               messageLocale != state.Locale ||
               !Equals(messageFont, Fonts.System) ||
               messageAccent != state.Prefs.OwnBubbleAccent ||
               messageGroup != IsGroup(state) ||
               !ReferenceEquals(indexedMembers, state.Details?.Members) ||
               messageDay != time.GetUtcNow().LocalDateTime.Date;
    }

    // A request that comes while a refresh runs (the store is changed from
    // inside it) only marks it; the refresh is run again, from the newest
    // state, when the one in progress is over.
    private void RefreshMessages()
    {
        if (updatingMessages) {
            messagesDirty = true;
            return;
        }

        do {
            messagesDirty = false;
            RefreshMessagesOnce();
        } while (messagesDirty);
    }

    private void RefreshMessagesOnce()
    {
        updatingMessages = true;
        try {
            var state = controller.Store.Value;
            var colors = ThemeScope.GetColors(this);
            var roomChanged = shownRoom != state.SelectedRoomId;
            var changed = !ReferenceEquals(shownItems, state.Timeline);
            var anchor = !roomChanged && !stickToBottom
                ? CaptureAnchor()
                : null;
            var presentation = MessagePresentationChanged(state, colors);
            if (roomChanged) {
                roomVersion++;
                ClearRevealNotice();
                scrollVersion++;
                lastSeenId = null;
                highlightId = null;
                newWhileAway = 0;
                stickToBottom = true;
                loadingOlder = false;
                historyStart = false;
                olderTimer?.Dispose();
                ShowOlder(false);
                messagesById.Clear();
                rowsById.Clear();
                messageEntries.Clear();
                containers.Clear();
                realizedMessages.Clear();
            }

            if (roomChanged ||
                !ReferenceEquals(indexedMembers, state.Details?.Members)) {
                indexedMembers = state.Details?.Members;
                memberNames.Clear();
                if (indexedMembers is not null) {
                    foreach (var member in indexedMembers)
                        memberNames.TryAdd(member.UserId, member.Name);
                }
            }

            shownRoom = state.SelectedRoomId;
            shownItems = state.Timeline;
            messageColors = colors;
            messageLocale = state.Locale;
            messageFont = Fonts.System;
            messageAccent = state.Prefs.OwnBubbleAccent;
            messageGroup = IsGroup(state);
            messageDay = time.GetUtcNow().LocalDateTime.Date;
            bubbleWidth = MessageWidth();
            if (presentation)
                presentationVersion++;

            if (changed || roomChanged)
                ReconcileMessages(state.Timeline);
            foreach (var entry in realizedMessages.ToArray())
                UpdateMessage(entry);
            BuildHeader(colors, state);
            if (changed || roomChanged) {
                var last = state.Timeline.LastOrDefault();
                if (lastSeenId is not null && last is not null &&
                    last.Id != lastSeenId && !last.IsOwn && !stickToBottom)
                    newWhileAway++;
                lastSeenId = last?.Id;
            }

            ShowLatest();
            if (state.JumpToEventId is { } target && state.TimelineReady) {
                controller.Store.Update(s => s with {
                    JumpToEventId = null
                });
                stickToBottom = false;
                _ = Reveal(target);
            } else if (searching && (changed || roomChanged || presentation)) {
                Search();
            } else if (stickToBottom) {
                ScrollToEnd();
            } else if (anchor is not null) {
                RestoreAnchor(anchor);
            }
        } finally {
            updatingMessages = false;
        }
    }

    private void ReconcileMessages(IReadOnlyList<TimelineItem> items)
    {
        var wanted = new List<MessageEntry>(items.Count);
        var ids = new HashSet<string>();
        for (var i = 0; i < items.Count; i++) {
            var item = items[i];
            if (item.Kind == TimelineKind.Date &&
                (i + 1 == items.Count ||
                 items[i + 1].Kind == TimelineKind.Date))
                continue;
            ids.Add(item.Id);
            if (!messagesById.TryGetValue(item.Id, out var entry)) {
                entry = new MessageEntry(item);
                messagesById.Add(item.Id, entry);
            }

            entry.Item = item;
            entry.Index = wanted.Count;
            entry.Above = i > 0 && SameRun(items[i - 1], item);
            entry.Below = i + 1 < items.Count && SameRun(item, items[i + 1]);
            wanted.Add(entry);
        }

        for (var i = messageEntries.Count - 1; i >= 0; i--) {
            if (!ids.Contains(messageEntries[i].Item.Id)) {
                realizedMessages.Remove(messageEntries[i]);
                messagesById.Remove(messageEntries[i].Item.Id);
                rowsById.Remove(messageEntries[i].Item.Id);
                messageEntries.RemoveAt(i);
            }
        }

        var present = messageEntries.ToHashSet();
        var positions = new Dictionary<MessageEntry, int>();
        for (var i = 0; i < messageEntries.Count; i++)
            positions[messageEntries[i]] = i;
        for (var i = 0; i < wanted.Count; i++) {
            if (i < messageEntries.Count && messageEntries[i] == wanted[i])
                continue;
            if (present.Contains(wanted[i])) {
                var from = positions[wanted[i]];
                messageEntries.Move(from, i);
                for (var j = Math.Min(from, i); j <= Math.Max(from, i); j++)
                    positions[messageEntries[j]] = j;
            } else {
                messageEntries.Insert(i, wanted[i]);
                for (var j = i; j < messageEntries.Count; j++)
                    positions[messageEntries[j]] = j;
            }
        }
    }

    private Control RealizeMessage(MessageEntry entry)
    {
        if (entry.View is null) {
            entry.View = new MessageView();
            realizedMessages.Add(entry);
            entry.View.Root.PointerPressed += (_, e) => {
                if (!Selecting || entry.Item.Kind != TimelineKind.Message)
                    return;
                e.Handled = true;
                ToggleChosen(entry.Item.Id);
            };
        }

        UpdateMessage(entry);
        return entry.View.Root;
    }

    private void UpdateMessage(MessageEntry entry)
    {
        var view = entry.View!;
        var item = entry.Item;
        var old = view.Shown;
        var colors = messageColors;
        var presentation = view.Presentation != presentationVersion;
        if (old is null || old.Kind != item.Kind) {
            rowsById.Remove(item.Id);
            view.Root.Child = null;
            view.Bubble = null;
            view.Reactions = null;
            view.Column = null;
            view.SelectionMark = null;
            if (item.Kind == TimelineKind.Message) {
                view.Column = new StackPanel();
                view.Frame = new Border {
                    Child = view.Column,
                    CornerRadius = new CornerRadius(Radius.Bubble + 2),
                    BorderThickness = new Thickness(2),
                    BorderBrush = Brushes.Transparent,
                };
                view.SelectionMark = (Border)SelectMark(colors, false);
                var grid = new Grid {
                    ColumnDefinitions = new ColumnDefinitions("Auto,*")
                };
                Grid.SetColumn(view.Frame, 1);
                grid.Children.Add(view.SelectionMark);
                grid.Children.Add(view.Frame);
                view.Root.Child = grid;
            } else {
                view.Frame = (Border)DateChip(colors, "");
                view.Root.Child = view.Frame;
            }
        }

        if (item.Kind != TimelineKind.Message) {
            if (old is null || old.Kind != item.Kind || old.Body != item.Body ||
                old.Ts != item.Ts || presentation) {
                var text = (TextBlock)view.Frame!.Child!;
                text.Text = item.Kind == TimelineKind.Date
                    ? Format.DayLabel(item.Ts, time.GetUtcNow(), messageLocale!,
                        key => T(key))
                    : item.Body == TimelineItem.Undecryptable
                        ? T("undecryptable")
                        : item.Body;
                text.Foreground = new SolidColorBrush(colors.ServiceChipText);
                text.FontFamily = Fonts.System;
                view.Frame.Background = new SolidColorBrush(colors.ServiceChip);
            }

            view.Root.Background = Brushes.Transparent;
            view.Root.Cursor = null;
            view.Shown = item;
            view.Presentation = presentationVersion;
            return;
        }

        var contentChanged = old is null || !SameContent(old, item);
        var appearance = contentChanged || presentation || old is null ||
                         !SameMetadata(old, item) ||
                         view.Above != entry.Above ||
                         view.Below != entry.Below;
        var reactionsChanged = old is null || old.Kind != item.Kind ||
                               presentation || old.IsOwn != item.IsOwn ||
                               !old.Reactions.SequenceEqual(item.Reactions);
        if (!appearance && !reactionsChanged && view.Selecting == Selecting &&
            view.Chosen == chosen.Contains(item.Id)) {
            view.Shown = item;
            return;
        }

        if (view.Bubble is null || contentChanged) {
            var bubble = MakeBubble(entry, colors);
            if (view.Bubble is null)
                view.Column!.Children.Insert(0, bubble);
            else
                view.Column!.Children[0] = bubble;
            view.Bubble = bubble;
        } else if (appearance) {
            view.Bubble.UpdatePresentation(colors,
                Format.Clock(item.Ts, messageLocale!), item.IsOwn,
                messageGroup ? item.SenderName : null, item.SenderId,
                entry.Above, entry.Below, item.Sending, item.Failed,
                item.Edited ? T("edited") : null, messageAccent,
                item.Read, ReadLabel(item));
        }

        var column = view.Column!;
        column.MaxWidth = bubbleWidth;
        column.HorizontalAlignment = item.IsOwn
            ? HorizontalAlignment.Right
            : HorizontalAlignment.Left;
        column.Margin = new Thickness(0, entry.Above ? 2 : 6, 0, 0);
        view.Frame!.HorizontalAlignment = column.HorizontalAlignment;
        if (reactionsChanged) {
            if (view.Reactions is not null)
                column.Children.Remove(view.Reactions);
            view.Reactions = item.Reactions.Count > 0
                ? Chips(colors, item, messageAccent)
                : null;
            if (view.Reactions is not null)
                column.Children.Add(view.Reactions);
        }

        UpdateSelection(entry, colors);
        rowsById[item.Id] = view.Frame;
        PaintMessage(item.Id, view.Frame, colors);
        view.Shown = item;
        view.Above = entry.Above;
        view.Below = entry.Below;
        view.Presentation = presentationVersion;
    }

    private Bubble MakeBubble(MessageEntry entry, ColorTokens colors)
    {
        var item = entry.Item;
        var bubble = new Bubble(new BubbleParams {
            Colors = colors,
            Text = item.Body,
            Time = Format.Clock(item.Ts, messageLocale!),
            Own = item.IsOwn,
            SenderName = messageGroup ? item.SenderName : null,
            SenderId = item.SenderId,
            StuckAbove = entry.Above,
            StuckBelow = entry.Below,
            Sending = item.Sending,
            Failed = item.Failed,
            EditedLabel = item.Edited ? T("edited") : null,
            Accent = messageAccent,
            Reply = item.Reply,
            Image = item.Image,
            Pictures = controller.Pictures,
            File = item.File,
            OpenImage = image => OpenViewer(entry.Item, image),
            Formatted = item.FormattedBody,
            Read = item.Read,
            ReadLabel = ReadLabel(item),
            OpenFile = OpenFile,
            Preview = controller.LinkPreview,
            Fetch = controller.DownloadFile
        });
        if (bubble.Quote is { } quote) {
            quote.Cursor = new Cursor(StandardCursorType.Hand);
            quote.PointerPressed += (_, e) => {
                if (!e.GetCurrentPoint(quote).Properties.IsLeftButtonPressed ||
                    entry.Item.Reply?.EventId is not { } quoted)
                    return;
                e.Handled = true;
                _ = Reveal(quoted);
            };
        }

        bubble.PointerPressed += (_, e) => {
            if (!e.GetCurrentPoint(bubble).Properties.IsRightButtonPressed)
                return;
            e.Handled = true;
            OpenActions(bubble, entry.Item,
                e.GetPosition(TopLevel.GetTopLevel(bubble)));
        };
        return bubble;
    }

    private string? ReadLabel(TimelineItem item)
    {
        if (!item.IsOwn || !item.Read || item.Sending || item.Failed)
            return null;
        return item.ReadBy.Count > 0
            ? T("readBy", ("names", string.Join(", ",
                item.ReadBy.Select(NameOfUser))))
            : T("read");
    }

    private static bool SameContent(TimelineItem a, TimelineItem b) =>
        a.Kind == b.Kind && a.Body == b.Body &&
        a.FormattedBody == b.FormattedBody && a.Reply == b.Reply &&
        a.Image == b.Image && a.File == b.File;

    private static bool SameMetadata(TimelineItem a, TimelineItem b) =>
        a.Ts == b.Ts && a.IsOwn == b.IsOwn && a.SenderName == b.SenderName &&
        a.SenderId == b.SenderId && a.Sending == b.Sending &&
        a.Failed == b.Failed && a.Edited == b.Edited && a.Read == b.Read &&
        a.ReadBy.SequenceEqual(b.ReadBy);

    private void RefreshSelection()
    {
        var colors = ThemeScope.GetColors(this);
        foreach (var entry in realizedMessages) {
            if (entry.View?.Column is not null)
                UpdateSelection(entry, colors);
        }
    }

    private void UpdateSelection(MessageEntry entry, ColorTokens colors)
    {
        var view = entry.View!;
        var mark = view.SelectionMark!;
        view.Selecting = Selecting;
        view.Chosen = chosen.Contains(entry.Item.Id);
        var selected = Selecting && view.Chosen;
        view.Root.Background = selected
            ? new SolidColorBrush(Color.FromArgb(46, colors.Accent.R,
                colors.Accent.G, colors.Accent.B))
            : Brushes.Transparent;
        view.Root.Cursor = Selecting
            ? new Cursor(StandardCursorType.Hand)
            : null;
        view.Frame!.IsHitTestVisible = !Selecting;
        mark.IsVisible = Selecting;
        mark.BorderBrush = new SolidColorBrush(selected
            ? colors.Accent
            : colors.TextTertiary);
        mark.Background = selected
            ? new SolidColorBrush(colors.Accent)
            : Brushes.Transparent;
        if (selected && mark.Child is null)
            mark.Child = new Icon {
                Glyph = "check",
                Size = 14,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            };
        if (mark.Child is Icon icon) {
            icon.IsVisible = selected;
            icon.Color = new SolidColorBrush(colors.OnAccent);
        }
    }

    // The two rings are brushes of the colours, shared by every line that
    // has one and made again only when the colours are other ones.
    private ColorTokens? ringColors;
    private IBrush? currentRing;
    private IBrush? matchRing;

    private void PaintMessage(string id, Border frame, ColorTokens colors)
    {
        if (!Equals(ringColors, colors)) {
            ringColors = colors;
            currentRing = new SolidColorBrush(colors.Accent);
            matchRing = new SolidColorBrush(colors.MentionHighlight);
        }

        var match = matchAt.GetValueOrDefault(id, -1);
        frame.BorderBrush = id == highlightId || match >= 0 && match == current
            ? currentRing
            : match >= 0
                ? matchRing
                : Brushes.Transparent;
    }

    private double MessageWidth()
    {
        var available = Bounds.Width > 0 ? Bounds.Width : 800;
        return Math.Max(0, Math.Min(560, (available - 24) * 0.8));
    }

    private void ResizeMessages()
    {
        var width = MessageWidth();
        if (Math.Abs(width - bubbleWidth) < 0.1)
            return;
        var anchor = stickToBottom ? null : CaptureAnchor();
        bubbleWidth = width;
        foreach (var entry in realizedMessages) {
            if (entry.View?.Column is { } column)
                column.MaxWidth = width;
        }

        if (adjustingScroll || updatingMessages)
            return;
        if (stickToBottom)
            ScrollToEnd();
        else if (anchor is not null)
            RestoreAnchor(anchor);
    }

    private void ScrollInput()
    {
        scrollVersion++;
        scrollInputPending = true;
        var version = ++scrollInputVersion;
        Dispatcher.UIThread.Post(() => {
            if (version == scrollInputVersion)
                scrollInputPending = false;
        }, DispatcherPriority.Background);
    }

    private ScrollAnchor? CaptureAnchor()
    {
        ScrollAnchor? anchor = null;
        foreach (var (container, entry) in containers) {
            if (!container.IsVisible || container.Bounds.Height <= 0 ||
                container.TranslatePoint(default, scroller) is not { } point ||
                point.Y + container.Bounds.Height <= 0 ||
                point.Y >= scroller.Viewport.Height)
                continue;
            if (anchor is null || point.Y < anchor.Y)
                anchor = new ScrollAnchor(entry.Item.Id, point.Y);
        }

        return anchor;
    }

    private void RestoreAnchor(ScrollAnchor anchor)
    {
        var generation = roomVersion;
        var request = ++scrollVersion;
        Dispatcher.UIThread.Post(() => {
            if (generation != roomVersion || request != scrollVersion ||
                stickToBottom ||
                !messagesById.TryGetValue(anchor.Id, out var entry))
                return;
            adjustingScroll = true;
            try {
                list.ScrollIntoView(entry.Index);
                list.UpdateLayout();
                var container = list.ContainerFromIndex(entry.Index);
                if (container?.TranslatePoint(default, scroller) is { } point)
                    scroller.Offset = new Vector(scroller.Offset.X,
                        Math.Max(0, scroller.Offset.Y + point.Y - anchor.Y));
                list.UpdateLayout();
            } finally {
                adjustingScroll = false;
            }

            ShowLatest();
        }, DispatcherPriority.Background);
    }

    private void ScrollToEnd()
    {
        var generation = roomVersion;
        var request = ++scrollVersion;
        Dispatcher.UIThread.Post(() => {
            if (generation != roomVersion || request != scrollVersion ||
                !stickToBottom || messageEntries.Count == 0)
                return;
            adjustingScroll = true;
            try {
                list.ScrollIntoView(messageEntries.Count - 1);
                list.UpdateLayout();
                scroller.ScrollToEnd();
                list.UpdateLayout();
                newWhileAway = 0;
            } finally {
                adjustingScroll = false;
            }

            ShowLatest();
        }, DispatcherPriority.Background);
    }

    /// <summary>Shows a loaded timeline item by its stable ID.</summary>
    public bool ScrollToMessage(string id)
    {
        if (!messagesById.TryGetValue(id, out var entry))
            return false;
        stickToBottom = false;
        var generation = roomVersion;
        var request = ++scrollVersion;
        list.ScrollIntoView(entry.Index);
        Dispatcher.UIThread.Post(() => {
            if (generation != roomVersion || request != scrollVersion ||
                !messagesById.TryGetValue(id, out var currentEntry))
                return;
            adjustingScroll = true;
            try {
                list.ScrollIntoView(currentEntry.Index);
                list.UpdateLayout();
                currentEntry.View?.Root.BringIntoView();
            } finally {
                adjustingScroll = false;
            }

            ShowLatest();
        }, DispatcherPriority.Background);
        return true;
    }
}
