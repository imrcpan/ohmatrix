using Avalonia.Input.Platform;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui;

/// <summary>
/// A space (<c>SpaceScreen</c>), as far as it is ported: a bar with Back to the chats and the name of the space, and the rooms it lists with their
/// picture, count and description. A room already joined opens (a space opens as a space), one not joined asks whether to join it.
/// </summary>
public sealed class SpacePage : Grid {
    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel rows = new();
    private readonly PromptDialog confirm = new();
    private readonly SearchField search = new();
    private IconButton? more;
    private IReadOnlyList<SpaceChild>? children;
    private string? loadedFor;
    private int ticket;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SpacePage()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SpacePage>((p, _) =>
            p.Apply());
    }

    public SpacePage(AppController controller)
    {
        this.controller = controller;
        RowDefinitions = new RowDefinitions("Auto,Auto,*");
        Children.Add(bar);
        search.Margin = new Thickness(12, 6, 12, 8);
        Grid.SetRow(search, 1);
        Children.Add(search);
        search.TextChanged += (_, _) => Apply();
        var scroller = new ScrollViewer {
            Content = rows,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
            // Hidden at rest, and over the content when it shows: the
            // left pane keeps its width.
            AllowAutoHide = true,
        };
        Grid.SetRow(scroller, 2);
        Children.Add(scroller);
        Lifetime.OwnAll(this, confirm, SpaceMenu, RoomMenu, SpaceDialog);
        Lifetime.Watch(this, controller, _ => Apply());
        Apply();
    }

    public PromptDialog Confirm => confirm;

    /// <summary>The rooms shown, in the order the space lists them.</summary>
    public IReadOnlyList<SpaceChild> Children_ => children ?? [];


    /// <summary>Asks the engine for the rooms of the open space again.</summary>
    public async Task Reload()
    {
        var id = controller.Store.Value.OpenSpaceId;
        if (id == null)
            return;
        var mine = ++ticket;
        loadedFor = id;
        IReadOnlyList<SpaceChild> found = [];
        try {
            found = await controller.SpaceChildren(id);
        } catch (Exception) {
            // The list stays empty; opening the space again asks again.
        }

        if (mine != ticket)
            return;
        children = found;
        Apply();
    }

    /// <summary>Asks whether to join a room of the space, and joins it.</summary>
    public void AskJoin(SpaceChild room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var public_ = new PublicRoom(room.RoomId, room.Name, room.Topic, null,
            room.AvatarUrl,
            room.Members);
        Card.Show(window, public_, () => _ = JoinChild(room));
    }

    private RoomCardDialog? card;

    public RoomCardDialog Card {
        get {
            if (card == null) {
                card = new RoomCardDialog(controller);
                Lifetime.Own(this, card);
            }

            return card;
        }
    }

    private async Task JoinChild(SpaceChild room)
    {
        Ops.Start("join room", room.RoomId);
        controller.ShowNotice(
            controller.T("explore.joining", ("name", room.Name)),
            NoticeKind.Progress);
        try {
            await controller.JoinRoom(room.RoomId);
            Ops.Done("join room", room.RoomId);
            controller.OpenSidebarPage(SidebarPage.Chats);
            controller.ShowNotice(controller.T("explore.joined",
                ("name", room.Name)));
        } catch (Exception e) {
            Ops.Fail("join room", e, room.RoomId);
            controller.ShowNotice(e.Message, NoticeKind.Error);
        }
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        var open = s.SidebarPage == SidebarPage.Space &&
                   s.OpenSpaceId != null;
        if (open && loadedFor != s.OpenSpaceId) {
            children = null;
            _ = Reload();
        } else if (!open)
            loadedFor = null;

        Background = new SolidColorBrush(c.Bg);
        var space = s.Rooms.FirstOrDefault(r => r.Id == s.OpenSpaceId);
        PageBar.Fill(bar, c, space?.Name ?? controller.T("space"),
            controller.T("chats"),
            () => controller.OpenSidebarPage(SidebarPage.Chats));
        bar.BorderBrush = new SolidColorBrush(c.Separator);
        bar.BorderThickness = new Thickness(0, 0, 0, 1);
        bar.Height = 56;
        more = new IconButton("more", controller.T("more"), 22) {
            Tint = c.TextSecondary,
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 8, 0),
        };
        more.Click += (_, _) => OpenMenu();
        // PageBar.Fill has just made the row of the bar; it goes into a grid with the button beside it.
        var title = bar.Child!;
        bar.Child = null;
        var barRow = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        barRow.Children.Add(title);
        if (controller.CanManageSpaces) {
            Grid.SetColumn(more, 1);
            barRow.Children.Add(more);
        }

        bar.Child = barRow;
        search.Placeholder = controller.T("search");
        rows.Children.Clear();
        if (children == null) {
            rows.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        if (children.Count == 0) {
            rows.Children.Add(new TextBlock {
                Text = controller.T("space.empty"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        var query = search.Text.Trim();
        var shown = children.Where(ch => query.Length == 0
                                         || ch.Name.Contains(query,
                                             StringComparison
                                                 .CurrentCultureIgnoreCase))
            .ToList();
        if (shown.Count == 0) {
            rows.Children.Add(new TextBlock {
                Text = controller.T("noResults"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        foreach (var child in shown)
            rows.Children.Add(Row(c, child,
                s.Rooms.Any(r => r.Id == child.RoomId && !r.Invite)));
    }

    public Menu SpaceMenu { get; } = new();
    public Menu RoomMenu { get; } = new();
    public Dialog SpaceDialog { get; } = new();
    public PeoplePicker Invite { get; private set; } = null!;

    private string? OpenId => controller.Store.Value.OpenSpaceId;

    /// <summary>The menu of the space: make or add a room, manage the rooms, members, invite, share, settings and leave.</summary>
    public void OpenMenu()
    {
        var window = TopLevel.GetTopLevel(this);
        var id = OpenId;
        if (window == null || more == null || id == null)
            return;
        var space =
            controller.Store.Value.Rooms.FirstOrDefault(r => r.Id == id);
        SpaceMenu.AlignRight = true;
        SpaceMenu.Show(more, window, [
            new MenuItem(controller.T("space.createRoom"),
                () => AskCreateRoom(id),
                Icon: "plus"),
            new MenuItem(controller.T("space.addRoom"),
                () => _ = AskAddRoom(id),
                Icon: "chat"),
            new MenuItem(controller.T("space.manageRooms"),
                () => _ = AskManage(id),
                Icon: "edit"),
            new MenuItem(controller.T("space.members"), () => OpenInfo(id),
                Icon: "users"),
            new MenuItem(controller.T("space.invite"), () => AskInvite(id),
                Icon: "userPlus"),
            new MenuItem(controller.T("space.share"),
                () => AskShare(id, space?.Name ?? ""), Icon: "hash"),
            new MenuItem(controller.T("space.settings"), () => OpenInfo(id),
                Icon: "gear"),
            new MenuItem(controller.T("space.leave"), () => AskLeave(id),
                Icon: "signOut",
                Danger: true),
        ]);
    }

    /// <summary>The members and settings of the space, in the info panel the rooms have.</summary>
    public void OpenInfo(string id)
    {
        controller.SelectRoom(id);
        controller.OpenRoomInfo(true);
    }

    private void AskCreateRoom(string id)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        confirm.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("space.createRoom"), controller.T("newGroup.body"),
            [new PromptField(controller.T("groupName"), "users")],
            controller.T("create"), async v => {
                await controller.CreateRoomInSpace(id, v[0]);
                await Reload();
            });
    }

    /// <summary>Rooms I am in that are not in the space yet, to pick one and list it.</summary>
    public async Task AskAddRoom(string id)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var listed = (await controller.SpaceChildren(id))
            .Select(ch => ch.RoomId).ToHashSet();
        var candidates = controller.Store.Value.Rooms
            .Where(r =>
                !r.Invite && !r.IsSpace && !r.IsDirect &&
                !listed.Contains(r.Id))
            .OrderBy(r => r.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        var c = ThemeScope.GetColors(this);
        var list = new StackPanel();
        if (candidates.Count == 0)
            list.Children.Add(new TextBlock {
                Text = controller.T("space.noCandidates"),
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(12),
            });
        foreach (var room in candidates) {
            var line = PickRow(c, room.Name, false);
            var target = room;
            line.PointerPressed += async (_, e) => {
                e.Handled = true;
                list.Children.Remove(line);
                await controller.AddSpaceChild(id, target.Id);
                await Reload();
            };
            list.Children.Add(line);
        }

        var close = new TextButton {
            Title = controller.T("close")
        };
        ThemeScope.SetColors(close, c);
        close.Click += (_, _) => SpaceDialog.Close();
        SpaceDialog.Show(window, c, controller.T("space.addRoom"), null,
            new ScrollViewer {
                Content = list,
                MaxHeight = 320
            }, close);
    }

    /// <summary>Tick rooms and take them out of the space.</summary>
    public async Task AskManage(string id)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var listed = await controller.SpaceChildren(id);
        var c = ThemeScope.GetColors(this);
        var picked = new HashSet<string>();
        var list = new StackPanel();
        var remove = new PrimaryButton {
            Title = controller.T("space.removeRooms", ("n", 0)),
            IsEnabled = false
        };
        foreach (var child in listed) {
            var line = PickRow(c, child.Name, false);
            var target = child;
            line.PointerPressed += (_, e) => {
                e.Handled = true;
                if (!picked.Remove(target.RoomId))
                    picked.Add(target.RoomId);
                remove.Title =
                    controller.T("space.removeRooms", ("n", picked.Count));
                remove.IsEnabled = picked.Count > 0;
                SetChecked(line, picked.Contains(target.RoomId), c);
            };
            list.Children.Add(line);
        }

        if (listed.Count == 0)
            list.Children.Add(new TextBlock {
                Text = controller.T("space.empty"),
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextAlignment = TextAlignment.Center,
                Margin = new Thickness(12),
            });
        var cancel = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(remove, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => SpaceDialog.Close();
        remove.Click += async (_, _) => {
            SpaceDialog.Close();
            foreach (var room in picked)
                await controller.RemoveSpaceChild(id, room);
            await Reload();
        };
        SpaceDialog.Show(window, c, controller.T("space.manageRooms"), null,
            new ScrollViewer {
                Content = list,
                MaxHeight = 320
            }, remove, cancel);
    }

    private static Border PickRow(ColorTokens c, string name, bool on)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = "chat",
            Size = 20,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 10, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = name,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        var row = new Border {
            Height = 44,
            Padding = new Thickness(8, 0),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        SetChecked(row, on, c);
        return row;
    }

    private static void SetChecked(Border row, bool on, ColorTokens c)
    {
        var grid = (Grid)row.Child!;
        grid.Children.OfType<Icon>().Where(i => i.Glyph == "check").ToList()
            .ForEach(i => grid.Children.Remove(i));
        if (!on)
            return;
        var check = new Icon {
            Glyph = "check",
            Size = 20,
            Color = new SolidColorBrush(c.Accent),
        };
        Grid.SetColumn(check, 2);
        grid.Children.Add(check);
    }

    private void AskInvite(string id)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        Invite ??= new PeoplePicker(controller);
        Invite.Show(window, ThemeScope.GetColors(this),
            controller.T("room.invite"),
            controller.T("room.inviteBody"),
            true,
            n => n == 0
                ? controller.T("room.inviteNone")
                : controller.T("room.inviteAction", ("n", n)),
            ids => controller.InviteToRoom(id, ids));
    }

    /// <summary>The link to the space, to copy; an address reads better than the room id, so it is used when there is one.</summary>
    public void AskShare(string id, string name)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var alias = controller.Store.Value.Details?.Aliases.FirstOrDefault();
        var link = "https://matrix.to/#/" + (alias ?? id);
        var copy = new PrimaryButton {
            Title = controller.T("copy")
        };
        var cancel = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(copy, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => SpaceDialog.Close();
        copy.Click += async (_, _) => {
            Ops.Start("copy space link");
            try {
                await window.Clipboard!.SetTextAsync(link);
                Ops.Done("copy space link");
                controller.ShowNotice(controller.T("copied"));
                SpaceDialog.Close();
            } catch (Exception e) {
                Ops.Fail("copy space link", e);
                controller.ShowNotice(controller.T("space.share.failed"),
                    NoticeKind.Error);
            }
        };
        SpaceDialog.Show(window, c, controller.T("space.share.title"),
            controller.T("space.share.body", ("name", name)),
            new Border {
                Padding = new Thickness(12),
                CornerRadius = new CornerRadius(10),
                Background = new SolidColorBrush(c.BgSecondary),
                Child = new SelectableTextBlock {
                    Text = link,
                    FontSize = 14,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Text),
                    TextAlignment = TextAlignment.Center,
                    TextWrapping = TextWrapping.Wrap,
                },
            }, copy, cancel);
    }

    private void AskLeave(string id)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = controller.T("space.leave")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        yes.Click += (_, _) => {
            SpaceDialog.Close();
            _ = controller.LeaveRoom(id);
            controller.OpenSidebarPage(SidebarPage.Chats);
        };
        no.Click += (_, _) => SpaceDialog.Close();
        SpaceDialog.Show(window, c, controller.T("leaveSpace.title"),
            controller.T("leaveSpace.body"),
            yes, no);
    }

    /// <summary>The menu of a room of the space: move it to the top or the bottom, or take it out.</summary>
    public void OpenRoomMenu(Control anchor, SpaceChild child)
    {
        var window = TopLevel.GetTopLevel(this);
        var id = OpenId;
        if (window == null || id == null || !controller.CanManageSpaces)
            return;
        RoomMenu.Show(anchor, window, [
            new MenuItem(controller.T("space.moveFirst"),
                () => _ =
                    Then(controller.MoveSpaceChild(id, child.RoomId, true)),
                Icon: "send"),
            new MenuItem(controller.T("space.moveLast"),
                () => _ =
                    Then(controller.MoveSpaceChild(id, child.RoomId, false)),
                Icon: "signOut"),
            new MenuItem(controller.T("space.removeRoom"),
                () => _ = Then(controller.RemoveSpaceChild(id, child.RoomId)),
                Icon: "close", Danger: true),
        ]);
    }

    private async Task Then(Task change)
    {
        Ops.Start("change space");
        try {
            await change;
            Ops.Done("change space");
        } catch (EngineException e) {
            Ops.Fail("change space", e);
            controller.ShowNotice(
                e.Code == EngineErrorCode.Forbidden
                    ? controller.T("notAllowed")
                    : e.Message,
                NoticeKind.Error);
        }

        await Reload();
    }

    private Control Row(ColorTokens c, SpaceChild child, bool joined)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(12, 8),
        };
        var avatar = new Avatar(child.RoomId, child.Name, 48, child.IsSpace) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, child.AvatarUrl, 48);
        grid.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = child.Name,
            FontSize = 16,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = child.Members == 1
                ? controller.T("member.one")
                : controller.T("explore.members", ("count", child.Members)),
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
        });
        var topic = child.Topic;
        if (topic != null) {
            words.Children.Add(new TextBlock {
                Text = topic,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        }

        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        if (!joined) {
            var tag = new TextBlock {
                Text = controller.T("space.joinToView"),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Accent),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(tag, 2);
            grid.Children.Add(tag);
        }

        var row = new Border {
            Child = grid,
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            if (e.GetCurrentPoint(row).Properties.IsRightButtonPressed) {
                OpenRoomMenu(row, child);
                return;
            }

            if (!joined)
                AskJoin(child);
            else if (child.IsSpace)
                controller.OpenSpace(child.RoomId);
            else {
                controller.OpenSidebarPage(SidebarPage.Chats);
                controller.SelectRoom(child.RoomId);
            }
        };
        Avalonia.Automation.AutomationProperties.SetName(row, child.Name);
        return row;
    }
}
