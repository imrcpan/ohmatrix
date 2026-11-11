using Avalonia.Input.Platform;
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
public sealed partial class ChatPane : Grid {
    public const double HeaderHeight = 64;

    private readonly AppController controller;
    private readonly TimeProvider time;
    private readonly Action? onBack;

    private readonly Border header = new() {
        Height = HeaderHeight,
        BorderThickness = new Thickness(0, 0, 0, 1)
    };

    private readonly ItemsControl list = new() {
        Margin = new Thickness(12, 8)
    };

    private readonly ScrollViewer scroller = new() {
        HorizontalScrollBarVisibility = Avalonia.Controls.Primitives
            .ScrollBarVisibility.Disabled,
    };

    private readonly Border composer = new();

    private readonly MessageMenu actions = new();
    private readonly Grid inputBar = new();
    private ForwardDialog? forwardDialog;
    private readonly HashSet<string> chosen = [];

    private readonly TextBlock selectedCount = new() {
        FontSize = 18,
        FontFamily = Fonts.System,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border selectionBar = new() {
        MinHeight = 54,
        BorderThickness = new Thickness(0, 1, 0, 0),
        IsVisible = false,
    };

    /// <summary>Whether messages are being chosen (to copy or forward).</summary>
    public bool Selecting { get; private set; }

    /// <summary>The ids of the messages chosen.</summary>
    public IReadOnlyCollection<string> Chosen => chosen;

    public ForwardDialog Forwarding =>
        forwardDialog ??= new ForwardDialog(controller);

    /// <summary>Starts choosing messages, with <paramref name="first"/> chosen.</summary>
    public void StartSelect(TimelineItem first)
    {
        Selecting = true;
        chosen.Clear();
        chosen.Add(first.Id);
        RefreshSelection();
        Apply();
    }

    /// <summary>Chooses a message, or lets it go.</summary>
    public void ToggleChosen(string id)
    {
        if (!chosen.Remove(id))
            chosen.Add(id);
        RefreshSelection();
        Apply();
    }

    /// <summary>Stops choosing.</summary>
    public void CancelSelect()
    {
        Selecting = false;
        chosen.Clear();
        RefreshSelection();
        Apply();
    }

    private List<TimelineItem> ChosenItems()
    {
        return controller.Store.Value.Timeline.Where(i => chosen.Contains(i.Id))
            .ToList();
    }

    private async Task CopyChosen()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var text = string.Join("\n",
            ChosenItems().Where(i => i.Image is null && i.File is null)
                .Select(i => i.Body));
        await Copy(window, text);
        controller.ShowNotice(T("copied"));
        CancelSelect();
    }

    private void ForwardChosen()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = ChosenItems().Where(i => Forward.Content(i) is not null)
            .ToList();
        Forwarding.Show(window, items, CancelSelect);
    }

    private readonly Dialog groupDialog = new();

    private readonly IconButton attach = new("attach", "Attach", 24, 38);
    private readonly IconButton emojiButton = new("sticker", "Emoji", 30, 38);
    private readonly EmojiPicker emojiPicker = new();

    /// <summary>The emoji picker over the composer.</summary>
    public EmojiPicker Emoji => emojiPicker;

    /// <summary>The button that opens the emoji picker.</summary>
    public IconButton EmojiButton => emojiButton;

    private void OpenEmoji()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        if (emojiPicker.IsOpen) {
            emojiPicker.Close();
            return;
        }

        var s = controller.Store.Value;
        // With a sticker pack the picker is the stickers alone, as in the React Native app; without one it is the emoji.
        if (controller.CanStickers) {
            _ = Quietly(controller.LoadStickers);
            emojiPicker.ShowStickers(emojiButton, window,
                ThemeScope.GetColors(this),
                StickerPaneOnce());
            return;
        }

        emojiPicker.Show(emojiButton, window, ThemeScope.GetColors(this),
            s.Prefs.RecentEmoji,
            T("emoji.search"), InsertEmoji);
    }

    private StickerPane? stickerPane;

    /// <summary>The sticker pane of the picker, once it has been opened.</summary>
    public StickerPane? Stickers => stickerPane;

    private static async Task Quietly(Func<Task> work)
    {
        try {
            await work();
        } catch (Exception) {
            // The stickers shown stay as they were.
        }
    }

    /// <summary>Puts an emoji into the draft at the caret, and remembers it as the latest used.</summary>
    public void InsertEmoji(string emoji)
    {
        var text = input.Text ?? "";
        var at = Math.Clamp(input.CaretIndex, 0, text.Length);
        input.Text = text[..at] + emoji + text[at..];
        input.CaretIndex = at + emoji.Length;
        controller.SetPreferences(p => p with {
            RecentEmoji = new[] {
                    emoji
                }.Concat(p.RecentEmoji.Where(e => e != emoji))
                .Take(EmojiPicker.RecentMax).ToList()
        });
        input.Focus();
    }

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
    private MessageResultsView? hits;
    private string? hitsRoom;

    // The messages of this chat the server finds, in place of the chat while a search is typed.
    private readonly ScrollViewer hitsHost = new() {
        HorizontalScrollBarVisibility = Avalonia.Controls.Primitives
            .ScrollBarVisibility.Disabled
    };

    private List<string> matches = [];

    // Where each match is in the list: a line asks it for its ring, and a
    // search of the list for each line made the paint of all the lines cost
    // as many steps as there are lines times matches.
    private Dictionary<string, int> matchAt = [];
    private int current;
    private bool searching;
    private readonly Dialog deleteDialog = new();
    private readonly ImageViewer viewer = new();
    private readonly VideoViewer video = new();
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
    private readonly Mentions mentions = new();
    private readonly Menu mentionMenu = new();
    private string? mentionRoom;

    /// <summary>The menu of people offered for an <c>@</c> in the message box.</summary>
    public Menu MentionMenu => mentionMenu;

    private int newWhileAway;
    private string? lastSeenId;

    private readonly Border latest = new() {
        Width = 40,
        Height = 40,
        CornerRadius = new CornerRadius(20),
        BorderThickness = new Thickness(1),
        Cursor = new Cursor(StandardCursorType.Hand),
        Child = new Icon {
            Glyph = "chevronDown",
            Size = 20,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        },
    };

    /// <summary>The button to the newest message, shown while the view is up in the history.</summary>
    public Border ScrollToLatest => latest;

    /// <summary>How many messages from others arrived while the view was up in the history.</summary>
    public int NewWhileAway => newWhileAway;

    private bool loadingOlder;

    // Over the place of the list while the messages of a chat come in; shown only if they take more than a moment.
    private readonly Border overlay = new() {
        IsVisible = false,
        IsHitTestVisible = false,
        ClipToBounds = true,
    };

    private readonly Panel overlaySkeleton = new() {
        VerticalAlignment = VerticalAlignment.Bottom,
    };

    private ITimer? overlayTimer;

    private readonly Border olderHost = new();

    private ITimer? olderTimer;

    /// <summary>Runs <paramref name="action"/> on the UI thread after <paramref name="wait"/>; the timer is kept to be stopped.</summary>
    private ITimer After(TimeSpan wait, Action action)
    {
        return time.CreateTimer(_ => Dispatcher.UIThread.Post(action), null,
            wait,
            Timeout.InfiniteTimeSpan);
    }

    private string? overlayRoom;

    private void ShowOlder(bool on)
    {
        var s = controller.Store.Value;
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        olderHost.Child =
            on ? new ChatSkeleton(4, room is not null && !room.IsDirect) : null;
    }

    /// <summary>Grey bubbles over the list while a chat is being opened.</summary>
    private void UpdateOverlay(AppState s)
    {
        var c = ThemeScope.GetColors(this);
        overlay.Background = new SolidColorBrush(c.ChatBg);
        var c0 = ThemeScope.GetColors(this);
        dropHint.Background = new SolidColorBrush(Color.FromArgb(200,
            c0.Bg.R, c0.Bg.G, c0.Bg.B));
        dropHint.BorderBrush = new SolidColorBrush(c0.Accent);
        if (dropHint.Child is TextBlock hint) {
            hint.Text = T("drop.hint");
            hint.Foreground = new SolidColorBrush(c0.Accent);
        }

        // A chat that is not in the list once it is loaded: it was deleted,
        // or I am not in it any more.
        var missing = s.SelectedRoomId is { } wanted && s.RoomsSettled &&
                      s.Rooms.All(r => r.Id != wanted);
        notFound.IsVisible = missing;
        if (missing)
            BuildNotFound(c0);
        if (s.SelectedRoomId is null || s.TimelineReady) {
            overlayTimer?.Dispose();
            overlay.IsVisible = false;
            overlayRoom = null;
            return;
        }

        if (overlayRoom == s.SelectedRoomId)
            return;
        overlayRoom = s.SelectedRoomId;
        overlay.IsVisible = false;
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        overlaySkeleton.Children.Clear();
        overlaySkeleton.Children.Add(new ChatSkeleton(12,
            room is not null && !room.IsDirect));
        overlayTimer?.Dispose();
        overlayTimer = After(TimeSpan.FromMilliseconds(150),
            () => overlay.IsVisible = !controller.Store.Value.TimelineReady);
    }

    public ChatPane(AppController controller, Action? onBack = null,
        TimeProvider? time = null)
    {
        this.controller = controller;
        this.onBack = onBack;
        this.time = time ?? TimeProvider.System;
        RowDefinitions = new RowDefinitions("Auto,*,Auto");
        InitializeMessages();
        scroller.Content = list;
        olderHost.VerticalAlignment = VerticalAlignment.Top;
        olderHost.HorizontalAlignment = HorizontalAlignment.Center;
        olderHost.IsHitTestVisible = false;
        Grid.SetRow(olderHost, 2);
        overlay.Child = overlaySkeleton;
        Grid.SetRow(body, 1);
        Grid.SetRow(composer, 2);
        Children.Add(header);
        Grid.SetRow(scroller, 2);
        Grid.SetRow(searchBar, 1);
        body.Children.Add(scroller);
        body.Children.Add(olderHost);
        Grid.SetRow(overlay, 2);
        body.Children.Add(overlay);
        Grid.SetRow(notFound, 2);
        body.Children.Add(notFound);
        Grid.SetRow(dropHint, 2);
        body.Children.Add(dropHint);
        Grid.SetRow(latest, 2);
        latest.HorizontalAlignment = HorizontalAlignment.Right;
        latest.VerticalAlignment = VerticalAlignment.Bottom;
        latest.Margin = new Thickness(0, 0, 16, 12);
        latest.IsVisible = false;
        latest.PointerPressed += (_, e) => {
            e.Handled = true;
            newWhileAway = 0;
            stickToBottom = true;
            ScrollToEnd();
        };
        body.Children.Add(latest);
        searchBar.IsVisible = false;
        pinnedBar.PointerPressed += (_, e) => {
            e.Handled = true;
            JumpToPinned();
        };
        body.Children.Add(pinnedBar);
        body.Children.Add(searchBar);
        Grid.SetRow(hitsHost, 2);
        hitsHost.IsVisible = false;
        body.Children.Add(hitsHost);
        Children.Add(body);
        Children.Add(composer);

        var bar = inputBar;
        bar.ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto");
        bar.Margin = new Thickness(10, 8);
        inputBox.Child = input;
        Grid.SetColumn(inputBox, 1);
        attach.VerticalAlignment = VerticalAlignment.Bottom;
        attach.Click += (_, _) => OpenAttach();
        emojiButton.VerticalAlignment = VerticalAlignment.Bottom;
        emojiButton.Click += (_, _) => OpenEmoji();
        // The buttons touch, and sit a little closer to the field than the row's gap.
        bar.Children.Add(new StackPanel {
            Orientation = Orientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 8, 0),
            Children = {
                emojiButton,
                attach
            },
        });
        Grid.SetColumn(send, 2);
        send.Margin = new Thickness(10, 0, 0, 0);
        send.Child = sendIcon;
        bar.Children.Add(inputBox);
        bar.Children.Add(send);
        composerStack.Children.Add(replyHost);
        composerStack.Children.Add(bar);
        composerStack.Children.Add(selectionBar);
        composer.Child = composerStack;

        BuildSearchBar();
        send.PointerPressed += (_, e) => {
            e.Handled = true;
            Submit();
        };
        input.KeyDown += (_, e) => {
            if (e.Key == Key.Enter &&
                !e.KeyModifiers.HasFlag(KeyModifiers.Shift)) {
                e.Handled = true;
                Submit();
            }
        };
        input.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty) {
                // Only what the text changes is done for a key: the rest of
                // the pane (the header, the bars, the colours) does not
                // depend on it and is done when the state or the theme does.
                controller.SetTyping((input.Text ?? "").Trim().Length > 0);
                SuggestMentions();
                UpdateSend(ThemeScope.GetColors(this), false);
            }
        };
        DragDrop.SetAllowDrop(this, true);
        AddHandler(DragDrop.DragEnterEvent,
            (_, _) => dropHint.IsVisible = true);
        AddHandler(DragDrop.DragLeaveEvent,
            (_, _) => dropHint.IsVisible = false);
        AddHandler(DragDrop.DropEvent, (_, _) => dropHint.IsVisible = false,
            Avalonia.Interactivity.RoutingStrategies.Tunnel);
        AddHandler(DragDrop.DropEvent, (_, e) => {
            var files = DataTransferExtensions.TryGetFiles(e.DataTransfer)?
                .Select(f =>
                    Avalonia.Platform.Storage.StorageProviderExtensions
                        .TryGetLocalPath(f))
                .OfType<string>().ToList();
            if (files is { Count: > 0 }) {
                e.Handled = true;
                OfferFiles(files);
            }
        });
        scroller.ScrollChanged += (_, e) => OnScroll(e);
        Lifetime.Watch(this, controller, _ => Apply());
        Lifetime.OnRelease(this, Retire);
        SizeChanged += (_, _) => ResizeMessages();
        Apply();
    }

    public ItemsControl Messages => list;
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
        var people = controller.Store.Value.Details?.Members ?? [];
        var ids = mentions.Resolve(text, people);
        mentions.Reset();
        _ = controller.Send(text, ids);
    }

    /// <summary>Offers the people of the room when the caret is in an <c>@token</c>; picking one puts their name in the text.</summary>
    public void SuggestMentions()
    {
        var s = controller.Store.Value;
        if (TopLevel.GetTopLevel(this) is not { } window ||
            s.SelectedRoomId is not { } roomId)
            return;
        if (mentionRoom != roomId) {
            mentionRoom = roomId;
            mentions.Reset();
            // The people come with the info of the room.
            _ = controller.LoadDetails(roomId);
        }

        var text = input.Text ?? "";
        if (Mentions.TokenAt(text, input.CaretIndex) is not { } token ||
            s.Details is null) {
            mentionMenu.Close();
            return;
        }

        var found = Mentions.Suggest(s.Details.Members, token.Query);
        if (found.Count == 0) {
            mentionMenu.Close();
            return;
        }

        mentionMenu.Show(inputBox, window, [
            .. found.Select(m => new MenuItem(m.Name, () => {
                var (next, caret) =
                    mentions.Apply(m, input.Text ?? "", input.CaretIndex);
                input.Text = next;
                input.CaretIndex = caret;
                input.Focus();
            }, Icon: "user"))
        ]);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>The name a person goes by in the open chat, or the start of their id.</summary>
    private string NameOfUser(string id)
    {
        if (!memberNames.TryGetValue(id, out var name)) {
            name = ServiceText.PersonName(null, id);
            memberNames.Add(id, name);
        }

        return name;
    }

    // "Drop files to send", over the chat while files are dragged over it.
    private readonly Border dropHint = new() {
        IsVisible = false,
        IsHitTestVisible = false,
        CornerRadius = new CornerRadius(16),
        Margin = new Thickness(12),
        BorderThickness = new Thickness(2),
        Child = new TextBlock {
            FontSize = 18,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        },
    };

    public Border DropHint => dropHint;

    private readonly Border notFound = new() {
        IsVisible = false
    };

    public Border NotFound => notFound;

    private void BuildNotFound(ColorTokens c)
    {
        notFound.Background = new SolidColorBrush(c.ChatBg);
        var stack = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Spacing = 8,
            MaxWidth = 360,
        };
        stack.Children.Add(new TextBlock {
            Text = T("chatNotFound"),
            FontSize = 20,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
        });
        stack.Children.Add(new TextBlock {
            Text = T("chatNotFound.body"),
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
        });
        var back = new TextButton {
            Title = T("backToChats"),
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        ThemeScope.SetColors(back, c);
        back.Click += (_, _) => controller.SelectRoom(null);
        stack.Children.Add(back);
        notFound.Child = stack;
    }

    private bool revealing;
    private int revealRoomVersion;
    private Notice? revealNotice;

    // Each search for a message has its own number, and a pane that is
    // hidden takes the number on: the search that was waiting for older
    // history sees it is not the current one and ends. The index of a
    // hidden pane is not kept up to date, so it must not be asked whether
    // the message is there.
    private int revealSerial;
    private string? revealTarget;
    private string? revealRoom;
    private string? revealHighlight;
    private bool revealPending;

    private bool retired;
    private readonly CancellationTokenSource retiredWaits = new();

    // The pane is thrown away for good (the account was switched): what is
    // waiting for history, for the end of a mark or for a timer is over,
    // and writes nothing more to the account it was shown for. Unlike
    // StopRevealing it hands nothing on, for there is no other pane.
    private void Retire()
    {
        retired = true;
        roomVersion++;
        revealSerial++;
        revealing = false;
        revealPending = false;
        revealTarget = null;
        revealHighlight = null;
        highlightId = null;
        loadingOlder = false;
        retiredWaits.Cancel();
        ClearRevealNotice();
        overlayTimer?.Dispose();
        olderTimer?.Dispose();
    }

    private void StopRevealing()
    {
        if (!revealing)
            return;
        // The mark the search put on the message goes with it: its wait
        // for the end of the mark is over now.
        if (revealHighlight is not null && highlightId == revealHighlight) {
            highlightId = null;
            Mark(false);
        }

        revealHighlight = null;
        var target = revealPending ? revealTarget : null;
        var sameRoom = controller.Store.Value.SelectedRoomId == revealRoom;
        revealSerial++;
        revealing = false;
        revealPending = false;
        ClearRevealNotice();
        // A search that had not found the message is given to the pane that
        // is on the screen now, which asks for it as for any jump. That is
        // for a change between wide and narrow; when the chat was closed or
        // another one chosen the search is just over.
        if (target is not null && sameRoom)
            controller.Store.Update(s => s with {
                JumpToEventId = target
            });
    }

    /// <summary>
    /// Goes to a message and marks it for a moment, reading older history
    /// first when it is not loaded (<c>useReveal</c>); says so when it cannot
    /// be found.
    /// </summary>
    public async Task Reveal(string eventId)
    {
        if (retired)
            return;
        var generation = roomVersion;
        if (revealing && revealRoomVersion == generation)
            return;
        revealing = true;
        revealRoomVersion = generation;
        revealTarget = eventId;
        revealRoom = controller.Store.Value.SelectedRoomId;
        revealPending = true;
        var mine = ++revealSerial;

        bool Superseded() =>
            retired || generation != roomVersion || mine != revealSerial;

        try {
            TimelineItem? Find() => controller.Store.Value.Timeline
                .FirstOrDefault(i => i.EventId == eventId);

            if (Find() is null) {
                controller.ShowNotice(T("jump.looking"), NoticeKind.Progress);
                revealNotice = controller.Store.Value.Notice;
                for (var n = 0; n < 40 && Find() is null; n++) {
                    if (Superseded())
                        return;
                    var before = controller.Store.Value.Timeline.Count;
                    var atStart = await controller.LoadOlder();
                    if (Superseded())
                        return;
                    if (atStart && Find() is null)
                        break;
                    for (var w = 0;
                         w < 20 && Find() is null &&
                         controller.Store.Value.Timeline.Count == before;
                         w++) {
                        await Task.Delay(50, retiredWaits.Token)
                            .ConfigureAwait(
                                ConfigureAwaitOptions.SuppressThrowing |
                                ConfigureAwaitOptions
                                    .ContinueOnCapturedContext);
                        if (Superseded())
                            return;
                    }

                    if (controller.Store.Value.Timeline.Count == before)
                        break;
                }
            }

            await Task.Yield();
            if (Superseded())
                return;
            Dispatcher.UIThread.RunJobs();
            if (Superseded())
                return;
            if (Find() is not { } hit || !ScrollToMessage(hit.Id)) {
                controller.ShowNotice(T("jump.notFound"), NoticeKind.Error);
                revealNotice = controller.Store.Value.Notice;
                return;
            }

            revealPending = false;
            ClearRevealNotice();
            highlightId = hit.Id;
            revealHighlight = hit.Id;
            Mark(false);
            await Task.Delay(3000, retiredWaits.Token)
                .ConfigureAwait(
                    ConfigureAwaitOptions.SuppressThrowing |
                    ConfigureAwaitOptions.ContinueOnCapturedContext);
            if (Superseded())
                return;
            if (highlightId == hit.Id)
                highlightId = null;
            revealHighlight = null;
            Mark(false);
        } finally {
            if (!retired && mine == revealSerial) {
                if (revealNotice?.Kind == NoticeKind.Progress)
                    ClearRevealNotice();
                revealing = false;
                revealPending = false;
            }
        }
    }

    private void ClearRevealNotice()
    {
        var owned = revealNotice;
        revealNotice = null;
        if (owned is not null &&
            ReferenceEquals(controller.Store.Value.Notice, owned))
            controller.Store.Update(s => ReferenceEquals(s.Notice, owned)
                ? s with {
                    Notice = null
                }
                : s);
    }

    private string? highlightId;
    public string? Highlighted => highlightId;

    private void ShowLatest()
    {
        var c = ThemeScope.GetColors(this);
        var away = !stickToBottom && controller.Store.Value.Timeline.Count > 0;
        latest.IsVisible = away;
        latest.Background = new SolidColorBrush(c.Bg);
        latest.BorderBrush = new SolidColorBrush(c.Separator);
        if (latest.Child is Icon icon)
            icon.Color = new SolidColorBrush(c.TextSecondary);
        var label = newWhileAway > 0
            ? T("scroll.newCount", ("n", newWhileAway))
            : T("scroll.latest");
        Avalonia.Automation.AutomationProperties.SetName(latest, label);
        if (newWhileAway > 0)
            ToolTip.SetTip(latest, label);
    }

    private void OnScroll(ScrollChangedEventArgs change)
    {
        if (adjustingScroll || updatingMessages)
            return;
        var offsetChanged = Math.Abs(change.OffsetDelta.Y) > 0.01;
        var layoutChanged = change.ExtentDelta != default ||
                            change.ViewportDelta != default;
        if (!offsetChanged) {
            if (stickToBottom && layoutChanged)
                ScrollToEnd();
            return;
        }

        var userMovement = scrollInputPending || !layoutChanged;
        if (userMovement)
            scrollVersion++;
        var atBottom = scroller.Offset.Y >=
                       scroller.Extent.Height - scroller.Viewport.Height - 40;
        if (!atBottom && stickToBottom && layoutChanged && !userMovement &&
            change.OffsetDelta.Y >= 0) {
            ScrollToEnd();
            return;
        }

        stickToBottom = atBottom;
        if (atBottom)
            newWhileAway = 0;
        ShowLatest();
        // Extent corrections do not request history. A real move near the
        // top does; the stable visible item anchors any inserted messages.
        if (userMovement && scroller.Offset.Y < 80 &&
            !loadingOlder && !historyStart &&
            scroller.Extent.Height > scroller.Viewport.Height) {
            loadingOlder = true;
            var generation = roomVersion;
            olderTimer?.Dispose();
            olderTimer = After(TimeSpan.FromMilliseconds(250), () => {
                if (generation == roomVersion && loadingOlder)
                    ShowOlder(true);
            });
            _ = controller.LoadOlder().ContinueWith(result =>
                Dispatcher.UIThread.Post(() => {
                    if (generation != roomVersion)
                        return;
                    loadingOlder = false;
                    historyStart = result.IsCompletedSuccessfully &&
                                   result.Result;
                    olderTimer?.Dispose();
                    ShowOlder(false);
                }));
        }
    }

    private bool? sendReady;

    /// <summary>The send button is in the accent when there is text to send. Without <paramref name="force"/> nothing is made while the answer stays the same.</summary>
    private void UpdateSend(ColorTokens c, bool force)
    {
        var ready = (input.Text ?? "").Trim().Length > 0;
        if (!force && sendReady == ready)
            return;
        sendReady = ready;
        send.Background = new SolidColorBrush(ready ? c.Accent : c.Separator);
        sendIcon.Color =
            new SolidColorBrush(ready ? c.OnAccent : c.TextSecondary);
    }

    /// <summary>The background of the send button now: the accent with text to send.</summary>
    public IBrush? SendBackground => send.Background;

    private bool showing = true;
    private bool stale;

    /// <summary>
    /// Whether the chat is on the screen. There are two (beside the list,
    /// over it) and one is always hidden; it is not built, and does not
    /// take a jump to a message, until it is shown.
    /// </summary>
    public bool Showing {
        get => showing;
        set {
            if (showing == value)
                return;
            showing = value;
            if (!value)
                StopRevealing();
            if (value && stale)
                Apply();
        }
    }

    private void Apply()
    {
        if (!showing) {
            stale = true;
            return;
        }

        stale = false;
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.ChatBg);
        composer.Background = new SolidColorBrush(c.Bg);
        inputBox.Background = new SolidColorBrush(c.BgSecondary);
        input.Foreground = new SolidColorBrush(c.Text);
        input.CaretBrush = new SolidColorBrush(c.Text);
        input.SelectionBrush = new SolidColorBrush(c.Accent, 0.4);
        input.PlaceholderText = T("message");
        input.Resources["TextControlPlaceholderForeground"] =
            new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(c.TextSecondary);
        input.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        input.Resources["TextControlBackgroundPointerOver"] =
            Brushes.Transparent;
        input.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        input.Resources["TextControlBorderBrushPointerOver"] =
            Brushes.Transparent;
        UpdateSend(c, true);
        Avalonia.Automation.AutomationProperties.SetName(send,
            T("send.files.send"));
        Avalonia.Automation.AutomationProperties.SetName(attach,
            T("attach.label"));
        Avalonia.Automation.AutomationProperties.SetName(emojiButton,
            T("emoji"));

        var s = controller.Store.Value;
        // While messages are being chosen the message box gives way to how many there are.
        selectionBar.IsVisible = Selecting;
        selectionBar.BorderBrush = new SolidColorBrush(c.Separator);
        selectionBar.Child = selectedCount;
        selectedCount.Foreground = new SolidColorBrush(c.BubbleInText);
        selectedCount.Text = chosen.Count == 1
            ? T("selected.one")
            : T("selected.count", ("n", chosen.Count));
        inputBar.IsVisible = !Selecting;
        UpdateOverlay(s);
        BuildPinnedBar(c, s);
        replyHost.Child = ReplyBanner(c, s);
        // Starting to edit puts the text of the message in the field, once.
        if (s.Editing?.Id != editingId) {
            editingId = s.Editing?.Id;
            if (s.Editing is { } e)
                input.Text = e.Body;
        }

        // A jump that is asked for is taken even when the timeline did not
        // change (it can be loaded already).
        if (!ReferenceEquals(shownItems, s.Timeline) ||
            MessagePresentationChanged(s, c) ||
            s is { JumpToEventId: not null, TimelineReady: true }) {
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

    /// <summary>While messages are being chosen, the bar above the chat: Cancel at the left, Copy and Forward at the right.</summary>
    private void BuildSelectionHeader(ColorTokens c)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto,Auto"),
            Margin = new Thickness(20, 0, 12, 0),
        };
        var cancel = new TextBlock {
            Text = T("cancel"),
            FontSize = 17,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            Cursor = new Cursor(StandardCursorType.Hand),
            VerticalAlignment = VerticalAlignment.Center,
            Padding = new Thickness(0, 8, 8, 8),
        };
        cancel.PointerPressed += (_, e) => {
            e.Handled = true;
            CancelSelect();
        };
        Avalonia.Automation.AutomationProperties.SetName(cancel, T("cancel"));
        grid.Children.Add(cancel);
        var any = chosen.Count > 0;
        var copy = new IconButton("copy", T("copy"), 22) {
            Tint = any ? c.Accent : c.TextTertiary
        };
        copy.Click += (_, _) => {
            if (chosen.Count > 0)
                _ = CopyChosen();
        };
        Grid.SetColumn(copy, 2);
        grid.Children.Add(copy);
        var forward = new IconButton("forward", T("forward"), 22) {
            Tint = any ? c.Accent : c.TextTertiary
        };
        forward.Click += (_, _) => {
            if (chosen.Count > 0)
                ForwardChosen();
        };
        Grid.SetColumn(forward, 3);
        grid.Children.Add(forward);
        header.Child = new Border {
            Height = 56,
            Child = grid
        };
    }

    private void BuildHeader(ColorTokens c, AppState s)
    {
        header.Background = new SolidColorBrush(c.Bg);
        header.BorderBrush = new SolidColorBrush(c.Separator);
        if (Selecting) {
            BuildSelectionHeader(c);
            return;
        }

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
                Foreground =
                    new SolidColorBrush(typing.Count > 0
                        ? c.Accent
                        : c.TextSecondary),
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
        info.Click += (_, _) =>
            controller.OpenRoomInfo(!controller.Store.Value.RoomInfoOpen);
        Grid.SetColumn(info, 2);
        bar.Children.Add(info);
        header.Child = bar;
    }

    private void Rebuild() => RefreshMessages();

    private static Control SelectMark(ColorTokens c, bool on)
    {
        return new Border {
            Width = 22,
            Height = 22,
            Margin = new Thickness(4, 0, 8, 0),
            CornerRadius = new CornerRadius(11),
            BorderThickness = new Thickness(2),
            BorderBrush = new SolidColorBrush(on ? c.Accent : c.TextTertiary),
            Background =
                on ? new SolidColorBrush(c.Accent) : Brushes.Transparent,
            VerticalAlignment = VerticalAlignment.Center,
            Child = on
                ? new Icon {
                    Glyph = "check",
                    Size = 14,
                    Color = new SolidColorBrush(c.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                }
                : null,
        };
    }

    /// <summary>The menu of a message: a pill of quick reactions and the actions (<c>MessageMenu</c>); it opens at <paramref name="at"/> or under <paramref name="anchor"/>.</summary>
    public void OpenActions(Control anchor, TimelineItem item, Point? at = null)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        // A message that could not be sent has only the two things that can be done with it, and no reactions.
        if (item.Failed) {
            actions.Show(window, ThemeScope.GetColors(this),
                at ?? (anchor.TranslatePoint(new Point(0, 0), window) ??
                       new Point()), [], [],
                _ => {
                },
                [
                    new MenuItem(T("resend"),
                        () => _ = controller.ResendMessage(item.Id),
                        Icon: "send"),
                    new MenuItem(T("delete"),
                        () => _ = controller.DiscardMessage(item.Id),
                        Icon: "trash", Danger: true),
                ]);
            return;
        }

        var items = new List<MenuItem>();
        if (item.Body.Length > 0 && item.Image is null && item.File is null)
            items.Add(new MenuItem(T("copy"), () => _ = Copy(window, item.Body),
                Icon: "copy"));
        items.Add(new MenuItem(T("reply"), () => controller.SetReplyTo(item),
            Icon: "reply"));
        var isText = item.Image is null && item.File is null;
        if (item.IsOwn && item.EventId is not null && !item.Failed && isText)
            items.Add(new MenuItem(T("edit"), () => controller.StartEdit(item),
                Icon: "edit"));
        if (item.EventId is { } eventId) {
            var pinned = PinnedIds().Contains(eventId);
            items.Add(new MenuItem(T(pinned ? "unpin" : "pin"),
                () => _ = controller.SetMessagePinned(item.Id, !pinned),
                Icon: "pin"));
        }

        if (Forward.Content(item) is not null)
            items.Add(new MenuItem(T("forward"), () => {
                Forwarding.Show(window, [item]);
            }, Icon: "forward"));
        if (item.Image is { } picture && controller.CanStickers
                                      && picture.Source.StartsWith("mxc://",
                                          StringComparison.Ordinal))
            items.Add(new MenuItem(T("sticker.add"),
                () => AskStickerGroup(window, item),
                Icon: "sticker"));
        items.Add(new MenuItem(T("select.multi"), () => StartSelect(item),
            Icon: "multiSelect"));
        if (item.IsOwn && item.EventId is not null && !item.Failed)
            items.Add(new MenuItem(T("delete"), () => AskDelete(window, item),
                Icon: "trash",
                Danger: true));
        var mine = item.Reactions.Where(r => r.Mine).Select(r => r.Key)
            .ToList();
        var point = at ?? (anchor.TranslatePoint(new Point(0, 0), window) ??
                           new Point());
        actions.Show(window, ThemeScope.GetColors(this), point, QuickReactions,
            mine,
            emoji => _ = controller.ToggleReaction(item.Id, emoji), items);
    }

    private static async Task Copy(TopLevel window, string text)
    {
        if (window.Clipboard is { } clipboard)
            await clipboard.SetTextAsync(text);
    }

    /// <summary>Asks to which group of my stickers the picture of a message goes, and puts it there.</summary>
    private void AskStickerGroup(TopLevel window, TimelineItem item)
    {
        var colors = ThemeScope.GetColors(this);
        StickerPaneOnce();
        _ = Quietly(controller.LoadStickers);
        var cancel = new TextButton {
            Title = T("cancel")
        };
        cancel.Click += (_, _) => groupDialog.Close();
        groupDialog.Show(window, colors, T("sticker.add.where"), null,
            stickerPane.GroupChoice(id => {
                groupDialog.Close();
                _ = AddToStickers(item, id);
            }), cancel);
    }

    private async Task AddToStickers(TimelineItem item, string groupId)
    {
        try {
            await controller.AddStickerFrom(item, groupId);
            controller.ShowNotice(T("sticker.added"));
        } catch (Exception e) {
            controller.ShowNotice(
                T("sticker.add.failed",
                    ("reason", Failure.Reason(e, k => T(k)))),
                NoticeKind.Error);
        }
    }

    public MessageMenu Actions => actions;
    public Dialog GroupDialog => groupDialog;
    public Border PinnedBar => pinnedBar;

    private IReadOnlyList<string> PinnedIds()
    {
        var s = controller.Store.Value;
        return s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId)
            ?.PinnedEventIds ?? [];
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
            ColumnDefinitions = new ColumnDefinitions("Auto,Auto,*,Auto")
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
                item.Body.Length > 0 ? item.Body :
                item.File?.Name ?? item.Image?.FileName ?? "",
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 2);
        grid.Children.Add(words);
        var all = new IconButton("more", T("pinned.all"), 20, 32) {
            VerticalAlignment = VerticalAlignment.Center
        };
        all.Click += (_, _) => OpenPinnedList();
        Grid.SetColumn(all, 3);
        grid.Children.Add(all);
        pinnedBar.Child = grid;
        pinnedBar.Cursor = new Cursor(StandardCursorType.Hand);
    }

    private readonly Dialog pinnedDialog = new();
    public Dialog PinnedDialog => pinnedDialog;

    /// <summary>All the pinned messages of the chat, newest first, in a dialog; pressing one goes to it (<c>PinnedPage</c>).</summary>
    public void OpenPinnedList()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var ids = PinnedIds().Reverse().ToList();
        var rowsList = new StackPanel();
        foreach (var id in ids) {
            var item =
                controller.Store.Value.Timeline.FirstOrDefault(i =>
                    i.EventId == id);
            var text = item is null ? "…"
                : item.Body.Length > 0 ? item.Body
                : item.File?.Name ?? item.Image?.FileName ?? "";
            var line = new StackPanel {
                Margin = new Thickness(4, 6),
                Background = Brushes.Transparent,
                Cursor = new Cursor(StandardCursorType.Hand)
            };
            if (item is not null)
                line.Children.Add(new TextBlock {
                    Text = item.SenderName,
                    FontSize = 13,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Accent),
                });
            line.Children.Add(new TextBlock {
                Text = text,
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                MaxLines = 2,
                TextTrimming = TextTrimming.CharacterEllipsis,
                TextWrapping = TextWrapping.Wrap,
            });
            var target = item;
            line.PointerPressed += (_, e) => {
                e.Handled = true;
                pinnedDialog.Close();
                if (target is not null)
                    ScrollToMessage(target.Id);
            };
            rowsList.Children.Add(line);
        }

        var close = new TextButton {
            Title = T("viewer.close")
        };
        ThemeScope.SetColors(close, c);
        close.Click += (_, _) => pinnedDialog.Close();
        pinnedDialog.Show(window, c, $"{T("pinned.title")} · {ids.Count}", null,
            new ScrollViewer {
                Content = rowsList,
                MaxHeight = 360
            }, close);
    }

    /// <summary>Goes to the pinned message shown, and moves the bar on to the next one.</summary>
    public void JumpToPinned()
    {
        var ids = PinnedIds().Reverse().ToList();
        if (ids.Count == 0)
            return;
        var id = ids[Math.Min(pinnedAt, ids.Count - 1)];
        var item =
            controller.Store.Value.Timeline.FirstOrDefault(i =>
                i.EventId == id);
        if (item is not null)
            ScrollToMessage(item.Id);
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
            ColumnDefinitions =
                new ColumnDefinitions("Auto,*,Auto,Auto,Auto,Auto")
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
        StyleSearch(c);
        var query = (searchInput.Text ?? "").Trim();
        var all = controller.Store.Value.Timeline;
        matches = !searching || query.Length < 2
            ? []
            : all.Where(i => i.Kind == TimelineKind.Message &&
                             i.Body.Contains(query,
                                 StringComparison.CurrentCultureIgnoreCase))
                .Select(i => i.Id)
                .ToList();
        if (searching && query.Length >= 2 && controller.CanSearchMessages
            && controller.Store.Value.SelectedRoomId is { } roomId) {
            if (hits is null || hitsRoom != roomId) {
                Lifetime.Drop(this, hits);
                hits = new MessageResultsView(controller, roomId, false);
                Lifetime.Own(this, hits);
                hitsRoom = roomId;
                hitsHost.Content = hits;
                hits.Picked += () => ToggleSearch();
            }

            hitsHost.Background = new SolidColorBrush(c.Bg);
            hits.SetTerm(query);
            hitsHost.IsVisible = true;
        } else {
            hits?.SetTerm("");
            hitsHost.IsVisible = false;
        }

        matchAt = [];
        for (var i = 0; i < matches.Count; i++)
            matchAt[matches[i]] = i;
        current = matches.Count - 1;
        searchCount.Text = query.Length < 2 ? "" :
            matches.Count == 0 ? T("search.empty") :
            $"{current + 1}/{matches.Count}";
        Mark();
    }

    // The look of the bar changes with the colours and the language, not
    // with a key: it is set again only then.
    private ColorTokens? searchStyle;
    private string? searchLocale;

    private void StyleSearch(ColorTokens c)
    {
        var locale = controller.Store.Value.Locale;
        if (Equals(searchStyle, c) && searchLocale == locale)
            return;
        searchStyle = c;
        searchLocale = locale;
        searchBar.Background = new SolidColorBrush(c.Bg);
        searchBar.BorderBrush = new SolidColorBrush(c.Separator);
        searchInput.Foreground = new SolidColorBrush(c.Text);
        searchInput.CaretBrush = new SolidColorBrush(c.Text);
        searchInput.PlaceholderText = T("search.inChat");
        searchInput.Resources["TextControlPlaceholderForeground"] =
            new SolidColorBrush(c.TextSecondary);
        searchInput.Resources["TextControlBackgroundFocused"] =
            Brushes.Transparent;
        searchInput.Resources["TextControlBorderBrushFocused"] =
            Brushes.Transparent;
        searchCount.Foreground = new SolidColorBrush(c.TextSecondary);
        glass.Color = new SolidColorBrush(c.TextSecondary);
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
    private void Mark(bool scroll = true)
    {
        var colors = ThemeScope.GetColors(this);
        foreach (var (id, frame) in rowsById)
            PaintMessage(id, frame, colors);
        if (scroll && current >= 0 && current < matches.Count)
            ScrollToMessage(matches[current]);
    }

    public ImageViewer Viewer => viewer;
    public VideoViewer VideoScreen => video;

    /// <summary>Fetches the file of a message and opens it with the program of the system for it.</summary>
    private async void OpenFile(FileAttachment file)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        // A video plays in the app where the system has a player library; otherwise (and for any other file) the system's program opens it.
        if (file.Kind == FileKind.Video && Audio.MediaPlayer.Available) {
            await video.Show(window, file, controller.DownloadFile);
            return;
        }

        try {
            var path = await controller.DownloadFile(file);
            if (path is null)
                return;
            var stored =
                await window.StorageProvider.TryGetFileFromPathAsync(path);
            if (stored is not null)
                await window.Launcher.LaunchFileAsync(stored);
        } catch (Exception) {
            // The file stays unopened; pressing it again tries again.
        }
    }

    private void OpenViewer(TimelineItem item, Image shown)
    {
        if (item.Image is not { } image || TopLevel.GetTopLevel(this) is not
                { } window)
            return;
        viewer.Show(window, controller.Pictures, image.Source, image.FileName,
            shown.Source,
            () => controller.SavePicture(window, image.Source, image.FileName));
    }

    private SendFilesDialog? sendFiles;

    public SendFilesDialog SendFiles =>
        sendFiles ??= new SendFilesDialog(controller);

    /// <summary>Asks before files dropped on the chat are sent, then sends each.</summary>
    public void OfferFiles(IReadOnlyList<string> paths)
    {
        if (controller.Store.Value.SelectedRoomId is null ||
            TopLevel.GetTopLevel(this) is not { } window)
            return;
        SendFiles.Show(window, paths, () => _ = SendPaths(paths));
    }

    private async Task SendPaths(IReadOnlyList<string> paths)
    {
        foreach (var path in paths) {
            try {
                await controller.SendAttachment(path);
            } catch (Exception) {
                // The file stays unsent; the person can try again.
            }
        }
    }

    private RecordingDialog? recordingDialog;

    private RecordingDialog recording {
        get {
            if (recordingDialog is null) {
                recordingDialog = new RecordingDialog(controller);
                Lifetime.Own(this, recordingDialog);
            }

            return recordingDialog;
        }
    }

    // Made on first use; it goes when the pane does.
    private StickerPane StickerPaneOnce()
    {
        if (stickerPane is null) {
            stickerPane = new StickerPane(controller, emojiPicker.Close);
            Lifetime.Own(this, stickerPane);
        }

        return stickerPane;
    }

    public RecordingDialog Recorder => recording;

    public Menu AttachMenu => attachMenu;

    /// <summary>The menu of the paperclip: a photo or a file, picked from disk and sent to the chat.</summary>
    public void OpenAttach()
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = new List<MenuItem> {
            new(T("attach.image"), () => _ = PickAndSend(window, true),
                Icon: "image"),
            new(T("attach.file"), () => _ = PickAndSend(window, false),
                Icon: "file"),
        };
        if (RecordingDialog.Available(false))
            items.Add(new MenuItem(T("record.voice"),
                () => recording.Open(window, false),
                Icon: "mic"));
        if (RecordingDialog.Available(true))
            items.Add(new MenuItem(T("record.video"),
                () => recording.Open(window, true),
                Icon: "video"));
        // Calls are for one-to-one chats, where this machine can make them.
        var s = controller.Store.Value;
        if (controller.CallsSupported &&
            s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId)
                is { IsDirect: true }) {
            items.Add(new MenuItem(T("call.voice"),
                () => AskCall(window, false),
                Icon: "fluentCall"));
            items.Add(new MenuItem(T("call.video"), () => AskCall(window, true),
                Icon: "fluentVideo"));
        }

        attachMenu.Show(attach, window, items);
    }

    public PromptDialog CallPrompt { get; } = new();

    /// <summary>Asks whether to start the call, then places it; why it could not be placed is shown in the prompt.</summary>
    public void AskCall(TopLevel window, bool video)
    {
        if (controller.Store.Value.SelectedRoomId is not { } roomId)
            return;
        CallPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T(video ? "call.video.ask" : "call.voice.ask"), T("call.ask.body"),
            [],
            T(video ? "call.video.start" : "call.voice.start"), async _ => {
                try {
                    await controller.PlaceCall(roomId, video);
                } catch (InvalidOperationException e) {
                    throw new EngineException(EngineErrorCode.Unsupported,
                        e.Message switch {
                            "direct" => T("call.only.direct"),
                            "unsupported" => T("call.unsupported"),
                            "no_media" => T("call.end.nomedia"),
                            "busy" => T("call.end.busy"),
                            _ => T("call.failed", ("reason", e.Message)),
                        });
                }
            });
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
                    images
                        ? [
                            Avalonia.Platform.Storage.FilePickerFileTypes
                                .ImageAll
                        ]
                        : null,
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
        deleteDialog.Show(window, c, T("delete.title"), T("delete.body"), yes,
            no);
    }

    public static readonly string[] QuickReactions =
        ["👍", "❤️", "😂", "😮", "😢", "🙏"];

    private Control Chips(ColorTokens c, TimelineItem item, bool accent)
    {
        var own = item.IsOwn && accent;
        var baseColor = own ? c.BubbleOut : c.BubbleIn;
        var ink = own ? c.BubbleOutText : c.BubbleInText;
        var strong = ThemeColor.Mix(baseColor, ink, 0.2);
        var panel = new WrapPanel {
            Margin = new Thickness(0, 3, 0, 0),
            HorizontalAlignment = item.IsOwn
                ? HorizontalAlignment.Right
                : HorizontalAlignment.Left,
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
            Avalonia.Automation.AutomationProperties.SetName(chip,
                $"{r.Key} {r.Count}");
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
            Text = editing is not null ? T("edit.title") :
                to.IsOwn ? T("you") : to.SenderName,
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
        return a.Kind == TimelineKind.Message &&
               b.Kind == TimelineKind.Message &&
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
