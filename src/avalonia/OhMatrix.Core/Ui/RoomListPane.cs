using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;

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

    private readonly Border profile = new() {
        CornerRadius = new CornerRadius(10),
        Padding = new Thickness(4, 2),
        Background = Brushes.Transparent,
        Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand),
        HorizontalAlignment = HorizontalAlignment.Left,
    };

    private readonly Border avatarHolder = new();
    private readonly SearchField search = new();
    private readonly StackPanel rows = new();
    private readonly StackPanel messageHits = new();
    private MessageResultsView? hits;

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

    public RoomListPane(AppController controller, bool rail = false, TimeProvider? time = null)
    {
        this.controller = controller;
        People = new PeoplePicker(controller);
        this.time = time ?? TimeProvider.System;
        Rail = rail;
        plus = new IconButton("plus", "New", rail ? 28 : 24, rail ? 44 : 36);
        RowDefinitions = new RowDefinitions("Auto,*");
        var header = new StackPanel {
            Spacing = 10
        };
        var top = new Grid {
            Height = 44,
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        var line = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 10
        };
        line.Children.Add(avatarHolder);
        line.Children.Add(name);
        line.Children.Add(nameSkeleton);
        profile.Child = line;
        profile.PointerPressed += (_, e) => {
            e.Handled = true;
            controller.OpenSidebarPage(SidebarPage.Profile);
        };
        top.Children.Add(profile);
        Grid.SetColumn(plus, 1);
        plus.HorizontalAlignment = HorizontalAlignment.Right;
        top.Children.Add(plus);
        header.Children.Add(top);
        header.Children.Add(search);
        bar.Child = header;
        Children.Add(bar);

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
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);

        ticker.Tick += (_, _) => Apply();
        plus.Click += (_, _) => OpenAddMenu();
        search.TextChanged += (_, _) => Apply();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<RoomListPane>((p, _) => p.Apply());
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
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        addMenu.AlignRight = !Rail;
        addMenu.Show(
            plus,
            window,
            [
                new MenuItem(T("newChat"), () => People.Show(window, ThemeScope.GetColors(this),
                    T("newChat"), T("newChat.body"), false, _ => T("newChat"),
                    v => controller.StartDirectChat(v[0])), Icon: "user"),
                new MenuItem(T("newGroup"), () => Ask(window, "newGroup",
                        [
                            new PromptField(T("groupName"), "users"),
                            new PromptField(T("userIdPlaceholder"), "user", true)
                        ],
                        T("create"),
                        v => controller.CreateGroup(v[0],
                            v[1].Length == 0
                                ? []
                                : v[1].Split([',', ' '], StringSplitOptions.RemoveEmptyEntries))),
                    Icon: "users"),
                .. controller.CanManageSpaces
                    ? [new MenuItem(T("newSpace"), () => Ask(window, "space.new",
                        [new PromptField(T("space.name"), "users")], T("create"),
                        v => controller.CreateSpace(v[0])), Icon: "users")]
                    : Array.Empty<MenuItem>(),
                new MenuItem(T("joinRoom"), () => Ask(window, "joinRoom",
                    [new PromptField(T("roomIdOrAlias"), "hash")], T("join"),
                    v => controller.JoinRoom(v[0])), Icon: "hash"),
                new MenuItem(T("explore"), () => controller.OpenSidebarPage(SidebarPage.Explore),
                    Icon: "globe"),
            ]
        );
    }

    private void Ask(TopLevel window, string key, IReadOnlyList<PromptField> fields, string confirm,
        Func<IReadOnlyList<string>, Task> run)
    {
        prompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale, T(key),
            T(key + ".body"),
            fields, confirm, run);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    /// <summary>The preview line of a row (<c>previewOf</c>).</summary>
    public static string PreviewOf(RoomSummary room, Func<string, (string, object)[], string> t)
    {
        if (room.Invite)
            return t("invite.from", [("name", room.Inviter!)]);
        if (room.LastMessage is null)
            return t("noMessages", []);
        var body = string.Join(" ",
            room.LastMessage.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (room.LastIsLine)
            return body;
        if (room.LastSender is null)
            return $"{t("you", [])}: {body}";
        return room.IsDirect ? body : $"{room.LastSender}: {body}";
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        if (s.SyncState == SyncState.Syncing)
            connectedOnce = true;
        search.Placeholder = T("search");
        search.IsVisible = !Rail;
        name.Foreground = new SolidColorBrush(c.Text);
        var me = s.UserId ?? "";
        var shown = s.Profile?.DisplayName is { Length: > 0 } dn
            ? dn
            : me.TrimStart('@').Split(':')[0];
        var size = Rail ? 44 : 34;
        if (s.Profile is null) {
            avatarHolder.Child = new Pulse {
                Children = {
                    new SkeletonBlock(size, size, true)
                }
            };
        } else {
            var mine = new Avatar(me, shown.Length == 0 ? "?" : shown, size);
            controller.Pictures.Attach(mine, s.Profile.AvatarUrl, size);
            avatarHolder.Child = mine;
        }

        var waiting = s.SyncState == SyncState.Syncing && s.Profile is null;
        name.Text = s.SyncState == SyncState.Syncing || !connectedOnce ? shown : T("connecting");
        name.IsVisible = !Rail && !waiting;
        nameSkeleton.IsVisible = !Rail && waiting;
        Avalonia.Automation.AutomationProperties.SetName(profile, T("profile"));
        bar.Padding = Rail ? new Thickness(6, 10, 6, 0) : new Thickness(12, 10, 12, 8);
        Avalonia.Automation.AutomationProperties.SetName(plus, T("newChat.menu"));

        var query = Rail ? "" : search.Text.Trim();
        var shownRooms = query.Length == 0
            ? s.Rooms
            : s.Rooms.Where(r => r.Name.Contains(query, StringComparison.CurrentCultureIgnoreCase))
                .ToList();
        rows.Children.Clear();
        var now = time.GetUtcNow();
        if (s.JoinError is { } failed && !Rail)
            rows.Children.Add(JoinFailure(c, failed));
        foreach (var joining in s.Joining)
            rows.Children.Add(JoiningRow(joining, s, now));
        ticker.IsEnabled = s.Joining.Count > 0;
        foreach (var room in shownRooms)
            rows.Children.Add(MakeRow(room, s, now));
        // Until the first load is over, grey rows stand where the chats will be.
        var loading = !s.RoomsSettled && s.Rooms.Count == 0 && query.Length == 0;
        if (loading) {
            for (var i = 0; i < 12; i++)
                rows.Children.Add(new RoomRowSkeleton(i, Rail));
        }

        // The messages with the typed words come under the chats, as in the React Native list.
        var searchMessages = query.Length >= 2 && controller.CanSearchMessages;
        messageHits.Children.Clear();
        if (searchMessages) {
            hits ??= new MessageResultsView(controller, null, true);
            hits.SetTerm(query);
            messageHits.Children.Add(new TextBlock {
                Text = T("search.messages"),
                FontSize = 13,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                Margin = new Thickness(20, 12, 20, 4),
            });
            messageHits.Children.Add(hits);
        } else
            hits?.SetTerm("");
        empty.IsVisible = shownRooms.Count == 0 && !searchMessages && s.SyncState == SyncState.Syncing && !Rail
                          && !loading;
        empty.Text = T(query.Length > 0 ? "noResults" : "noChats");
        empty.Foreground = new SolidColorBrush(c.TextSecondary);
    }

    private readonly Avalonia.Threading.DispatcherTimer ticker = new() {
        Interval = TimeSpan.FromSeconds(1)
    };

    /// <summary>The row of a room still being joined, with the seconds it has taken.</summary>
    private RoomRow JoiningRow(JoiningRoom joining, AppState s, DateTimeOffset now)
    {
        var seconds = Math.Max(0, (int)(now - joining.Since).TotalSeconds);
        var row = new RoomRow {
            RoomId = joining.Id,
            Title = joining.Name,
            Preview = $"{T("explore.joining.item")} ({seconds}s)",
            Compact = Rail,
            AvatarUrl = joining.AvatarUrl,
            Pictures = controller.Pictures,
            IsEnabled = false,
        };
        row.Update();
        return row;
    }

    /// <summary>Why a join failed; a press dismisses it.</summary>
    private Control JoinFailure(ColorTokens c, string message)
    {
        var text = new TextBlock {
            Text = message,
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Danger),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(18, 6),
        };
        text.PointerPressed += (_, _) => controller.DismissJoinError();
        return text;
    }

    public Menu RowMenu { get; } = new();

    /// <summary>The menu of a chat: pin, mute, and the unread mark.</summary>
    public void OpenRowMenu(Control anchor, RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var unread = room.MarkedUnread || room.UnreadCount > 0;
        RowMenu.Show(
            anchor,
            window,
            [
                new MenuItem(T(room.Pinned ? "unpin" : "pin"),
                    () => _ = controller.SetPinned(room.Id, !room.Pinned), Icon: "pin"),
                new MenuItem(T(room.Muted ? "unmute" : "mute"),
                    () => _ = controller.SetRoomMuted(room.Id, !room.Muted),
                    Icon: room.Muted ? "bell" : "bellOff"),
                unread
                    ? new MenuItem(T("markRead"), () => _ = controller.MarkRoomRead(room.Id),
                        Icon: "mailUnread")
                    : new MenuItem(T("markUnread"),
                        () => _ = controller.SetMarkedUnread(room.Id, true),
                        Icon: "mailUnread"),
            ]
        );
    }

    private RoomRow MakeRow(RoomSummary room, AppState s, DateTimeOffset now)
    {
        var row = new RoomRow {
            RoomId = room.Id,
            Title = room.Name,
            Preview = PreviewOf(room, (key, values) => T(key, values)),
            Time = Format.ListTime(room.LastActivityTs, now, s.Locale),
            Unread = room.UnreadCount,
            Selected = s.SelectedRoomId == room.Id,
            Pinned = room.Pinned,
            MarkedUnread = room.MarkedUnread,
            Muted = room.Muted,
            IsSpace = room.IsSpace,
            Compact = Rail,
            AvatarUrl = room.AvatarUrl,
            Pictures = controller.Pictures,
        };
        if (room.Invite) {
            row.Invite = (T("accept"), T("decline"), () => _ = controller.AcceptInvite(room.Id),
                () => _ = controller.DeclineInvite(room.Id));
        } else
            row.MenuRequested += (_, _) => OpenRowMenu(row, room);

        row.Click += (_, _) => {
            if (room.Invite)
                return;
            if (room.IsSpace)
                controller.OpenSpace(room.Id);
            else
                controller.SelectRoom(room.Id);
        };
        row.Update();
        return row;
    }
}
