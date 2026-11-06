using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

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
                new MenuItem(T("joinRoom"), () => Ask(window, "joinRoom",
                    [new PromptField(T("roomIdOrAlias"), "hash")], T("join"),
                    v => controller.JoinRoom(v[0])), Icon: "hash"),
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
        var mine = new Avatar(me, shown.Length == 0 ? "?" : shown, Rail ? 44 : 34);
        controller.Pictures.Attach(mine, s.Profile?.AvatarUrl, Rail ? 44 : 34);
        avatarHolder.Child = mine;
        name.Text = s.SyncState == SyncState.Syncing || !connectedOnce ? shown : T("connecting");
        name.IsVisible = !Rail;
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
        foreach (var room in shownRooms)
            rows.Children.Add(MakeRow(room, s, now));
        empty.IsVisible = shownRooms.Count == 0 && s.SyncState == SyncState.Syncing && !Rail;
        empty.Text = T(query.Length > 0 ? "noResults" : "noChats");
        empty.Foreground = new SolidColorBrush(c.TextSecondary);
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
            if (!room.Invite)
                controller.SelectRoom(room.Id);
        };
        row.Update();
        return row;
    }
}
