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
    private bool connectedOnce;

    public RoomListPane(AppController controller, bool rail = false, TimeProvider? time = null)
    {
        this.controller = controller;
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

        search.TextChanged += (_, _) => Apply();
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<RoomListPane>((p, _) => p.Apply());
        Apply();
    }

    /// <summary>Only the pictures, in the narrow strip.</summary>
    public bool Rail { get; }

    public StackPanel Rows => rows;
    public SearchField Search => search;

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
        var shown = me.TrimStart('@').Split(':')[0];
        avatarHolder.Child = new Avatar(me, shown.Length == 0 ? "?" : shown, Rail ? 44 : 34);
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
        row.Click += (_, _) => {
            if (!room.Invite)
                controller.SelectRoom(room.Id);
        };
        row.Update();
        return row;
    }
}
