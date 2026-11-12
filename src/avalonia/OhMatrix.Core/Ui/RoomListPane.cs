using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The chat list (<c>RoomListPane</c>): a bar with my picture and name (or "Connecting…" while there is no connection) and the plus button, the
/// search field, and a row for each chat, pinned first and the latest activity first; the open chat is selected. In the strip (<see cref="Rail"/>)
/// only the pictures are shown.
/// </summary>
public sealed class RoomListPane : Grid {
    private readonly AppController controller;
    private readonly TimeProvider time;

    private readonly TextBlock name = new() {
        FontSize = 17,
        LineHeight = 22,
        FontWeight = FontWeight.Bold,
        FontFamily = Fonts.System,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border bar = new() {
        Padding = new Thickness(12, 10, 12, 8)
    };

    private readonly ProfileButton profile = new() {
        CornerRadius = new CornerRadius(10),
        Padding = new Thickness(4, 2),
        HorizontalAlignment = HorizontalAlignment.Left,
    };

    /// <summary>My picture and name: a tint under the pointer, like the rows.</summary>
    private sealed class ProfileButton : PressableButton {
        protected override void Refresh()
        {
            var c = Colors;
            Background = Pressed ? new SolidColorBrush(c.Separator)
                : Hovered ? new SolidColorBrush(c.Hover)
                : Brushes.Transparent;
        }
    }

    private readonly Banner banner = new();
    private readonly Border avatarHolder = new();
    private readonly SearchField search = new();
    private readonly StackPanel rows = new();
    private readonly StackPanel messageHits = new();
    private MessageResultsView? hits;
    private readonly Dictionary<string, RoomEntry> roomRows = new();
    private readonly Dictionary<string, RoomRow> joiningRows = new();
    private AppState? applied;
    private ColorTokens? colors;
    private string? filter;
    private DateTime day;
    private RoomRowSkeleton[]? skeletons;
    private TextBlock? joinFailure;
    private TextBlock? messagesLabel;

    private sealed class RoomEntry(RoomSummary room, RoomRow row) {
        public RoomSummary Room = room;
        public RoomRow Row { get; } = row;
    }

    private readonly TextBlock empty = new() {
        FontSize = 15,
        FontFamily = Fonts.System,
        TextAlignment = TextAlignment.Center,
        Margin = new Thickness(0, 48, 0, 0),
    };

    private readonly IconButton plus;

    private readonly Menu addMenu = new() {
        AlignRight = true
    };

    private readonly PromptDialog prompt = new();
    private bool connectedOnce;

    // While the profile has not come, grey shapes stand where the picture and the name will be.
    private readonly Pulse nameSkeleton = new() {
        VerticalAlignment = VerticalAlignment.Center,
        Children = {
            new SkeletonBlock(110, 20)
        },
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static RoomListPane()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<RoomListPane>((p, _) => p.Apply());
    }

    public RoomListPane(AppController controller, bool rail = false,
        TimeProvider? time = null)
    {
        this.controller = controller;
        People = new PeoplePicker(controller);
        this.time = time ?? TimeProvider.System;
        Rail = rail;
        plus = new IconButton("plus", "New", rail ? 28 : 24, rail ? 44 : 36);
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        var header = new StackPanel {
            Spacing = rail ? 0 : 10
        };
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*")
        };
        line.Children.Add(avatarHolder);
        // A long name ends where the plus button starts, it does not run
        // under it.
        foreach (var label in new Control[] {
                     name, nameSkeleton
                 }) {
            label.Margin = new Thickness(10, 0, 0, 0);
            Grid.SetColumn(label, 1);
            line.Children.Add(label);
        }

        profile.Child = line;
        profile.Click += (_, _) =>
            controller.OpenSidebarPage(SidebarPage.Profile);
        if (rail) {
            // The strip: my picture with the room around it that a picture
            // has in a row, then the plus button under it.
            profile.Margin = new Thickness(6, 0);
            profile.Padding = new Thickness(8, 7);
            profile.CornerRadius = new CornerRadius(12);
            profile.HorizontalAlignment = HorizontalAlignment.Stretch;
            header.Children.Add(profile);
            plus.HorizontalAlignment = HorizontalAlignment.Center;
            header.Children.Add(new Border {
                Padding = new Thickness(0, 2, 0, 0),
                Child = plus,
            });
        } else {
            var top = new Grid {
                Height = 44,
                ColumnDefinitions = new ColumnDefinitions("*,Auto")
            };
            top.Children.Add(profile);
            Grid.SetColumn(plus, 1);
            plus.HorizontalAlignment = HorizontalAlignment.Right;
            top.Children.Add(plus);
            header.Children.Add(top);
            header.Children.Add(search);
        }

        bar.Child = header;
        Children.Add(bar);
        Grid.SetRow(banner, 1);
        banner.IsVisible = false;
        banner.Pressed += (_, _) =>
            controller.OpenSidebarPage(SidebarPage.Encryption);
        Children.Add(banner);

        var list = new StackPanel();
        list.Children.Add(new Border {
            Height = Rail ? 0 : 4
        });
        list.Children.Add(rows);
        list.Children.Add(messageHits);
        list.Children.Add(empty);
        list.Children.Add(new Border {
            Height = 4
        });
        var scroller = new ScrollViewer {
            Content = list,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            // Hidden at rest, and over the content when it shows: the
            // left pane keeps its width.
            AllowAutoHide = true,
        };
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);

        ticker.Tick += (_, _) => {
            var now = this.time.GetUtcNow();
            if (day != now.LocalDateTime.Date)
                Apply();
            UpdateJoining(now);
        };
        AttachedToVisualTree += (_, _) =>
            ticker.IsEnabled = controller.Store.Value.Joining.Count > 0;
        DetachedFromVisualTree += (_, _) => ticker.Stop();
        Lifetime.Stop(this, ticker);
        plus.Click += (_, _) => OpenAddMenu();
        search.TextChanged += (_, _) => Apply();
        Lifetime.OwnAll(this, addMenu, prompt, People, RowMenu);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    /// <summary>Only the pictures, in the narrow strip.</summary>
    public bool Rail { get; }

    public StackPanel Rows => rows;
    public SearchField Search => search;

    public Menu AddMenu => addMenu;
    public PromptDialog Prompt => prompt;
    public PeoplePicker People { get; }

    /// <summary>The plus menu: a new chat, a new group, or joining a room.</summary>
    public void OpenAddMenu()
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        addMenu.AlignRight = !Rail;
        addMenu.Show(
            plus,
            window,
            [
                new MenuItem(controller.T("newChat"), () => People.Show(window,
                    ThemeScope.GetColors(this),
                    controller.T("newChat"), controller.T("newChat.body"),
                    false, _ => controller.T("newChat"),
                    v => controller.StartDirectChat(v[0])), Icon: "user"),
                new MenuItem(controller.T("newGroup"), () => Ask(window,
                        "newGroup",
                        [
                            new PromptField(controller.T("groupName"), "users"),
                            new PromptField(controller.T("userIdPlaceholder"),
                                "user",
                                true)
                        ],
                        controller.T("create"),
                        v => controller.CreateGroup(v[0],
                            v[1].Length == 0
                                ? []
                                : v[1].Split([',', ' '],
                                    StringSplitOptions.RemoveEmptyEntries))),
                    Icon: "users"),
                .. controller.CanManageSpaces
                    ? [
                        new MenuItem(controller.T("newSpace"), () => Ask(window,
                            "space.new",
                            [
                                new PromptField(controller.T("space.name"),
                                    "users")
                            ],
                            controller.T("create"),
                            v => controller.CreateSpace(v[0])), Icon: "users")
                    ]
                    : Array.Empty<MenuItem>(),
                new MenuItem(controller.T("joinRoom"), () => Ask(window,
                    "joinRoom",
                    [new PromptField(controller.T("roomIdOrAlias"), "hash")],
                    controller.T("join"),
                    v => controller.JoinRoom(v[0])), Icon: "hash"),
                new MenuItem(controller.T("explore"),
                    () => controller.OpenSidebarPage(SidebarPage.Explore),
                    Icon: "globe"),
            ]
        );
    }

    private void Ask(TopLevel window, string key,
        IReadOnlyList<PromptField> fields, string confirm,
        Func<IReadOnlyList<string>, Task> run)
    {
        prompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale, controller.T(key),
            controller.T(key + ".body"),
            fields, confirm, run);
    }


    /// <summary>The preview line of a row (<c>previewOf</c>).</summary>
    public static string PreviewOf(RoomSummary room,
        Translate t)
    {
        if (room.Invite)
            return t("invite.from", ("name", room.Inviter!));
        if (room.LastMessage == null)
            return t("noMessages");
        // Each run of white space is one space: no array, no pieces, and the
        // text itself when it is clean already.
        var body = Snippet.Collapse(room.LastMessage);
        if (room.LastIsLine)
            return body;
        if (room.LastSender == null)
            return $"{t("you")}: {body}";
        return room.IsDirect ? body : $"{room.LastSender}: {body}";
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var before = applied;
        var now = time.GetUtcNow();
        var query = Rail ? "" : search.Text.Trim();
        var language = before?.Locale != s.Locale;
        var font = before?.Prefs.Font != s.Prefs.Font;
        var dates = day != now.LocalDateTime.Date;
        var theme = colors != c;
        var roomsChanged = !ReferenceEquals(before?.Rooms, s.Rooms);
        var joiningChanged = !ReferenceEquals(before?.Joining, s.Joining);
        var layout = roomsChanged || joiningChanged || filter != query ||
                     before?.JoinError != s.JoinError ||
                     before?.RoomsSettled != s.RoomsSettled;
        applied = s;
        colors = c;
        filter = query;
        day = now.LocalDateTime.Date;

        if (before == null || theme || language || font ||
            before.Profile != s.Profile || before.UserId != s.UserId ||
            before.SyncState != s.SyncState || before.Security != s.Security)
            ApplyHeader(s, before, c, font);

        // A timeline, typing or notice update does not walk the room list.
        if (roomsChanged || language || font || dates) {
            foreach (var room in s.Rooms) {
                var added = !roomRows.TryGetValue(room.Id, out var entry);
                if (added) {
                    entry = MakeRow(room);
                    roomRows.Add(room.Id, entry);
                }

                UpdateRow(entry!, room, s, now, added, language, font, dates);
            }

            if (roomsChanged) {
                var kept = s.Rooms.Select(r => r.Id).ToHashSet();
                foreach (var id in roomRows.Keys.Where(id => !kept.Contains(id))
                             .ToArray())
                    roomRows.Remove(id);
            }
        }

        if (before?.SelectedRoomId != s.SelectedRoomId) {
            Select(before?.SelectedRoomId, false);
            Select(s.SelectedRoomId, true);
        }

        if (joiningChanged) {
            var kept = s.Joining.Select(j => j.Id).ToHashSet();
            foreach (var id in joiningRows.Keys.Where(id => !kept.Contains(id))
                         .ToArray())
                joiningRows.Remove(id);
            foreach (var joining in s.Joining) {
                if (!joiningRows.ContainsKey(joining.Id))
                    joiningRows.Add(joining.Id, new RoomRow {
                        RoomId = joining.Id,
                        Compact = Rail,
                        Pictures = controller.Pictures,
                        IsEnabled = false,
                    });
            }

            ticker.IsEnabled = s.Joining.Count > 0 &&
                               TopLevel.GetTopLevel(this) != null;
        }

        if (joiningChanged || language || font)
            UpdateJoining(now, font);

        if (layout) {
            var wanted = new List<Control>();
            var failed = s.JoinError;
            if (failed != null && !Rail)
                wanted.Add(JoinFailure(c, failed));
            foreach (var joining in s.Joining)
                wanted.Add(joiningRows[joining.Id]);
            foreach (var room in s.Rooms) {
                if (query.Length == 0 || room.Name.Contains(query,
                        StringComparison.CurrentCultureIgnoreCase))
                    wanted.Add(roomRows[room.Id].Row);
            }

            if (!s.RoomsSettled && s.Rooms.Count == 0 && query.Length == 0) {
                skeletons ??= Enumerable.Range(0, 12)
                    .Select(i => new RoomRowSkeleton(i, Rail)).ToArray();
                wanted.AddRange(skeletons);
            }

            Reconcile(wanted);
        }

        var searchMessages = query.Length >= 2 && controller.CanSearchMessages;
        if (layout || theme || language || font || before == null ||
            before.SyncState != s.SyncState) {
            ApplySearch(query, searchMessages, c, language || font);
            var loading = !s.RoomsSettled && s.Rooms.Count == 0 &&
                          query.Length == 0;
            empty.IsVisible = !rows.Children.OfType<RoomRow>()
                                  .Any(r => r.IsEnabled) && !searchMessages &&
                              s.SyncState == SyncState.Syncing && !Rail &&
                              !loading;
            empty.Text =
                controller.T(query.Length > 0 ? "noResults" : "noChats");
            empty.Foreground = new SolidColorBrush(c.TextSecondary);
            empty.FontFamily = Fonts.System;
            if (joinFailure != null) {
                joinFailure.Foreground = new SolidColorBrush(c.Danger);
                joinFailure.FontFamily = Fonts.System;
            }
        }
    }

    private void ApplyHeader(AppState s, AppState? before, ColorTokens c,
        bool font)
    {
        Background = new SolidColorBrush(c.Bg);
        if (s.SyncState == SyncState.Syncing)
            connectedOnce = true;
        search.Placeholder = controller.T("search");
        search.IsVisible = !Rail;
        name.Foreground = new SolidColorBrush(c.Text);
        name.FontFamily = Fonts.System;
        var me = s.UserId ?? "";
        var shown = s.Profile?.DisplayName is { Length: > 0 } dn
            ? dn
            : me.TrimStart('@').Split(':')[0];
        var size = Rail ? 44 : 34;
        if (before == null || font || before.UserId != s.UserId ||
            (before.Profile == null) != (s.Profile == null) ||
            before.Profile?.DisplayName != s.Profile?.DisplayName ||
            before.Profile?.AvatarUrl != s.Profile?.AvatarUrl) {
            if (s.Profile == null) {
                avatarHolder.Child = new Pulse {
                    Children = {
                        new SkeletonBlock(size, size, true)
                    }
                };
            } else {
                var mine = new Avatar(me, shown.Length == 0 ? "?" : shown,
                    size);
                controller.Pictures.Attach(mine, s.Profile.AvatarUrl, size);
                avatarHolder.Child = mine;
            }
        }

        var waiting = s.SyncState == SyncState.Syncing && s.Profile == null;
        name.Text = s.SyncState == SyncState.Syncing || !connectedOnce
            ? shown
            : controller.T("connecting");
        name.IsVisible = !Rail && !waiting;
        nameSkeleton.IsVisible = !Rail && waiting;
        Avalonia.Automation.AutomationProperties.SetName(profile,
            controller.T("profile"));
        // The notice to set up or to verify the encryption, above the chats;
        // not in the strip.
        var needs = s.Security is SecurityState.NeedsSetup
            or SecurityState.NeedsRecovery;
        banner.IsVisible = needs && !Rail;
        if (needs)
            banner.Set(
                controller.T(s.Security == SecurityState.NeedsSetup
                    ? "sec.banner.setup"
                    : "sec.banner.recovery"),
                controller.T(s.Security == SecurityState.NeedsSetup
                    ? "sec.action.setup"
                    : "sec.action.verify"));
        bar.Padding = Rail
            ? new Thickness(0, 10, 0, 0)
            : new Thickness(12, 10, 12, 8);
        Avalonia.Automation.AutomationProperties.SetName(plus,
            controller.T("newChat.menu"));
    }

    private void Select(string? id, bool selected)
    {
        if (id == null || !roomRows.TryGetValue(id, out var entry) ||
            entry.Row.Selected == selected)
            return;
        entry.Row.Selected = selected;
        entry.Row.Update();
    }

    // Keep controls in place when their order is unchanged; a moved chat keeps
    // its subtree and loaded picture too.
    private void Reconcile(IReadOnlyList<Control> wanted)
    {
        var kept = wanted.ToHashSet();
        var attached = rows.Children.ToHashSet();
        for (var i = rows.Children.Count - 1; i >= 0; i--) {
            if (!kept.Contains(rows.Children[i]))
                rows.Children.RemoveAt(i);
        }

        for (var i = 0; i < wanted.Count; i++) {
            if (i < rows.Children.Count && rows.Children[i] == wanted[i])
                continue;
            if (attached.Contains(wanted[i]))
                rows.Children.Move(rows.Children.IndexOf(wanted[i]), i);
            else
                rows.Children.Insert(i, wanted[i]);
        }
    }

    private void ApplySearch(string query, bool active, ColorTokens c,
        bool presentation)
    {
        if (active && hits == null) {
            hits = new MessageResultsView(controller, null, true);
            Lifetime.Own(this, hits);
            messagesLabel = new TextBlock {
                FontSize = 13,
                FontWeight = FontWeight.SemiBold,
                Margin = new Thickness(20, 12, 20, 4),
            };
            messageHits.Children.Add(messagesLabel);
            messageHits.Children.Add(hits);
        }

        messageHits.IsVisible = active;
        hits?.SetTerm(active ? query : "");
        if (active && presentation)
            hits?.RefreshPresentation();
        if (messagesLabel != null) {
            messagesLabel.Text = controller.T("search.messages");
            messagesLabel.Foreground = new SolidColorBrush(c.TextSecondary);
            messagesLabel.FontFamily = Fonts.System;
        }
    }

    private readonly Avalonia.Threading.DispatcherTimer ticker = new() {
        Interval = TimeSpan.FromSeconds(1)
    };

    /// <summary>Only waiting rows need the elapsed seconds on each tick.</summary>
    private void UpdateJoining(DateTimeOffset time, bool font = false)
    {
        foreach (var joining in controller.Store.Value.Joining) {
            if (!joiningRows.TryGetValue(joining.Id, out var row))
                continue;
            var seconds = Math.Max(0, (int)(time - joining.Since).TotalSeconds);
            var preview =
                $"{controller.T("explore.joining.item")} ({seconds}s)";
            if (!font && row.Title == joining.Name && row.Preview == preview &&
                row.AvatarUrl == joining.AvatarUrl)
                continue;
            row.Title = joining.Name;
            row.Preview = preview;
            row.AvatarUrl = joining.AvatarUrl;
            row.Update();
        }
    }

    /// <summary>Why a join failed; a press dismisses it.</summary>
    private Control JoinFailure(ColorTokens c, string message)
    {
        if (joinFailure == null) {
            joinFailure = new TextBlock {
                FontSize = 14,
                FontFamily = Fonts.System,
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(18, 6),
            };
            joinFailure.PointerPressed += (_, _) =>
                controller.DismissJoinError();
        }

        joinFailure.Text = message;
        joinFailure.Foreground = new SolidColorBrush(c.Danger);
        return joinFailure;
    }

    public Menu RowMenu { get; } = new();

    /// <summary>The menu of a chat: pin, mute, and the unread mark.</summary>
    public void OpenRowMenu(Control anchor, RoomSummary room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var unread = room.MarkedUnread || room.UnreadCount > 0;
        RowMenu.Show(
            anchor,
            window,
            [
                new MenuItem(controller.T(room.Pinned ? "unpin" : "pin"),
                    () => _ = controller.SetPinned(room.Id, !room.Pinned),
                    Icon: "pin"),
                new MenuItem(controller.T(room.Muted ? "unmute" : "mute"),
                    () => _ = controller.SetRoomMuted(room.Id, !room.Muted),
                    Icon: room.Muted ? "bell" : "bellOff"),
                unread
                    ? new MenuItem(controller.T("markRead"),
                        () => _ = controller.MarkRoomRead(room.Id),
                        Icon: "mailUnread")
                    : new MenuItem(controller.T("markUnread"),
                        () => _ = controller.SetMarkedUnread(room.Id, true),
                        Icon: "mailUnread"),
            ]
        );
    }

    private RoomEntry MakeRow(RoomSummary room)
    {
        var row = new RoomRow {
            RoomId = room.Id,
            Compact = Rail,
            Pictures = controller.Pictures,
        };
        var entry = new RoomEntry(room, row);
        // A reused row must act on the latest summary, not the one that made it.
        row.MenuRequested += (_, _) => {
            if (!entry.Room.Invite)
                OpenRowMenu(row, entry.Room);
        };
        row.Click += (_, _) => {
            var current = entry.Room;
            if (current.Invite)
                return;
            if (current.IsSpace)
                controller.OpenSpace(current.Id);
            else
                controller.SelectRoom(current.Id);
        };
        return entry;
    }

    private void UpdateRow(RoomEntry entry, RoomSummary room, AppState s,
        DateTimeOffset now, bool added, bool language, bool font, bool dates)
    {
        var old = entry.Room;
        var row = entry.Row;
        entry.Room = room;
        var preview = row.Preview;
        if (added || language || old.Inviter != room.Inviter ||
            old.LastMessage != room.LastMessage ||
            old.LastSender != room.LastSender ||
            old.LastIsLine != room.LastIsLine || old.IsDirect != room.IsDirect)
            preview = PreviewOf(room,
                controller.T);
        var at = row.Time;
        if (added || language || dates ||
            old.LastActivityTs != room.LastActivityTs)
            at = Format.ListTime(room.LastActivityTs, now, s.Locale);
        var selected = s.SelectedRoomId == room.Id;
        var invitation = added || language || old.Invite != room.Invite;
        if (!added && !font && !invitation && row.Title == room.Name &&
            row.Preview == preview && row.Time == at &&
            row.Unread == room.UnreadCount && row.Selected == selected &&
            row.Pinned == room.Pinned &&
            row.MarkedUnread == room.MarkedUnread &&
            row.Muted == room.Muted && row.IsSpace == room.IsSpace &&
            row.AvatarUrl == room.AvatarUrl)
            return;
        row.Title = room.Name;
        row.Preview = preview;
        row.Time = at;
        row.Unread = room.UnreadCount;
        row.Selected = selected;
        row.Pinned = room.Pinned;
        row.MarkedUnread = room.MarkedUnread;
        row.Muted = room.Muted;
        row.IsSpace = room.IsSpace;
        row.AvatarUrl = room.AvatarUrl;
        if (invitation) {
            row.Invite = room.Invite
                ? (controller.T("accept"), controller.T("decline"),
                    () => _ = controller.AcceptInvite(room.Id),
                    () => _ = controller.DeclineInvite(room.Id))
                : null;
        }

        row.Update();
    }
}
