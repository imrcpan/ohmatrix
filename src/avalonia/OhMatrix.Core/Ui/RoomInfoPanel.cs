using Avalonia.Input.Platform;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
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
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<RoomInfoPanel>((p, _) => p.Apply());
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
    public ImageViewer Viewer { get; } = new();

    /// <summary>The pictures shown under Shared media (those of the messages loaded), newest first.</summary>
    public IReadOnlyList<Image> MediaThumbnails => mediaThumbs;

    private RoomMemberInfo? viewing;
    private string? viewingRoom;

    /// <summary>The person whose page is open, or null.</summary>
    public RoomMemberInfo? Viewing => viewing;

    public Dialog MemberDialog { get; } = new();

    /// <summary>Opens the page of a person of the room.</summary>
    public void ViewMember(RoomMemberInfo m)
    {
        viewing = m;
        viewingRoom = controller.Store.Value.SelectedRoomId;
        Apply();
    }

    /// <summary>Makes a picture open full size when pressed, when it has one (<c>AvatarViewer</c>).</summary>
    private void AttachViewer(Avatar avatar, string? source, string name)
    {
        if (string.IsNullOrEmpty(source))
            return;
        avatar.Cursor = new Cursor(StandardCursorType.Hand);
        avatar.PointerPressed += (_, e) => {
            e.Handled = true;
            if (TopLevel.GetTopLevel(this) is { } window)
                Viewer.Show(window, controller.Pictures, source, name, null,
                    () => controller.SavePicture(window, source, name));
        };
    }

    private bool gallery;

    /// <summary>The whole gallery when its page is open, or null.</summary>
    public SharedMediaView? Gallery { get; private set; }

    /// <summary>Opens the page with all the media of the chat.</summary>
    public void OpenGallery()
    {
        gallery = true;
        viewingRoom = controller.Store.Value.SelectedRoomId;
        Gallery = null;
        Apply();
    }

    /// <summary>Goes back from the gallery to the info of the chat.</summary>
    public void LeaveGallery()
    {
        gallery = false;
        Gallery = null;
        Apply();
    }

    /// <summary>Goes back from the page of a person to the info of the chat.</summary>
    public void LeaveMember()
    {
        viewing = null;
        Apply();
    }

    private void Copy(string text)
    {
        _ = CopyAsync(text);
    }

    private async Task CopyAsync(string text)
    {
        try {
            if (TopLevel.GetTopLevel(this)?.Clipboard is not { } clipboard)
                throw new InvalidOperationException();
            await clipboard.SetTextAsync(text);
            controller.ShowNotice(T("copied"));
        } catch (Exception) {
            controller.ShowNotice(T("copyFailed"), NoticeKind.Error);
        }
    }

    /// <summary>The page of one person: who they are, and what can be done with them (copy their link, write to them, block).</summary>
    private void BuildMember(ColorTokens c, RoomMemberInfo m)
    {
        PageBar.Fill(bar, c, T("member.info"), T("chatInfo"), LeaveMember);
        var me = m.UserId == controller.Store.Value.UserId;
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(20, 12, 20, 8),
            Spacing = 2,
        };
        var avatar = new Avatar(m.UserId, m.Name, 72) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(avatar, m.AvatarUrl, 72);
        AttachViewer(avatar, m.AvatarUrl, m.Name);
        head.Children.Add(avatar);
        head.Children.Add(new TextBlock {
            Text = m.Name,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new SelectableTextBlock {
            Text = m.UserId,
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
        });
        content.Children.Add(head);
        content.Children.Add(ProfilePage.NavRow(c, "copy", T("member.copyLink"),
            () => Copy($"https://matrix.to/#/{m.UserId}"), 12, chevron: false));
        content.Children.Add(ProfilePage.NavRow(c, "copy",
            T("member.copyAddress"),
            () => Copy(m.UserId), 8, chevron: false));
        if (!me) {
            content.Children.Add(ProfilePage.NavRow(c, "chat",
                T("member.message"),
                () => AskMessage(m), 8, chevron: false));
            if (controller.CanVerifyUser)
                content.Children.Add(ProfilePage.NavRow(c, "lock",
                    T("member.verify"),
                    () => _ = controller.VerifyUser(m.UserId), 8,
                    chevron: false));
            content.Children.Add(ProfilePage.NavRow(c, "close",
                T("member.block"),
                () => AskBlock(m), 8, chevron: false, danger: true));
        }
    }

    private void AskMessage(RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var start = new PrimaryButton {
            Title = T("member.message.start")
        };
        var cancel = new TextButton {
            Title = T("cancel")
        };
        ThemeScope.SetColors(start, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => MemberDialog.Close();
        start.Click += async (_, _) => {
            start.Loading = true;
            try {
                // The chat that opens replaces this panel (choosing a room closes the chat info).
                await controller.StartDirectChat(m.UserId);
                MemberDialog.Close();
                viewing = null;
            } catch (Exception e) {
                MemberDialog.Close();
                controller.ShowNotice(e.Message, NoticeKind.Error);
            }
        };
        MemberDialog.Show(window, c,
            T("member.message.title", ("name", m.Name)),
            T("member.message.body"), start, cancel);
    }

    public void AskBlockForTest(RoomMemberInfo m)
    {
        AskBlock(m);
    }

    private void AskBlock(RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var c = ThemeScope.GetColors(this);
        var block = new PrimaryButton {
            Title = T("member.block")
        };
        var cancel = new TextButton {
            Title = T("cancel")
        };
        ThemeScope.SetColors(block, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => MemberDialog.Close();
        block.Click += async (_, _) => {
            block.Loading = true;
            try {
                await controller.BlockUser(m.UserId);
                MemberDialog.Close();
                controller.ShowNotice(T("member.blocked"));
            } catch (Exception e) {
                MemberDialog.Close();
                controller.ShowNotice(e.Message, NoticeKind.Error);
            }
        };
        MemberDialog.Show(window, c, T("member.block.title", ("name", m.Name)),
            T("member.block.body"), block, cancel);
    }

    private readonly List<Image> mediaThumbs = [];
    private const int MediaShown = 9;
    private const int FilesShown = 5;

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
        EditPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("room.editName"), "",
            [new PromptField(T("room.editName"), "users")], T("save"),
            v => controller.SetRoomName(room.Id, v[0]));
        EditPrompt.Fields[0].Text = room.Name;
    }

    /// <summary>Asks for a new description.</summary>
    public void AskTopic(RoomSummary room, string? topic)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        EditPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("room.editTopic"), "",
            [new PromptField(T("room.editTopic"), "info", true)],
            T("save"), v => controller.SetRoomTopic(room.Id, v[0]));
        EditPrompt.Fields[0].Text = topic ?? "";
    }

    /// <summary>The actions on a person of the room: the roles they can be given, removing and banning.</summary>
    public void OpenMemberMenu(Control anchor, RoomSummary room,
        RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var items = new List<MenuItem> {
            new(T("member.view"), () => ViewMember(m), Icon: "user"),
        };
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
            items.Add(new MenuItem(T(key), () => AskRole(room, m, target),
                Icon: "user"));
        }

        if (controller.Store.Value.Details?.Can.ChangeRoles == true)
            items.Add(new MenuItem(T("setLevel"), () => AskLevel(room, m),
                Icon: "edit"));
        items.Add(new MenuItem(T("removeMember"), () => AskRemove(room, m),
            Icon: "trash",
            Danger: true));
        items.Add(new MenuItem(T("ban"), () => AskBan(room, m), Icon: "lock",
            Danger: true));
        MemberMenu.Show(anchor, window, items);
    }

    /// <summary>Asks for the power level of a person, from 0 to the highest I hold.</summary>
    public void AskLevel(RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var details = controller.Store.Value.Details;
        var mine = details?.Members.FirstOrDefault(x =>
            x.UserId == controller.Store.Value.UserId);
        var max = mine?.Power ?? 100;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("setLevel"), T("level.custom.body", ("max", max)),
            [new PromptField(T("level.field"), "info")], T("save"), v => {
                if (!int.TryParse(v[0].Trim(), out var n) || n < 0 || n > max)
                    throw new InvalidOperationException(T("level.invalid",
                        ("max", max)));
                return controller.SetMemberPower(room.Id, m.UserId, n);
            });
        MemberPrompt.Fields[0].Text = (m.Power ?? max).ToString();
    }

    public Menu BannedMenu { get; } = new();

    /// <summary>The people banned from the room; pressing one offers to lift the ban.</summary>
    private void AddBanned(ColorTokens c, RoomSummary room, RoomDetails details)
    {
        content.Children.Add(Section(c,
            $"{T("banned.title")} · {details.Banned.Count}"));
        foreach (var b in details.Banned) {
            var line = new StackPanel {
                Margin = new Thickness(20, 6),
                Background = Brushes.Transparent,
                Cursor = details.Can.Ban
                    ? new Cursor(StandardCursorType.Hand)
                    : null,
            };
            line.Children.Add(new TextBlock {
                Text = b.Name,
                FontSize = 16,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
            });
            var sub = string.Join(" · ", new[] {
                b.Name != b.UserId ? b.UserId : "", b.Reason ?? ""
            }.Where(x => x.Length > 0));
            if (sub.Length > 0)
                line.Children.Add(new TextBlock {
                    Text = sub,
                    FontSize = 13,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.TextSecondary),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                });
            var banned = b;
            if (details.Can.Ban)
                line.PointerPressed += (_, e) => {
                    e.Handled = true;
                    if (TopLevel.GetTopLevel(this) is { } window)
                        BannedMenu.Show(line, window, [
                            new MenuItem(T("unban"),
                                () => _ =
                                    Run(controller.UnbanMember(room.Id,
                                        banned.UserId)),
                                Icon: "user")
                        ]);
                };
            content.Children.Add(line);
        }
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

        var name =
            T(role == MemberRole.Admin ? "role.admin" : "role.moderator");
        var kind = role == MemberRole.Admin ? "admin" : "moderator";
        var body = T($"role.confirm.{kind}.body");
        if (role == MemberRole.Admin)
            body += "\n\n" + T("role.confirm.admin.warn");
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T($"role.confirm.{kind}.title"), body, [],
            T("role.confirm.yes", ("role", name.ToLowerInvariant())),
            _ => controller.SetMemberRole(room.Id, m.UserId, role));
    }

    /// <summary>Asks before a person is removed.</summary>
    public void AskRemove(RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("removeMember.title", ("name", m.Name)), T("removeMember.body"),
            [],
            T("removeMember"), _ => controller.RemoveMember(room.Id, m.UserId));
    }

    /// <summary>Asks before a person is banned, with the reason that may be given.</summary>
    public void AskBan(RoomSummary room, RoomMemberInfo m)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("ban.title", ("name", m.Name)), T("ban.body"),
            [new PromptField(T("ban.reason"), "info", true)], T("ban"),
            v => controller.BanMember(room.Id, m.UserId, v[0]));
    }

    /// <summary>Opens the search for people to invite to the room.</summary>
    public void AskInvite(RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        Invite.Show(window, ThemeScope.GetColors(this), T("room.invite"),
            T("room.inviteBody"),
            true,
            n => n == 0
                ? T("room.inviteNone")
                : T("room.inviteAction", ("n", n)),
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
        // Another chat has its own info.
        if (viewingRoom != room.Id)
            viewing = null;
        if (viewing is { } person) {
            BuildMember(c, person);
            return;
        }

        if (gallery && viewingRoom == room.Id) {
            PageBar.Fill(bar, c, T("sharedMedia"), T("chatInfo"), LeaveGallery);
            // Kept while the page is open, so a rebuild (a theme change, a sync) does not ask the server again.
            Gallery ??= new SharedMediaView(controller, room.Id, Viewer);
            content.Children.Add(Gallery);
            return;
        }

        gallery = false;

        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(16, 16, 16, 8),
            Spacing = 2,
        };
        var avatar = new Avatar(room.Id, room.Name, 96, room.IsSpace) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 96);
        AttachViewer(avatar, room.AvatarUrl, room.Name);
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
                EditTopicButton.Click += (_, _) =>
                    AskTopic(room, details.Topic);
                ThemeScope.SetColors(EditTopicButton, c);
                content.Children.Add(EditTopicButton);
            }
        }

        if (!room.IsSpace) {
            content.Children.Add(SettingRow(c, T("encryption"),
                T(details.IsEncrypted ? "room.encrypted" : "room.notEncrypted"),
                details.IsEncrypted ? "lock" : "info", null));
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

        if (!room.IsDirect) {
            content.Children.Add(Section(c, T("access.title")));
            AddAccessSettings(c, room, details);
        }

        AddShared(c, s.Timeline);
        if (!room.IsDirect && details.Banned.Count > 0)
            AddBanned(c, room, details);
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

    private void AddAccessSettings(ColorTokens c, RoomSummary room,
        RoomDetails details)
    {
        var can = details.Can.ChangeSettings;
        var joinLabel = JoinKey(details.JoinRule);
        Border? joinRow = null;
        joinRow = SettingRow(c, T("join.title"), T(joinLabel), "lock", can
            ? () => {
                if (TopLevel.GetTopLevel(this) is not { } window)
                    return;
                MemberMenu.Show(joinRow!, window, [
                    .. new[] {
                        JoinRule.Public, JoinRule.Invite
                    }.Select(r =>
                        new MenuItem(T(JoinKey(r)),
                            () => _ = Run(controller.SetJoinRule(room.Id, r)),
                            Checked: details.JoinRule == r))
                ]);
            }
            : null);
        content.Children.Add(joinRow);

        Border? historyRow = null;
        historyRow = SettingRow(c, T("history.title"),
            T(HistoryKey(details.HistoryVisibility)),
            "clock", can
                ? () => {
                    if (TopLevel.GetTopLevel(this) is not { } window)
                        return;
                    MemberMenu.Show(historyRow!, window, [
                        .. Enum.GetValues<HistoryVisibility>().Select(v =>
                            new MenuItem(T(HistoryKey(v)),
                                () => _ =
                                    Run(controller.SetHistoryVisibility(room.Id,
                                        v)),
                                Checked: details.HistoryVisibility == v))
                    ]);
                }
                : null);
        content.Children.Add(historyRow);
        content.Children.Add(Hint(c, T(details.JoinRule == JoinRule.Public
            ? "join.public.hint"
            : "join.invite.hint")));

        if (details.Aliases.Count > 0 || can) {
            content.Children.Add(Section(c, T("addresses.title")));
            for (var i = 0; i < details.Aliases.Count; i++) {
                var alias = details.Aliases[i];
                Border? row = null;
                row = SettingRow(c, alias, i == 0 ? T("address.main") : "",
                    "hash", can
                        ? () => {
                            if (TopLevel.GetTopLevel(this) is not { } window)
                                return;
                            var items = new List<MenuItem>();
                            if (i0(details, alias) != 0)
                                items.Add(new MenuItem(T("address.makeMain"),
                                    () => AskMainAlias(room, details, alias),
                                    Icon: "hash"));
                            items.Add(new MenuItem(
                                Foreign(alias, details)
                                    ? T("address.unlist")
                                    : T("address.remove"),
                                () => AskRemoveAlias(room, details, alias,
                                    false), Icon: "close", Danger: true));
                            MemberMenu.Show(row!, window, items);
                        }
                        : null);
                content.Children.Add(row);
            }

            if (can)
                content.Children.Add(SettingRow(c, T("address.add"), "", "plus",
                    () => AskAddAlias(room)));
            content.Children.Add(Hint(c, T("addresses.footer")));
        }

        content.Children.Add(Section(c, T("perm.title")));
        var myRole = details.Members
            .FirstOrDefault(m => m.UserId == controller.Store.Value.UserId)
            ?.Role ?? MemberRole.Member;
        var myPower = myRole == MemberRole.Admin ? 100 :
            myRole == MemberRole.Moderator ? 50 : 0;
        var levels = details.Levels;
        (string Key, Func<PowerThresholds, int> Get,
            Func<PowerThresholds, int, PowerThresholds> Set)[] rows = [
                ("perm.sendMessages", l => l.SendMessages, (l, n) => l with {
                    SendMessages = n
                }),
                ("perm.invite", l => l.Invite, (l, n) => l with {
                    Invite = n
                }),
                ("perm.kick", l => l.Kick, (l, n) => l with {
                    Kick = n
                }),
                ("perm.ban", l => l.Ban, (l, n) => l with {
                    Ban = n
                }),
                ("perm.redact", l => l.Redact, (l, n) => l with {
                    Redact = n
                }),
                ("perm.changeSettings", l => l.ChangeSettings, (l, n) =>
                    l with {
                        ChangeSettings = n
                    }),
                ("perm.changeLevels", l => l.ChangeLevels, (l, n) => l with {
                    ChangeLevels = n
                }),
            ];
        foreach (var (key, get, set) in rows) {
            if (room.IsSpace && key is "perm.sendMessages" or "perm.redact")
                continue;
            var current = get(levels);
            var editable = details.Can.ChangeRoles && current <= myPower;
            Border? row = null;
            row = SettingRow(c, T(key), LevelLabel(current), "info", editable
                ? () => {
                    if (TopLevel.GetTopLevel(this) is not { } window)
                        return;
                    var presets = new[] {
                        0, 50, 100
                    }.Where(n => n <= myPower).ToList();
                    var items = presets.Select(n => new MenuItem(LevelLabel(n),
                        () => _ =
                            Run(controller.SetPowerThresholds(room.Id,
                                set(levels, n))),
                        Checked: current == n)).ToList();
                    items.Add(new MenuItem(T("level.customAction"),
                        () => AskLevel(room, current, myPower,
                            n => set(levels, n)),
                        Checked: !presets.Contains(current)));
                    MemberMenu.Show(row!, window, items);
                }
                : null);
            content.Children.Add(row);
        }

        content.Children.Add(Hint(c, T("perm.footer")));
    }

    private static int i0(RoomDetails d, string alias) =>
        d.Aliases.ToList().IndexOf(alias);

    private bool Foreign(string alias, RoomDetails d)
    {
        return ServerOf(alias) != ServerOf(controller.Store.Value.UserId ?? "");
    }

    private static string ServerOf(string id)
    {
        var at = id.IndexOf(':');
        return at >= 0 ? id[(at + 1)..] : "";
    }

    private static string JoinKey(JoinRule r) => r switch {
        JoinRule.Public => "join.public",
        JoinRule.Invite => "join.invite",
        JoinRule.Knock => "join.knock",
        JoinRule.Restricted => "join.restricted",
        _ => "join.other",
    };

    private static string HistoryKey(HistoryVisibility v) => v switch {
        HistoryVisibility.Shared => "history.shared",
        HistoryVisibility.Invited => "history.invited",
        HistoryVisibility.Joined => "history.joined",
        _ => "history.world_readable",
    };

    /// <summary>"Admin · 100", "Moderator · 50", "Member · 0" or "Level 25".</summary>
    private string LevelLabel(int level)
    {
        return level >= 100 ? $"{T("role.admin")} · {level}"
            : level == 50 ? $"{T("role.moderator")} · 50"
            : level == 0 ? $"{T("role.member")} · 0"
            : T("level.custom", ("n", level));
    }

    private TextBlock Hint(ColorTokens c, string text)
    {
        return new TextBlock {
            Text = text,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(20, 6, 20, 4),
        };
    }

    /// <summary>Runs a change of the room's settings; why it failed is shown as a notice.</summary>
    private async Task Run(Task change)
    {
        try {
            await change;
        } catch (EngineException e) {
            controller.ShowNotice(
                e.Code == EngineErrorCode.Forbidden
                    ? T("notAllowed")
                    : e.Message,
                NoticeKind.Error);
        }
    }

    /// <summary>Asks for the name of a new address, and checks that it is free before it is added.</summary>
    public void AskAddAlias(RoomSummary room)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var server = ServerOf(controller.Store.Value.UserId ?? "");
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("address.add"), T("address.add.body"),
            [new PromptField(T("address.localpart"), "hash")],
            T("address.add.confirm"),
            async v => {
                var name = v[0].Trim().TrimStart('#');
                if (name.Length == 0 ||
                    !System.Text.RegularExpressions.Regex.IsMatch(name,
                        "^[a-zA-Z0-9._=/+-]+$"))
                    throw new InvalidOperationException(T("address.invalid"));
                var alias = $"#{name}:{server}";
                bool free;
                try {
                    free = await controller.IsAliasAvailable(alias);
                } catch (Exception) {
                    throw new InvalidOperationException(
                        T("address.check.failed"));
                }

                if (!free)
                    throw new InvalidOperationException(T("address.taken"));
                try {
                    await controller.AddRoomAlias(room.Id, alias);
                } catch (EngineException e) {
                    throw new InvalidOperationException(
                        e.Code == EngineErrorCode.Forbidden
                            ? T("notAllowed")
                            : T("address.invalid"));
                }
            });
    }

    private void AskMainAlias(RoomSummary room, RoomDetails d, string alias)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var body = T("address.main.body");
        if (d.Aliases.Count > 0 && d.Aliases[0] != alias)
            body += " " + T("address.main.old", ("alias", d.Aliases[0]));
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("address.main.title"), body + "\n\n" + alias, [],
            T("address.main.yes"),
            _ => controller.SetMainAlias(room.Id, alias));
    }

    /// <summary>Removing an address asks twice: first plainly, then with the warning that it cannot be undone.</summary>
    public void AskRemoveAlias(RoomSummary room, RoomDetails d, string alias,
        bool sure)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        var foreign = Foreign(alias, d);
        var server = ServerOf(alias);
        var colors = ThemeScope.GetColors(this);
        var locale = controller.Store.Value.Locale;
        if (!sure) {
            MemberPrompt.Show(window, colors, locale,
                foreign ? T("address.unlist.title") : T("address.remove.title"),
                (foreign
                    ? T("address.unlist.body", ("server", server))
                    : T("address.remove.body"))
                + "\n\n" + alias, [],
                foreign ? T("address.unlist") : T("address.remove"),
                _ => {
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        AskRemoveAlias(room, d, alias, true));
                    return Task.CompletedTask;
                });
            return;
        }

        var warn = foreign
            ? T("address.unlist.warn", ("server", server))
            : T("address.remove.warn");
        if (d.Aliases.Count > 0 && d.Aliases[0] == alias)
            warn += " " + T("address.remove.main", ("next", d.Aliases.Count > 1
                ? T("address.remove.next", ("alias", d.Aliases[1]))
                : T("address.remove.none")));
        MemberPrompt.Show(window, colors, locale,
            foreign ? T("address.unlist.title2") : T("address.remove.title2"),
            warn + "\n\n" + alias, [],
            foreign ? T("address.unlist.yes") : T("address.remove.yes"),
            async _ => {
                await controller.RemoveRoomAlias(room.Id, alias);
                if (!foreign &&
                    controller.Store.Value.Details?.Aliases.Contains(alias) ==
                    true)
                    controller.ShowNotice(
                        T("address.remove.kept", ("alias", alias)),
                        NoticeKind.Error);
            });
    }

    /// <summary>Asks for a power level of one's own choosing, from 0 to the highest I hold.</summary>
    private void AskLevel(RoomSummary room, int current, int max,
        Func<int, PowerThresholds> make)
    {
        if (TopLevel.GetTopLevel(this) is not { } window)
            return;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            T("level.customAction"), T("level.custom.body", ("max", max)),
            [new PromptField(T("level.field"), "info")], T("save"), v => {
                if (!int.TryParse(v[0].Trim(), out var n) || n < 0 || n > max)
                    throw new InvalidOperationException(T("level.invalid",
                        ("max", max)));
                return controller.SetPowerThresholds(room.Id, make(n));
            });
        MemberPrompt.Fields[0].Text = current.ToString();
    }

    private Border SettingRow(ColorTokens c, string label, string value,
        string icon,
        Action? onPress)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = icon,
            Size = 22,
            Color = new SolidColorBrush(c.Accent),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = label,
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        var valueText = new TextBlock {
            Text = value,
            FontSize = 15,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(12, 0, 6, 0),
            MaxWidth = 170,
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(valueText, 2);
        grid.Children.Add(valueText);

        var row = new Border {
            Margin = new Thickness(12, 4, 12, 0),
            Padding = new Thickness(14, 0),
            Height = 48,
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            onPress?.Invoke();
        };
        return row;
    }

    /// <summary>The pictures and files of the messages loaded.</summary>
    private void AddShared(ColorTokens c, IReadOnlyList<TimelineItem> timeline)
    {
        mediaThumbs.Clear();
        var pictures = timeline.Where(i => i.Image is not null).Reverse()
            .Take(MediaShown).ToList();
        var files = timeline.Where(i => i.File is not null).Reverse()
            .Take(FilesShown).ToList();
        content.Children.Add(Section(c, T("sharedMedia")));
        content.Children.Add(ProfilePage.NavRow(c, "image", T("viewAll"),
            OpenGallery, 0));
        if (pictures.Count == 0 && files.Count == 0) {
            content.Children.Add(new TextBlock {
                Text = T("media.none"),
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.TextSecondary),
                Margin = new Thickness(20, 0, 20, 8),
            });
            return;
        }

        if (pictures.Count > 0) {
            var grid = new WrapPanel {
                Margin = new Thickness(18, 0, 18, 8)
            };
            foreach (var item in pictures) {
                var image = new Image {
                    Width = 88,
                    Height = 88,
                    Stretch = Stretch.UniformToFill
                };
                controller.Pictures.Attach(image, item.Image!.Source, 176, 176);
                mediaThumbs.Add(image);
                var cell = new Border {
                    Width = 88,
                    Height = 88,
                    Margin = new Thickness(2),
                    CornerRadius = new CornerRadius(6),
                    ClipToBounds = true,
                    Background = new SolidColorBrush(c.BgSecondary),
                    Cursor =
                        new Avalonia.Input.Cursor(Avalonia.Input
                            .StandardCursorType.Hand),
                    Child = image,
                };
                var shown = item.Image!;
                cell.PointerPressed += (_, e) => {
                    e.Handled = true;
                    if (TopLevel.GetTopLevel(this) is { } window)
                        Viewer.Show(window, controller.Pictures, shown.Source,
                            shown.FileName,
                            image.Source,
                            () => controller.SavePicture(window, shown.Source,
                                shown.FileName));
                };
                grid.Children.Add(cell);
            }

            content.Children.Add(grid);
        }

        if (files.Count > 0) {
            content.Children.Add(Section(c, T("sharedFiles")));
            foreach (var item in files) {
                var row = new Grid {
                    ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
                    Margin = new Thickness(20, 4),
                };
                row.Children.Add(new Icon {
                    Glyph = "file",
                    Size = 20,
                    Color = new SolidColorBrush(c.Accent),
                    Margin = new Thickness(0, 0, 10, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                });
                var name = new TextBlock {
                    Text = item.File!.Name,
                    FontSize = 15,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Text),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(name, 1);
                row.Children.Add(name);
                var size = new TextBlock {
                    Text = Format.Bytes(item.File.Size),
                    FontSize = 13,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.TextSecondary),
                    Margin = new Thickness(8, 0, 0, 0),
                    VerticalAlignment = VerticalAlignment.Center,
                };
                Grid.SetColumn(size, 2);
                row.Children.Add(size);
                content.Children.Add(row);
            }
        }
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
                Text = T(m.Role == MemberRole.Admin
                    ? "role.admin"
                    : "role.moderator"),
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
            row.Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand);
            row.PointerPressed += (_, e) => {
                e.Handled = true;
                OpenMemberMenu(row, room, m);
            };
        }

        return row;
    }
}
