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
/// The info panel of a chat (<c>RoomInfoPanel</c>), as far as it is ported: a bar with the title and a close button, the picture, the name and the
/// member count, the topic, and the people of the room, admins first, each with their role.
/// </summary>
public sealed class RoomInfoPanel : Grid {
    public const double Width_ = 320;

    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel content = new();

    public RoomInfoPanel(AppController controller)
    {
        this.controller = controller;
        Invite = new PeoplePicker(controller);
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        controller.Store.Changed += _ => Apply();
        ThemeScope.ColorsProperty.Changed.AddClassHandler<RoomInfoPanel>((p, _) => p.Apply());
        Apply();
    }

    public StackPanel Content => content;
    public PromptDialog EditPrompt { get; } = new();
    public Dialog LeaveDialog { get; } = new();
    public PeoplePicker Invite { get; }
    public Menu MemberMenu { get; } = new();
    public PromptDialog MemberPrompt { get; } = new();
    public TextButton? InviteButton { get; private set; }
    public TextButton? PhotoButton { get; private set; }

    /// <summary>Asks for a picture file and makes it the picture of the room; the path can be given to skip the dialog.</summary>
    public async Task ChangePhoto(RoomSummary room, string? path = null)
    {
        if (path is null) {
            if (TopLevel.GetTopLevel(this) is not { } window)
                return;
            path = await FilePicker.PickImage(window);
        }

        if (path is null)
            return;
        try {
            await controller.SetRoomAvatar(room.Id, path);
        } catch (Exception) {
            // The picture stays as it was; choosing again tries again.
        }
    }

    public TextButton? EditNameButton { get; private set; }
    public TextButton? EditTopicButton { get; private set; }
    public TextButton? LeaveButton { get; private set; }

    /// <summary>Asks for a new group name.</summary>
    public void AskName(RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        EditPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("room.editName"), "", [new PromptField(T("room.editName"), "users")], T("save"),
            v => controller.SetRoomName(room.Id, v[0]));
        EditPrompt.Fields[0].Text = room.Name;
    }

    /// <summary>Asks for a new description.</summary>
    public void AskTopic(RoomSummary room, string? topic)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        EditPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("room.editTopic"), "", [new PromptField(T("room.editTopic"), "info", true)],
            T("save"), v => controller.SetRoomTopic(room.Id, v[0]));
        EditPrompt.Fields[0].Text = topic ?? "";
    }

    /// <summary>The actions on a person of the room: the roles they can be given, removing and banning.</summary>
    public void OpenMemberMenu(Control anchor, RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = new List<MenuItem>();
        foreach (var role in new[] {
                     MemberRole.Admin, MemberRole.Moderator, MemberRole.Member
                 }) {
            if (role == m.Role)
                continue;
            var key = role switch {
                MemberRole.Admin => "makeAdmin",
                MemberRole.Moderator => "makeModerator",
                _ => "makeMember",
            };
            var target = role;
            items.Add(new MenuItem(T(key), () => AskRole(room, m, target), Icon: "user"));
        }

        items.Add(new MenuItem(T("removeMember"), () => AskRemove(room, m), Icon: "trash",
            Danger: true));
        items.Add(new MenuItem(T("ban"), () => AskBan(room, m), Icon: "lock", Danger: true));
        MemberMenu.Show(anchor, window, items);
    }

    /// <summary>Asks before a person is made an admin or moderator; a member is made at once.</summary>
    public void AskRole(RoomSummary room, RoomMemberInfo m, MemberRole role)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        if (role == MemberRole.Member) {
            _ = controller.SetMemberRole(room.Id, m.UserId, role);
            return;
        }

        var name = T(role == MemberRole.Admin ? "role.admin" : "role.moderator");
        var kind = role == MemberRole.Admin ? "admin" : "moderator";
        var body = T($"role.confirm.{kind}.body");
        if (role == MemberRole.Admin)
            body += "\n\n" + T("role.confirm.admin.warn");
        MemberPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T($"role.confirm.{kind}.title"), body, [],
            T("role.confirm.yes", ("role", name.ToLowerInvariant())),
            _ => controller.SetMemberRole(room.Id, m.UserId, role));
    }

    /// <summary>Asks before a person is removed.</summary>
    public void AskRemove(RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        MemberPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("removeMember.title", ("name", m.Name)), T("removeMember.body"), [],
            T("removeMember"), _ => controller.RemoveMember(room.Id, m.UserId));
    }

    /// <summary>Asks before a person is banned, with the reason that may be given.</summary>
    public void AskBan(RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        MemberPrompt.Show(window, ThemeScope.GetColors(this), controller.Store.Value.Locale,
            T("ban.title", ("name", m.Name)), T("ban.body"),
            [new PromptField(T("ban.reason"), "info", true)], T("ban"),
            v => controller.BanMember(room.Id, m.UserId, v[0]));
    }

    /// <summary>Opens the search for people to invite to the room.</summary>
    public void AskInvite(RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        Invite.Show(window, ThemeScope.GetColors(this), T("room.invite"), T("room.inviteBody"),
            true,
            n => n == 0 ? T("room.inviteNone") : T("room.inviteAction", ("n", n)),
            ids => controller.InviteToRoom(room.Id, ids));
    }

    /// <summary>Asks whether to leave the chat.</summary>
    public void AskLeave(RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = T(room.IsDirect ? "deleteChat" : "leaveGroup")
        };
        var no = new TextButton {
            Title = T("cancel")
        };
        yes.Click += (_, _) => {
            LeaveDialog.Close();
            _ = controller.LeaveRoom(room.Id);
        };
        no.Click += (_, _) => LeaveDialog.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        LeaveDialog.Show(window, c,
            T(room.IsDirect ? "deleteChat.title" : "leaveGroup.title"),
            T(room.IsDirect ? "deleteChat.body" : "leaveGroup.body"), yes, no);
    }

    private string T(string key, params (string, object)[] values)
    {
        return Strings.T(controller.Store.Value.Locale, key, values);
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        Background = new SolidColorBrush(c.Bg);
        var close = new IconButton("close", T("cancel"), 22) {
            Tint = c.TextSecondary
        };
        close.Click += (_, _) => controller.OpenRoomInfo(false);
        var barRow = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto"),
            Margin = new Thickness(20, 0, 8, 0),
        };
        barRow.Children.Add(new TextBlock {
            Text = T("chatInfo"),
            FontSize = 17,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        });
        Grid.SetColumn(close, 1);
        barRow.Children.Add(close);
        bar.Child = barRow;
        bar.Height = ChatPane.HeaderHeight;
        bar.BorderThickness = new Thickness(0, 0, 0, 1);
        bar.BorderBrush = new SolidColorBrush(c.Separator);

        content.Children.Clear();
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        if (room is null)
            return;
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(16, 16, 16, 8),
            Spacing = 2,
        };
        var avatar = new Avatar(room.Id, room.Name, 96, room.IsSpace) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 96);
        head.Children.Add(avatar);
        head.Children.Add(new TextBlock {
            Text = room.Name,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new TextBlock {
            Text = room.IsDirect ? T("directChat")
                : room.MemberCount == 1 ? T("member.one")
                : T("members", ("n", room.MemberCount)),
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        content.Children.Add(head);

        var details = s.Details;
        if (details is null) {
            content.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        EditNameButton = null;
        EditTopicButton = null;
        PhotoButton = null;
        if (!room.IsDirect) {
            PhotoButton = new TextButton {
                Title = T("room.changePhoto")
            };
            PhotoButton.Click += (_, _) => _ = ChangePhoto(room);
            ThemeScope.SetColors(PhotoButton, c);
            content.Children.Add(PhotoButton);
        }

        LeaveButton = null;
        if (!room.IsDirect) {
            EditNameButton = new TextButton {
                Title = T("room.editName") + " · " + T("modify")
            };
            EditNameButton.Click += (_, _) => AskName(room);
            ThemeScope.SetColors(EditNameButton, c);
            content.Children.Add(EditNameButton);
        }

        if (details.Topic is not null || !room.IsDirect) {
            content.Children.Add(Section(c, T("topic")));
            content.Children.Add(new TextBlock {
                Text = details.Topic ?? T("room.noTopic"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(20, 0, 20, 8),
            });
            if (!room.IsDirect) {
                EditTopicButton = new TextButton {
                    Title = T("room.editTopic") + " · " + T("modify")
                };
                EditTopicButton.Click += (_, _) => AskTopic(room, details.Topic);
                ThemeScope.SetColors(EditTopicButton, c);
                content.Children.Add(EditTopicButton);
            }
        }

        InviteButton = null;
        if (!room.IsDirect) {
            InviteButton = new TextButton {
                Title = T("room.invite")
            };
            InviteButton.Click += (_, _) => AskInvite(room);
            ThemeScope.SetColors(InviteButton, c);
            content.Children.Add(InviteButton);
        }

        content.Children.Add(Section(c, T("membersTitle")));
        foreach (var member in details.Members)
            content.Children.Add(MemberRow(c, member, room));
        LeaveButton = new TextButton {
            Title = T(room.IsDirect ? "deleteChat" : "leaveGroup"),
            Margin = new Thickness(0, 16, 0, 0),
        };
        LeaveButton.Click += (_, _) => AskLeave(room);
        ThemeScope.SetColors(LeaveButton, c with {
            Accent = c.Danger
        });
        content.Children.Add(LeaveButton);
        content.Children.Add(new Border {
            Height = 16
        });
    }

    private static TextBlock Section(ColorTokens c, string title)
    {
        return new TextBlock {
            Text = title,
            FontSize = 13,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(20, 12, 20, 6),
        };
    }

    private Control MemberRow(ColorTokens c, RoomMemberInfo m, RoomSummary room)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            Margin = new Thickness(12, 0),
            Height = 52,
        };
        var avatar = new Avatar(m.UserId, m.Name, 38) {
            Margin = new Thickness(8, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, m.AvatarUrl, 38);
        grid.Children.Add(avatar);
        var name = new TextBlock {
            Text = m.Name,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(name, 1);
        grid.Children.Add(name);
        if (m.Role != MemberRole.Member) {
            var role = new TextBlock {
                Text = T(m.Role == MemberRole.Admin ? "role.admin" : "role.moderator"),
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                Margin = new Thickness(8, 0, 8, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(role, 2);
            grid.Children.Add(role);
        }

        Avalonia.Automation.AutomationProperties.SetName(grid, m.Name);
        var row = new Border {
            Child = grid,
            Background = Brushes.Transparent
        };
        if (!room.IsDirect && m.UserId != controller.Store.Value.UserId) {
            row.Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);
            row.PointerPressed += (_, e) => {
                e.Handled = true;
                OpenMemberMenu(row, room, m);
            };
        }

        return row;
    }
}
