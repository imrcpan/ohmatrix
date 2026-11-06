using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Platform.Storage;
using Avalonia.Threading;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The open chat (<c>ChatPane</c>): the bar with the picture, name and member count (and Back when the list is not beside it), the messages with
/// their date dividers, and the input to write in. The view stays at the bottom while new messages come, unless the person has scrolled up.
/// </summary>
public sealed class ChatPane : Grid {
    public const double HeaderHeight = 64;

    private readonly AppController controller;
    private readonly TimeProvider time;
    private readonly Action? onBack;

    private readonly Border header = new() {
        Height = HeaderHeight,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    private readonly StackPanel list = new() {
        Margin = new Thickness(12, 8)
    };

    private readonly ScrollViewer scroller = new() {
        HorizontalScrollBarVisibility = Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
    };

    private readonly Border composer = new();

    private readonly Menu actions = new() {
        Width = 180
    };

    private readonly IconButton attach = new("attach", "Attach", 24, 38);

    private readonly Menu attachMenu = new() {
        Up = true,
        Width = 200,
    };

    private readonly Grid body = new() {
        RowDefinitions = new RowDefinitions("Auto,Auto,*")
    };

    private readonly Border pinnedBar = new() {
        BorderThickness = new Thickness(0, 0, 0, 1),
        Padding = new Thickness(12, 8),
        IsVisible = false,
    };

    private int pinnedAt;
    private Icon glass = new();

    private readonly Border searchBar = new() {
        Height = 52,
        BorderThickness = new Thickness(0, 0, 0, 1),
        Padding = new Thickness(12, 8),
    };

    private readonly TextBox searchInput = new() {
        FontSize = 16,
        FontFamily = Fonts.System,
        BorderThickness = new Thickness(0),
        Padding = new Thickness(0),
        Background = Brushes.Transparent,
        VerticalAlignment = VerticalAlignment.Center,
        VerticalContentAlignment = VerticalAlignment.Center,
        MinHeight = 0,
    };

    private readonly TextBlock searchCount = new() {
        FontSize = 14,
        FontFamily = Fonts.System,
        VerticalAlignment = VerticalAlignment.Center,
        Margin = new Thickness(8, 0),
    };

    private readonly Dictionary<string, Border> rowsById = [];
    private List<string> matches = [];
    private int current;
    private bool searching;
    private readonly Dialog deleteDialog = new();
    private readonly ImageViewer viewer = new();
    private string? editingId;
    private readonly StackPanel composerStack = new();
    private readonly Border replyHost = new();

    private readonly TextBox input = new() {
        AcceptsReturn = true,
        TextWrapping = TextWrapping.Wrap,
        FontSize = 16,
        FontFamily = Fonts.System,
        BorderThickness = new Thickness(0),
        Padding = new Thickness(0),
        Background = Brushes.Transparent,
        MaxHeight = 160,
        VerticalAlignment = VerticalAlignment.Center,
        MinHeight = 0,
    };

    private readonly Border inputBox = new() {
        MinHeight = 38,
        CornerRadius = new CornerRadius(19),
        Padding = new Thickness(14, 8),
    };

    private readonly Border send = new() {
        Width = 38,
        Height = 38,
        CornerRadius = new CornerRadius(19),
        Cursor = new Cursor(StandardCursorType.Hand),
        VerticalAlignment = VerticalAlignment.Bottom,
    };

    private readonly Icon sendIcon = new() {
        Glyph = "send",
        Size = 20,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private IReadOnlyList<TimelineItem>? shownItems;
    private string? shownRoom;
    private bool stickToBottom = true;
    private bool loadingOlder;

    public ChatPane(AppController controller, Action? onBack = null, TimeProvider? time = null)
    {
        this.controller = controller;
        this.onBack = onBack;
        this.time = time ?? TimeProvider.System;
        RowDefinitions = new RowDefinitions("Auto,*,Auto");
        scroller.Content = list;
        Grid.SetRow(body, 1);
        Grid.SetRow(composer, 2);
        Children.Add(header);
        Grid.SetRow(scroller, 2);
        Grid.SetRow(searchBar, 1);
        body.Children.Add(scroller);
        searchBar.IsVisible = false;
        pinnedBar.PointerPressed += (_, e) => {
            e.Handled = true;
            JumpToPinned();
        };
        body.Children.Add(pinnedBar);
        body.Children.Add(searchBar);
        Children.Add(body);
        Children.Add(composer);

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(10, 8)
        };
        inputBox.Child = input;
        Grid.SetColumn(inputBox, 1);
        attach.VerticalAlignment = VerticalAlignment.Bottom;
        attach.Margin = new Thickness(0, 0, 10, 0);
        attach.Click += (_, _) => OpenAttach();
        bar.Children.Add(attach);
        Grid.SetColumn(send, 2);
        send.Margin = new Thickness(10, 0, 0, 0);
        send.Child = sendIcon;
        bar.Children.Add(inputBox);
        bar.Children.Add(send);
        composerStack.Children.Add(replyHost);
        composerStack.Children.Add(bar);
        composer.Child = composerStack;

        BuildSearchBar();
        send.PointerPressed += (_, e) => {
            e.Handled = true;
            Submit();
        };
        input.KeyDown += (_, e) => {
            if (e.Key == Key.Enter && !e.KeyModifiers.HasFlag(KeyModifiers.Shift)) {
                e.Handled = true;
                Submit();
            }
        };
        input.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty)
                Apply();
        };
        scroller.ScrollChanged += (_, _) => OnScroll();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<ChatPane>((p, _) => p.Rebuild());
        SizeChanged += (_, _) => Rebuild();
        Apply();
    }

    public StackPanel Messages => list;
    public TextBox Input => input;
    public Border Header => header;

    /// <summary>Sends what is in the input.</summary>
    public void Submit()
    {
        var text = input.Text ?? "";
        if (text.Trim().Length == 0)
            return;
        input.Text = "";
        stickToBottom = true;
        _ = controller.Send(text);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    private void OnScroll()
    {
        var atBottom = scroller.Offset.Y >= scroller.Extent.Height - scroller.Viewport.Height - 40;
        stickToBottom = atBottom;
        // Near the top: older messages are asked for.
        if (scroller.Offset.Y < 80 && !loadingOlder &&
            scroller.Extent.Height > scroller.Viewport.Height) {
            loadingOlder = true;
            var before = scroller.Extent.Height;
            _ = controller.LoadOlder().ContinueWith(_ => Dispatcher.UIThread.Post(() => {
                loadingOlder = false;
                // Keep what was being read where it was while the older lines are put above it.
                scroller.Offset =
                    new Vector(0, scroller.Offset.Y + scroller.Extent.Height - before);
            }));
        }
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.ChatBg);
        composer.Background = new SolidColorBrush(c.Bg);
        inputBox.Background = new SolidColorBrush(c.BgSecondary);
        input.Foreground = new SolidColorBrush(c.Text);
        input.CaretBrush = new SolidColorBrush(c.Text);
        input.SelectionBrush = new SolidColorBrush(c.Accent, 0.4);
        input.PlaceholderText = T("message");
        input.Resources["TextControlPlaceholderForeground"] = new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        input.Resources["TextControlBackgroundPointerOver"] = Brushes.Transparent;
        input.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        input.Resources["TextControlBorderBrushPointerOver"] = Brushes.Transparent;
        var ready = (input.Text ?? "").Trim().Length > 0;
        send.Background = new SolidColorBrush(ready ? c.Accent : c.Separator);
        sendIcon.Color = new SolidColorBrush(ready ? c.OnAccent : c.TextSecondary);
        Avalonia.Automation.AutomationProperties.SetName(send, T("send.files.send"));
        Avalonia.Automation.AutomationProperties.SetName(attach, T("attach.label"));

        var s = controller.Store.Value;
        BuildPinnedBar(c, s);
        replyHost.Child = ReplyBanner(c, s);
        // Starting to edit puts the text of the message in the field, once.
        if (s.Editing?.Id != editingId) {
            editingId = s.Editing?.Id;
            if (s.Editing is { } e)
                input.Text = e.Body;
        }

        if (!ReferenceEquals(shownItems, s.Timeline) || shownRoom != s.SelectedRoomId) {
            shownRoom = s.SelectedRoomId;
            Rebuild();
        } else
            BuildHeader(c, s);
    }

    /// <summary>Who is typing, in words (<c>typingLabel</c>).</summary>
    public string TypingLabel(IReadOnlyList<string> names, bool direct)
    {
        if (names.Count == 0)
            return "";
        if (direct)
            return T("typing.short");
        return names.Count switch {
            1 => T("typing.one", ("a", names[0])),
            2 => T("typing.two", ("a", names[0]), ("b", names[1])),
            _ => T("typing.many", ("a", names[0]), ("n", names.Count - 1)),
        };
    }

    private void BuildHeader(ColorTokens c, AppState s)
    {
        header.Background = new SolidColorBrush(c.Bg);
        header.BorderBrush = new SolidColorBrush(c.Separator);
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 10,
            Margin = new Thickness(onBack is null ? 20 : 8, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        if (onBack is not null) {
            var back = new IconButton("back", T("back"), 26);
            back.Click += (_, _) => onBack();
            row.Children.Add(back);
        }

        if (room is not null) {
            var avatar = new Avatar(room.Id, room.Name, 38, room.IsSpace);
            controller.Pictures.Attach(avatar, room.AvatarUrl, 38);
            row.Children.Add(avatar);
            var words = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center
            };
            words.Children.Add(new TextBlock {
                Text = room.Name,
                FontSize = 17,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
            var typing = s.Typing;
            words.Children.Add(new TextBlock {
                Text = typing.Count > 0 ? TypingLabel(typing, room.IsDirect)
                    : room.IsDirect ? T("directChat")
                    : room.MemberCount == 1 ? T("member.one")
                    : T("members", ("n", room.MemberCount)),
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(typing.Count > 0 ? c.Accent : c.TextSecondary),
            });
            row.Children.Add(words);
        }

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto")
        };
        bar.Children.Add(row);
        var find = new IconButton("search", T("search.inChat"), 22) {
            Tint = searching ? c.Accent : c.TextSecondary
        };
        find.Click += (_, _) => ToggleSearch();
        Grid.SetColumn(find, 1);
        bar.Children.Add(find);
        var info = new IconButton("info", T("chatInfo"), 24) {
            Margin = new Thickness(0, 0, 12, 0),
            Tint = s.RoomInfoOpen ? c.Accent : null,
        };
        info.Click += (_, _) => controller.OpenRoomInfo(!controller.Store.Value.RoomInfoOpen);
        Grid.SetColumn(info, 2);
        bar.Children.Add(info);
        header.Child = bar;
    }

    private void Rebuild()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        shownItems = s.Timeline;
        BuildHeader(c, s);
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        var group = room is not null && !room.IsDirect;
        var width = Bounds.Width > 0 ? Bounds.Width : 800;
        var maxBubble = Math.Min(560, (width - 24) * 0.8);
        var now = time.GetUtcNow();
        list.Children.Clear();
        rowsById.Clear();
        var items = s.Timeline;
        for (var i = 0; i < items.Count; i++) {
            var item = items[i];
            if (item.Kind == TimelineKind.Date) {
                // A day with nothing to show under it (only room events that are not drawn) gets no divider.
                if (i + 1 >= items.Count || items[i + 1].Kind == TimelineKind.Date)
                    continue;
                list.Children.Add(DateChip(c, Format.DayLabel(item.Ts, now, s.Locale, k => T(k))));
                continue;
            }

            if (item.Kind == TimelineKind.Service) {
                list.Children.Add(DateChip(c,
                    item.Body == TimelineItem.Undecryptable ? T("undecryptable") : item.Body));
                continue;
            }

            var above = i > 0 && SameRun(items[i - 1], item);
            var below = i + 1 < items.Count && SameRun(item, items[i + 1]);
            var bubble = new Bubble(
                c,
                item.Body,
                Format.Clock(item.Ts, s.Locale),
                item.IsOwn,
                group ? item.SenderName : null,
                item.SenderId,
                above,
                below,
                item.Sending,
                item.Failed,
                item.Edited ? T("edited") : null,
                s.Prefs.OwnBubbleAccent,
                item.Reply,
                item.Image,
                controller.Pictures,
                item.File,
                img => OpenViewer(item, img),
                item.FormattedBody,
                null,
                item.Read,
                T("read"),
                OpenFile,
                controller.LinkPreview
            );
            bubble.PointerPressed += (_, e) => {
                if (e.GetCurrentPoint(bubble).Properties.IsRightButtonPressed) {
                    e.Handled = true;
                    OpenActions(bubble, item);
                }
            };
            var column = new StackPanel {
                MaxWidth = maxBubble,
                HorizontalAlignment =
                    item.IsOwn ? HorizontalAlignment.Right : HorizontalAlignment.Left,
                Margin = new Thickness(0, above ? 2 : 6, 0, 0),
            };
            column.Children.Add(bubble);
            if (item.Reactions.Count > 0)
                column.Children.Add(Chips(c, item, s.Prefs.OwnBubbleAccent));
            var frame = new Border {
                Child = column,
                CornerRadius = new CornerRadius(Radius.Bubble + 2),
                BorderThickness = new Thickness(2),
                BorderBrush = Brushes.Transparent,
                HorizontalAlignment =
                    item.IsOwn ? HorizontalAlignment.Right : HorizontalAlignment.Left,
            };
            list.Children.Add(frame);
            rowsById[item.Id] = frame;
        }

        if (searching)
            Search();
        else if (stickToBottom)
            Dispatcher.UIThread.Post(() => scroller.ScrollToEnd(), DispatcherPriority.Background);
    }

    /// <summary>The menu of a message: answer it, or react to it.</summary>
    public void OpenActions(Control anchor, TimelineItem item)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = new List<MenuItem> {
            new(T("reply"), () => controller.SetReplyTo(item), Icon: "reply"),
        };
        if (item.EventId is { } eventId) {
            var pinned = PinnedIds().Contains(eventId);
            items.Add(new MenuItem(T(pinned ? "unpin" : "pin"),
                () => _ = controller.SetMessagePinned(item.Id, !pinned), Icon: "pin"));
        }

        if (item.IsOwn && item.EventId is not null && !item.Failed) {
            items.Add(new MenuItem(T("edit"), () => controller.StartEdit(item), Icon: "edit"));
            items.Add(new MenuItem(T("delete"), () => AskDelete(window, item), Icon: "trash",
                Danger: true));
        }

        foreach (var emoji in QuickReactions) {
            var mine = item.Reactions.Any(r => r.Key == emoji && r.Mine);
            items.Add(new MenuItem(emoji, () => _ = controller.ToggleReaction(item.Id, emoji),
                Checked: mine));
        }

        actions.Show(anchor, window, items);
    }

    public Menu Actions => actions;
    public Border PinnedBar => pinnedBar;

    private IReadOnlyList<string> PinnedIds()
    {
        var s = controller.Store.Value;
        return s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId)?.PinnedEventIds ?? [];
    }

    /// <summary>
    /// The newest pinned message under the header, with "n/total" when there are several; pressing it goes to that message and moves on to the next
    /// (older) one, round and round.
    /// </summary>
    private void BuildPinnedBar(ColorTokens c, AppState s)
    {
        var ids = PinnedIds().Reverse().ToList();
        pinnedBar.IsVisible = ids.Count > 0;
        if (ids.Count == 0)
            return;
        pinnedAt = Math.Min(pinnedAt, ids.Count - 1);
        var id = ids[pinnedAt];
        var item = s.Timeline.FirstOrDefault(i => i.EventId == id);
        pinnedBar.Background = new SolidColorBrush(c.Bg);
        pinnedBar.BorderBrush = new SolidColorBrush(c.Separator);
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*")
        };
        grid.Children.Add(new Icon {
            Glyph = "pin",
            Size = 20,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var bar = new Border {
            Width = 2,
            CornerRadius = new CornerRadius(1),
            Background = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
        };
        Grid.SetColumn(bar, 1);
        grid.Children.Add(bar);
        var words = new StackPanel();
        words.Children.Add(new TextBlock {
            Text = ids.Count > 1
                ? $"{T("pinned.title")} {pinnedAt + 1}/{ids.Count}"
                : T("pinned.title"),
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
        });
        words.Children.Add(new TextBlock {
            Text = item is null ? "…" :
                item.Body.Length > 0 ? item.Body : item.File?.Name ?? item.Image?.FileName ?? "",
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 2);
        grid.Children.Add(words);
        pinnedBar.Child = grid;
        pinnedBar.Cursor = new Cursor(StandardCursorType.Hand);
    }

    /// <summary>Goes to the pinned message shown, and moves the bar on to the next one.</summary>
    public void JumpToPinned()
    {
        var ids = PinnedIds().Reverse().ToList();
        if (ids.Count == 0)
            return;
        var id = ids[Math.Min(pinnedAt, ids.Count - 1)];
        var item = controller.Store.Value.Timeline.FirstOrDefault(i => i.EventId == id);
        if (item is not null && rowsById.TryGetValue(item.Id, out var row))
            Dispatcher.UIThread.Post(() => row.BringIntoView(), DispatcherPriority.Background);
        pinnedAt = (pinnedAt + 1) % ids.Count;
        BuildPinnedBar(ThemeScope.GetColors(this), controller.Store.Value);
    }

    public bool Searching => searching;
    public TextBox SearchInput => searchInput;

    /// <summary>The ids of the lines that match the search, oldest first.</summary>
    public IReadOnlyList<string> Matches => matches;

    public int CurrentMatch => current;

    private void BuildSearchBar()
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto,Auto,Auto")
        };
        glass = new Icon {
            Glyph = "search",
            Size = 18,
            Margin = new Thickness(4, 0, 8, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        grid.Children.Add(glass);
        Grid.SetColumn(searchInput, 1);
        grid.Children.Add(searchInput);
        Grid.SetColumn(searchCount, 2);
        grid.Children.Add(searchCount);
        var up = new IconButton("chevronDown", "Previous", 20, 32);
        up.RenderTransform = new RotateTransform(180);
        up.Click += (_, _) => Step(-1);
        var down = new IconButton("chevronDown", "Next", 20, 32);
        down.Click += (_, _) => Step(1);
        var close = new IconButton("close", T("search.close"), 20, 32);
        close.Click += (_, _) => ToggleSearch();
        Grid.SetColumn(up, 3);
        Grid.SetColumn(down, 4);
        Grid.SetColumn(close, 5);
        grid.Children.Add(up);
        grid.Children.Add(down);
        grid.Children.Add(close);
        searchBar.Child = grid;
        searchInput.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty)
                Search();
        };
        searchInput.KeyDown += (_, e) => {
            if (e.Key == Key.Enter) {
                Step(e.KeyModifiers.HasFlag(KeyModifiers.Shift) ? -1 : 1);
                e.Handled = true;
            } else if (e.Key == Key.Escape) {
                ToggleSearch();
                e.Handled = true;
            }
        };
    }

    /// <summary>Opens or closes the search bar. The search is among the messages loaded here, as it is for encrypted chats in the React Native app.</summary>
    public void ToggleSearch()
    {
        searching = !searching;
        searchBar.IsVisible = searching;
        if (searching)
            searchInput.Focus();
        else
            searchInput.Text = "";
        Search();
        BuildHeader(ThemeScope.GetColors(this), controller.Store.Value);
    }

    /// <summary>Finds the lines with the typed text (two characters at least) and shows the newest match.</summary>
    public void Search()
    {
        var c = ThemeScope.GetColors(this);
        searchBar.Background = new SolidColorBrush(c.Bg);
        searchBar.BorderBrush = new SolidColorBrush(c.Separator);
        searchInput.Foreground = new SolidColorBrush(c.Text);
        searchInput.CaretBrush = new SolidColorBrush(c.Text);
        searchInput.PlaceholderText = T("search.inChat");
        searchInput.Resources["TextControlPlaceholderForeground"] =
            new SolidColorBrush(c.TextSecondary);
        searchInput.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        searchInput.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        searchCount.Foreground = new SolidColorBrush(c.TextSecondary);
        glass.Color = new SolidColorBrush(c.TextSecondary);
        var query = (searchInput.Text ?? "").Trim();
        var all = controller.Store.Value.Timeline;
        matches = !searching || query.Length < 2
            ? []
            : all.Where(i => i.Kind == TimelineKind.Message &&
                             i.Body.Contains(query, StringComparison.CurrentCultureIgnoreCase))
                .Select(i => i.Id)
                .ToList();
        current = matches.Count - 1;
        searchCount.Text = query.Length < 2 ? "" :
            matches.Count == 0 ? T("search.empty") : $"{current + 1}/{matches.Count}";
        Mark();
    }

    private void Step(int direction)
    {
        if (matches.Count == 0)
            return;
        current = (current + direction + matches.Count) % matches.Count;
        searchCount.Text = $"{current + 1}/{matches.Count}";
        Mark();
    }

    // The matches get a ring; the one in view a stronger one, and it is brought into view.
    private void Mark()
    {
        var c = ThemeScope.GetColors(this);
        foreach (var (id, frame) in rowsById) {
            var index = matches.IndexOf(id);
            frame.BorderBrush = index < 0 ? Brushes.Transparent
                : index == current ? new SolidColorBrush(c.Accent)
                : new SolidColorBrush(c.MentionHighlight);
        }

        if (current >= 0 && current < matches.Count &&
            rowsById.TryGetValue(matches[current], out var shown))
            Dispatcher.UIThread.Post(() => shown.BringIntoView(), DispatcherPriority.Background);
    }

    public ImageViewer Viewer => viewer;

    /// <summary>Fetches the file of a message and opens it with the program of the system for it.</summary>
    private async void OpenFile(FileAttachment file)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        try {
            var path = await controller.DownloadFile(file);
            if (path is null)
                return;
            var stored = await window.StorageProvider.TryGetFileFromPathAsync(path);
            if (stored is not null)
                await window.Launcher.LaunchFileAsync(stored);
        } catch (Exception) {
            // The file stays unopened; pressing it again tries again.
        }
    }

    private void OpenViewer(TimelineItem item, Image shown)
    {
        if (item.Image is not { } image || TopLevel.GetTopLevel(this) is not { } window)
            return;
        viewer.Show(window, controller.Pictures, image.Source, image.FileName, shown.Source);
    }

    public Menu AttachMenu => attachMenu;

    /// <summary>The menu of the paperclip: a photo or a file, picked from disk and sent to the chat.</summary>
    public void OpenAttach()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        attachMenu.Show(
            attach,
            window,
            [
                new MenuItem(T("attach.image"), () => _ = PickAndSend(window, true), Icon: "image"),
                new MenuItem(T("attach.file"), () => _ = PickAndSend(window, false), Icon: "file"),
            ]
        );
    }

    private async Task PickAndSend(TopLevel window, bool images)
    {
        var provider = window.StorageProvider;
        if (!provider.CanOpen)
            return;
        var files = await provider.OpenFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerOpenOptions {
                AllowMultiple = true,
                FileTypeFilter =
                    images ? [Avalonia.Platform.Storage.FilePickerFileTypes.ImageAll] : null,
            });
        foreach (var file in files) {
            if (file.TryGetLocalPath() is { } path) {
                try {
                    await controller.SendAttachment(path);
                } catch (Exception) {
                    // The file stays unsent; the person can try again.
                }
            }
        }
    }

    public Dialog DeleteDialog => deleteDialog;

    private void AskDelete(TopLevel window, TimelineItem item)
    {
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = T("delete")
        };
        var no = new TextButton {
            Title = T("cancel")
        };
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        yes.Click += (_, _) => {
            deleteDialog.Close();
            _ = controller.DeleteMessage(item.Id);
        };
        no.Click += (_, _) => deleteDialog.Close();
        deleteDialog.Show(window, c, T("delete.title"), T("delete.body"), yes, no);
    }

    public static readonly string[] QuickReactions = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

    private Control Chips(ColorTokens c, TimelineItem item, bool accent)
    {
        var own = item.IsOwn && accent;
        var baseColor = own ? c.BubbleOut : c.BubbleIn;
        var ink = own ? c.BubbleOutText : c.BubbleInText;
        var strong = ThemeColor.Mix(baseColor, ink, 0.2);
        var panel = new WrapPanel {
            Margin = new Thickness(0, 3, 0, 0),
            HorizontalAlignment = item.IsOwn ? HorizontalAlignment.Right : HorizontalAlignment.Left,
        };
        foreach (var r in item.Reactions) {
            var row = new StackPanel {
                Orientation = Orientation.Horizontal,
                Spacing = 4
            };
            row.Children.Add(new TextBlock {
                Text = r.Key,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(ink),
                VerticalAlignment = VerticalAlignment.Center,
            });
            if (r.Count > 1 || !r.Mine) {
                row.Children.Add(new TextBlock {
                    Text = r.Count.ToString(),
                    FontSize = 13,
                    FontWeight = r.Mine ? FontWeight.Bold : FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(ink),
                    VerticalAlignment = VerticalAlignment.Center,
                });
            }

            var chip = new Border {
                Height = 26,
                Padding = new Thickness(9, 0),
                CornerRadius = new CornerRadius(13),
                Margin = new Thickness(0, 0, 4, 4),
                Background = new SolidColorBrush(r.Mine ? strong : baseColor),
                Cursor = new Cursor(StandardCursorType.Hand),
                Child = row,
            };
            var key = r.Key;
            chip.PointerPressed += (_, e) => {
                e.Handled = true;
                _ = controller.ToggleReaction(item.Id, key);
            };
            Avalonia.Automation.AutomationProperties.SetName(chip, $"{r.Key} {r.Count}");
            panel.Children.Add(chip);
        }

        return panel;
    }

    private Control? ReplyBanner(ColorTokens c, AppState s)
    {
        var editing = s.Editing;
        if (s.ReplyTo is not { } to && editing is null)
            return null;
        to = editing ?? s.ReplyTo!;
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto"),
            Margin = new Thickness(12, 8, 12, 0),
        };
        var icon = new Icon {
            Glyph = editing is null ? "reply" : "edit",
            Size = 20,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var bar = new Border {
            Width = 2,
            CornerRadius = new CornerRadius(1),
            Background = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
        };
        Grid.SetColumn(bar, 1);
        var words = new StackPanel();
        words.Children.Add(new TextBlock {
            Text = editing is not null ? T("edit.title") : to.IsOwn ? T("you") : to.SenderName,
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = to.Body,
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 2);
        var cancel = new IconButton("close", T("cancel"), 18, 28) {
            Tint = c.TextSecondary
        };
        cancel.Click += (_, _) => {
            if (editing is not null) {
                controller.StartEdit(null);
                input.Text = "";
            } else
                controller.SetReplyTo(null);
        };
        Grid.SetColumn(cancel, 3);
        grid.Children.Add(icon);
        grid.Children.Add(bar);
        grid.Children.Add(words);
        grid.Children.Add(cancel);
        return grid;
    }

    private static bool SameRun(TimelineItem a, TimelineItem b)
    {
        return a.Kind == TimelineKind.Message && b.Kind == TimelineKind.Message &&
               a.SenderId == b.SenderId && a.IsOwn == b.IsOwn &&
               Math.Abs(b.Ts - a.Ts) < 5 * 60_000;
    }

    private static Control DateChip(ColorTokens c, string label)
    {
        return new Border {
            Background = new SolidColorBrush(c.ServiceChip),
            CornerRadius = new CornerRadius(999),
            Padding = new Thickness(12, 4),
            Margin = new Thickness(0, 10, 0, 4),
            HorizontalAlignment = HorizontalAlignment.Center,
            Child = new TextBlock {
                Text = label,
                FontSize = 13,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.ServiceChipText),
            },
        };
    }
}
