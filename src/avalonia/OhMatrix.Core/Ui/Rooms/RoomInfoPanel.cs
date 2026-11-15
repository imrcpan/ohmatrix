using Avalonia.Input.Platform;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using System.Text.RegularExpressions;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Core.Ui.Rooms;

/// <summary>
/// The info of a chat (<c>RoomInfoPanel</c>), a page of a dialog over the window as the profile is: a bar with the title and a cross, the
/// picture, the name and the member count, and the groups of rows of the React Native page (About, the access settings, Mute, Messages,
/// Members, Banned, and the way out), set as the rows of the profile page are. The rest is pages of the dialog: the members, the banned, the
/// gallery and a person, each with a back arrow.
/// </summary>
public sealed partial class RoomInfoPanel : Grid {
    [GeneratedRegex("^[a-zA-Z0-9._=/+-]+$")]
    private static partial Regex LocalPart();

    private readonly AppController controller;
    private readonly Border bar = new();
    private readonly StackPanel content = new();

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static RoomInfoPanel()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<RoomInfoPanel>((p, _) => p.Apply());
    }

    public RoomInfoPanel(AppController controller)
    {
        this.controller = controller;
        Invite = new PeoplePicker(controller) {
            Glyph = "userPlus"
        };
        RowDefinitions = new RowDefinitions("Auto,*");
        Children.Add(bar);
        var scroller = new ScrollViewer {
            Content = content,
            HorizontalScrollBarVisibility =
                Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled,
        };
        Grid.SetRow(scroller, 1);
        Children.Add(scroller);
        Lifetime.OwnAll(this, EditPrompt, LeaveDialog, Invite, MemberMenu,
            MemberPrompt, Viewer, MemberDialog, BannedMenu);
        Lifetime.Watch(this, controller, state => {
            if (Differs(state))
                Apply();
        });
        Apply();
    }

    public StackPanel Content => content;

    public PromptDialog EditPrompt { get; } = new() {
        Glyph = "edit"
    };

    public Dialog LeaveDialog { get; } = new() {
        Warning = true
    };

    public PeoplePicker Invite { get; }
    public Menu MemberMenu { get; } = new();
    public PromptDialog MemberPrompt { get; } = new();

    /// <summary>The rows that change the picture, the name and the description, invite and leave; null where they are not offered.</summary>
    public Border? PhotoRow { get; private set; }

    public Border? NameRow { get; private set; }
    public Border? TopicRow { get; private set; }
    public Border? InviteRow { get; private set; }
    public Border? LeaveRow { get; private set; }

    /// <summary>
    /// Shows the pinned messages of the chat (the list of the chat pane); set by the screen that has both. Pressing the Pinned row calls it.
    /// </summary>
    public Action? ShowPinned { get; set; }

    public ImageViewer Viewer { get; } = new();

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
            var window = TopLevel.GetTopLevel(this);
            if (window != null)
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

    /// <summary>
    /// Goes back from the page of a person: to the list of the people when it was opened from there, to the info of the chat otherwise.
    /// </summary>
    public void LeaveMember()
    {
        viewing = null;
        Apply();
    }

    private bool membersPage;
    private bool bannedPage;

    /// <summary>The page with all the people of the room is open.</summary>
    public bool MembersOpen => membersPage;

    /// <summary>The page with the banned people is open.</summary>
    public bool BannedOpen => bannedPage;

    /// <summary>Opens the page with all the people of the room.</summary>
    public void OpenMembers()
    {
        membersPage = true;
        memberLimit = MemberPage;
        viewingRoom = controller.Store.Value.SelectedRoomId;
        Apply();
    }

    /// <summary>Goes back from the list of the people to the info of the chat.</summary>
    public void LeaveMembers()
    {
        membersPage = false;
        Apply();
    }

    /// <summary>Opens the page with the banned people.</summary>
    public void OpenBanned()
    {
        bannedPage = true;
        viewingRoom = controller.Store.Value.SelectedRoomId;
        Apply();
    }

    /// <summary>Goes back from the banned people to the info of the chat.</summary>
    public void LeaveBanned()
    {
        bannedPage = false;
        Apply();
    }

    private void Copy(string text)
    {
        _ = CopyAsync(text);
    }

    private async Task CopyAsync(string text)
    {
        Ops.Start("copy");
        try {
            var clipboard = TopLevel.GetTopLevel(this)?.Clipboard;
            if (clipboard == null)
                throw new InvalidOperationException();
            await clipboard.SetTextAsync(text);
            Ops.Done("copy");
            controller.ShowNotice(controller.T("copied"));
        } catch (Exception e) {
            Ops.Fail("copy", e);
            controller.ShowNotice(controller.T("copyFailed"), NoticeKind.Error);
        }
    }

    /// <summary>The page of one person: who they are, and what can be done with them (copy their link, write to them, block).</summary>
    private void BuildMember(ColorTokens c, RoomMemberInfo m)
    {
        FillBar(c, controller.T("member.info"), LeaveMember,
            controller.T(membersPage ? "membersTitle" : "chatInfo"));
        var me = m.UserId == controller.Store.Value.UserId;
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(20, 12, 20, 14),
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
            FontWeight = Fonts.Bold,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(0, 8, 0, 0),
        });
        head.Children.Add(new SelectableTextBlock {
            Text = m.UserId,
            FontSize = 14,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
        });
        content.Children.Add(head);
        content.Children.Add(Row(c, "copy", controller.T("member.copyLink"),
            () => Copy($"https://matrix.to/#/{m.UserId}"), chevron: false));
        content.Children.Add(Row(c, "copy", controller.T("member.copyAddress"),
            () => Copy(m.UserId), chevron: false));
        if (!me) {
            content.Children.Add(Row(c, "chat", controller.T("member.message"),
                () => AskMessage(m), chevron: false));
            if (controller.CanVerifyUser)
                content.Children.Add(Row(c, "lock",
                    controller.T("member.verify"),
                    () => _ = controller.VerifyUser(m.UserId),
                    chevron: false));
            content.Children.Add(Row(c, "close", controller.T("member.block"),
                () => AskBlock(m), chevron: false, danger: true));
        }
    }

    private void AskMessage(RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var start = new PrimaryButton {
            Title = controller.T("member.message.start")
        };
        var cancel = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(start, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => MemberDialog.Close();
        start.Click += async (_, _) => {
            start.Loading = true;
            Ops.Start("start direct chat", m.UserId);
            try {
                // The chat that opens replaces this panel (choosing a room closes the chat info).
                await controller.StartDirectChat(m.UserId);
                Ops.Done("start direct chat", m.UserId);
                MemberDialog.Close();
                viewing = null;
            } catch (Exception e) {
                Ops.Fail("start direct chat", e, m.UserId);
                MemberDialog.Close();
                controller.ShowNotice(e.Message, NoticeKind.Error);
            }
        };
        MemberDialog.Warning = false;
        MemberDialog.Glyph = "chat";
        MemberDialog.Show(window, c,
            controller.T("member.message.title", ("name", m.Name)),
            controller.T("member.message.body"), start, cancel);
    }

    public void AskBlockForTest(RoomMemberInfo m)
    {
        AskBlock(m);
    }

    private void AskBlock(RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var block = new PrimaryButton {
            Title = controller.T("member.block")
        };
        var cancel = new TextButton {
            Title = controller.T("cancel")
        };
        ThemeScope.SetColors(block, c);
        ThemeScope.SetColors(cancel, c);
        cancel.Click += (_, _) => MemberDialog.Close();
        block.Click += async (_, _) => {
            block.Loading = true;
            Ops.Start("block user", m.UserId);
            try {
                await controller.BlockUser(m.UserId);
                Ops.Done("block user", m.UserId);
                MemberDialog.Close();
                controller.ShowNotice(controller.T("member.blocked"));
            } catch (Exception e) {
                Ops.Fail("block user", e, m.UserId);
                MemberDialog.Close();
                controller.ShowNotice(e.Message, NoticeKind.Error);
            }
        };
        MemberDialog.Warning = true;
        MemberDialog.Show(window, c,
            controller.T("member.block.title", ("name", m.Name)),
            controller.T("member.block.body"), block, cancel);
    }

    /// <summary>Asks for a picture file and makes it the picture of the room; the path can be given to skip the dialog.</summary>
    public async Task ChangePhoto(RoomSummary room, string? path = null)
    {
        if (path == null) {
            var window = TopLevel.GetTopLevel(this);
            if (window == null)
                return;
            path = await FilePicker.PickImage(window);
        }

        if (path == null)
            return;
        Ops.Start("set room avatar", room.Id);
        controller.ShowNotice(controller.T("avatar.uploading"),
            NoticeKind.Progress);
        try {
            await controller.SetRoomAvatar(room.Id, path);
            Ops.Done("set room avatar", room.Id);
            controller.ShowNotice(controller.T("avatar.done"));
        } catch (Exception e) {
            Ops.Fail("set room avatar", e, room.Id);
            // The picture stays as it was; choosing again tries again.
            controller.ShowNotice(
                controller.T("avatar.failed",
                    ("reason", Failure.Reason(e, k => controller.T(k)))),
                NoticeKind.Error);
        }
    }

    /// <summary>Asks for a new group name.</summary>
    public void AskName(RoomSummary room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        EditPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("room.editName"), controller.T("room.editName.body"),
            [new PromptField(controller.T("room.editName"), "users")],
            controller.T("save"),
            v => controller.SetRoomName(room.Id, v[0]));
        EditPrompt.Fields[0].Text = room.Name;
    }

    /// <summary>Asks for a new description.</summary>
    public void AskTopic(RoomSummary room, string? topic)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        EditPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("room.editTopic"), controller.T("room.editTopic.body"),
            [new PromptField(controller.T("room.editTopic"), "info", true)],
            controller.T("save"), v => controller.SetRoomTopic(room.Id, v[0]));
        EditPrompt.Fields[0].Text = topic ?? "";
    }

    /// <summary>The actions on a person of the room: the roles they can be given, removing and banning.</summary>
    public void OpenMemberMenu(Control anchor, RoomSummary room,
        RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var items = new List<MenuItem> {
            new(controller.T("member.view"), () => ViewMember(m), Icon: "user"),
        };
        // Nothing else is done to oneself from here.
        if (m.UserId == controller.Store.Value.UserId) {
            MemberMenu.Show(anchor, window, items);
            return;
        }

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
            items.Add(new MenuItem(controller.T(key),
                () => AskRole(room, m, target),
                Icon: "user"));
        }

        if (controller.Store.Value.Details?.Can.ChangeRoles == true)
            items.Add(new MenuItem(controller.T("setLevel"),
                () => AskLevel(room, m),
                Icon: "edit"));
        items.Add(new MenuItem(controller.T("removeMember"),
            () => AskRemove(room, m),
            Icon: "trash",
            Danger: true));
        items.Add(new MenuItem(controller.T("ban"), () => AskBan(room, m),
            Icon: "lock",
            Danger: true));
        MemberMenu.Show(anchor, window, items);
    }

    /// <summary>Asks for the power level of a person, from 0 to the highest I hold.</summary>
    public void AskLevel(RoomSummary room, RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var details = controller.Store.Value.Details;
        var mine = details?.Members.FirstOrDefault(x =>
            x.UserId == controller.Store.Value.UserId);
        var max = mine?.Power ?? 100;
        MemberPrompt.Warning = false;
        MemberPrompt.Glyph = "gear";
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("setLevel"),
            controller.T("level.custom.body", ("max", max)),
            [new PromptField(controller.T("level.field"), "info")],
            controller.T("save"), v => {
                if (!int.TryParse(v[0].Trim(), out var n) || n < 0 || n > max)
                    throw new InvalidOperationException(controller.T(
                        "level.invalid",
                        ("max", max)));
                return controller.SetMemberPower(room.Id, m.UserId, n);
            });
        MemberPrompt.Fields[0].Text = (m.Power ?? max).ToString();
    }

    public Menu BannedMenu { get; } = new();

    // Every banned person, as a page of its own; pressing one offers to
    // lift the ban.
    private void BuildBannedPage(ColorTokens c, RoomDetails? details)
    {
        FillBar(c, details == null
                ? controller.T("banned.title")
                : $"{controller.T("banned.title")} · {details.Banned.Count}",
            LeaveBanned, controller.T("chatInfo"));
        if (details == null) {
            content.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        var roomId = controller.Store.Value.SelectedRoomId ?? "";
        foreach (var b in details.Banned)
            content.Children.Add(BannedRow(c, roomId, details.Can.Ban, b));
        content.Children.Add(new Border {
            Height = 16
        });
    }

    private Control BannedRow(ColorTokens c, string roomId, bool can,
        BannedMemberInfo b)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Avatar(b.UserId, b.Name, 36) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = b.Name,
            FontSize = 16,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var sub = string.Join(" · ", new[] {
            b.Name != b.UserId ? b.UserId : "", b.Reason ?? ""
        }.Where(x => x.Length > 0));
        if (sub.Length > 0)
            words.Children.Add(new TextBlock {
                Text = sub,
                FontSize = 13,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        if (can) {
            var more = new Icon {
                Glyph = "more",
                Size = 18,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(more, 2);
            grid.Children.Add(more);
        }

        var row = new Border {
            Height = 60,
            Padding = new Thickness(26, 0),
            Background = Brushes.Transparent,
            Child = grid,
        };
        Avalonia.Automation.AutomationProperties.SetName(row, b.Name);
        if (!can)
            return row;
        row.Cursor = new Cursor(StandardCursorType.Hand);
        NavRows.Hover(row, c);
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            var window = TopLevel.GetTopLevel(this);
            if (window != null)
                BannedMenu.Show(row, window, [
                    new MenuItem(controller.T("unban"),
                        () => _ = Run(controller.UnbanMember(roomId, b.UserId)),
                        Icon: "user")
                ]);
        };
        return row;
    }

    /// <summary>Asks before a person is made an admin or moderator; a member is made at once.</summary>
    public void AskRole(RoomSummary room, RoomMemberInfo m, MemberRole role)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        if (role == MemberRole.Member) {
            _ = controller.SetMemberRole(room.Id, m.UserId, role);
            return;
        }

        var name =
            controller.T(role == MemberRole.Admin
                ? "role.admin"
                : "role.moderator");
        var kind = role == MemberRole.Admin ? "admin" : "moderator";
        var body = controller.T($"role.confirm.{kind}.body");
        if (role == MemberRole.Admin)
            body += "\n\n" + controller.T("role.confirm.admin.warn");
        MemberPrompt.Warning = false;
        MemberPrompt.Glyph = "users";
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T($"role.confirm.{kind}.title"), body, [],
            controller.T("role.confirm.yes", ("role", name.ToLowerInvariant())),
            _ => controller.SetMemberRole(room.Id, m.UserId, role));
    }

    /// <summary>Asks before a person is removed.</summary>
    public void AskRemove(RoomSummary room, RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        MemberPrompt.Warning = true;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("removeMember.title", ("name", m.Name)),
            controller.T("removeMember.body"),
            [],
            controller.T("removeMember"),
            _ => controller.RemoveMember(room.Id, m.UserId));
    }

    /// <summary>Asks before a person is banned, with the reason that may be given.</summary>
    public void AskBan(RoomSummary room, RoomMemberInfo m)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        MemberPrompt.Warning = true;
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("ban.title", ("name", m.Name)),
            controller.T("ban.body"),
            [new PromptField(controller.T("ban.reason"), "info", true)],
            controller.T("ban"),
            v => controller.BanMember(room.Id, m.UserId, v[0]));
    }

    /// <summary>Opens the search for people to invite to the room.</summary>
    public void AskInvite(RoomSummary room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        Invite.Show(window, ThemeScope.GetColors(this),
            controller.T("room.invite"),
            controller.T("room.inviteBody"),
            true,
            n => n == 0
                ? controller.T("room.inviteNone")
                : controller.T("room.inviteAction", ("n", n)),
            ids => controller.InviteToRoom(room.Id, ids));
    }

    /// <summary>Asks whether to leave the chat.</summary>
    public void AskLeave(RoomSummary room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var c = ThemeScope.GetColors(this);
        var yes = new PrimaryButton {
            Title = controller.T(room.IsDirect ? "deleteChat"
                : room.IsSpace ? "space.leave" : "leaveGroup")
        };
        var no = new TextButton {
            Title = controller.T("cancel")
        };
        yes.Click += (_, _) => {
            LeaveDialog.Close();
            _ = controller.LeaveRoom(room.Id);
        };
        no.Click += (_, _) => LeaveDialog.Close();
        ThemeScope.SetColors(yes, c);
        ThemeScope.SetColors(no, c);
        LeaveDialog.Show(window, c,
            controller.T(room.IsDirect ? "deleteChat.title"
                : room.IsSpace ? "leaveSpace.title" : "leaveGroup.title"),
            controller.T(room.IsDirect ? "deleteChat.body"
                : room.IsSpace ? "leaveSpace.body" : "leaveGroup.body"),
            yes, no);
    }


    // The store changes for many reasons (every message, every typing
    // mark); the panel is made again only when a part it shows changed.
    private IReadOnlyList<RoomSummary>? seenRooms;
    private RoomSummary? seenRoom;
    private string? seenRoomId;
    private RoomDetails? seenDetails;
    private string? seenLocale;
    private string? seenUser;

    private bool Differs(AppState state)
    {
        if (!ReferenceEquals(seenRooms, state.Rooms) ||
            seenRoomId != state.SelectedRoomId) {
            var room = state.Rooms.FirstOrDefault(r =>
                r.Id == state.SelectedRoomId);
            if (!ReferenceEquals(room, seenRoom) ||
                seenRoomId != state.SelectedRoomId)
                return true;
            seenRooms = state.Rooms;
        }

        return !ReferenceEquals(seenDetails, state.Details) ||
               seenLocale != state.Locale || seenUser != state.UserId;
    }

    // The page of the people lists them a page at a time: a big room has a
    // thousand.
    private const int MemberPage = 50;
    private string? memberRoom;
    private int memberLimit = MemberPage;

    private bool showing = true;
    private bool stale;

    /// <summary>
    /// Whether the panel is on the screen. There are two (beside the chat,
    /// over it) and one is hidden; it is not built until it is shown.
    /// </summary>
    public bool Showing {
        get => showing;
        set {
            if (showing == value)
                return;
            showing = value;
            if (value && stale)
                Apply();
        }
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        var s = controller.Store.Value;
        seenRooms = s.Rooms;
        seenRoomId = s.SelectedRoomId;
        seenRoom = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        seenDetails = s.Details;
        seenLocale = s.Locale;
        seenUser = s.UserId;
        if (!showing) {
            stale = true;
            return;
        }

        stale = false;
        Background = new SolidColorBrush(c.Bg);
        content.Children.Clear();
        var room = s.Rooms.FirstOrDefault(r => r.Id == s.SelectedRoomId);
        if (room == null) {
            FillBar(c, controller.T("chatInfo"), Dismiss);
            return;
        }

        // Another chat has its own info.
        if (viewingRoom != room.Id) {
            viewing = null;
            membersPage = false;
            bannedPage = false;
        }

        var person = viewing;
        if (person != null) {
            BuildMember(c, person);
            return;
        }

        if (gallery && viewingRoom == room.Id) {
            FillBar(c, controller.T("sharedMedia"), LeaveGallery,
                controller.T("chatInfo"));
            // Kept while the page is open, so a rebuild (a theme change, a sync) does not ask the server again.
            Gallery ??= new SharedMediaView(controller, room.Id, Viewer);
            content.Children.Add(Gallery);
            return;
        }

        gallery = false;
        var details = s.Details;
        if (membersPage && viewingRoom == room.Id) {
            BuildMembersPage(c, room, details);
            return;
        }

        if (bannedPage && viewingRoom == room.Id) {
            BuildBannedPage(c, details);
            return;
        }

        membersPage = false;
        bannedPage = false;
        FillBar(c, controller.T(room.IsDirect ? "userInfo"
            : room.IsSpace ? "spaceInfo" : "groupInfo"), Dismiss);
        content.Children.Add(Head(c, room));
        if (details == null) {
            content.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        AddAbout(c, room, details);
        if (!room.IsDirect) {
            content.Children.Add(Section(c, controller.T("access.title")));
            AddAccessSettings(c, room, details);
        }

        if (!room.IsSpace) {
            AddMute(c, room);
            AddMessages(c, room);
        }

        AddPeople(c, room, details);
        if (!room.IsDirect && details.Banned.Count > 0) {
            content.Children.Add(Section(c,
                $"{controller.T("banned.title")} · {details.Banned.Count}"));
            content.Children.Add(Row(c, "users", controller.T("viewAll"),
                OpenBanned));
        }

        content.Children.Add(Gap());
        LeaveRow = Row(c, "signOut", controller.T(room.IsDirect ? "deleteChat"
                : room.IsSpace ? "space.leave" : "leaveGroup"),
            () => AskLeave(room), chevron: false, danger: true);
        content.Children.Add(LeaveRow);
        content.Children.Add(new Border {
            Height = 16
        });
    }

    private void Dismiss()
    {
        controller.OpenRoomInfo(false);
    }

    // The bar of the page of the dialog, as the profile has it: the title and
    // a cross on the first page, a back arrow and the title on the others.
    private void FillBar(ColorTokens c, string title, Action back,
        string? backLabel = null)
    {
        if (backLabel == null)
            PageBar.Close(bar, c, title, controller.T("close"), back);
        else
            PageBar.Fill(bar, c, title, backLabel, back);
    }

    // The rows are as high as those of the profile page and follow each
    // other with no gap.
    private const double RowHeight = 40;

    private static Border Row(ColorTokens c, string glyph, string label,
        Action? press, string? value = null, bool chevron = true,
        bool danger = false)
    {
        var row = NavRows.Make(c, glyph, label, press ?? (() => {
            }), 0, value, chevron && press != null, danger, flat: true,
            height: RowHeight);
        if (press != null)
            row.Cursor = new Cursor(StandardCursorType.Hand);
        return row;
    }

    // The space above a group that has no heading.
    private static Border Gap()
    {
        return new Border {
            Height = 14
        };
    }

    // The picture, the name and the number of people, as at the top of the
    // profile page.
    private Control Head(ColorTokens c, RoomSummary room)
    {
        var head = new StackPanel {
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 2,
            Margin = new Thickness(20, 12, 20, 4),
        };
        var avatar = new Avatar(room.Id, room.Name, 72, room.IsSpace) {
            HorizontalAlignment = HorizontalAlignment.Center
        };
        controller.Pictures.Attach(avatar, room.AvatarUrl, 72);
        AttachViewer(avatar, room.AvatarUrl, room.Name);
        head.Children.Add(avatar);
        head.Children.Add(new TextBlock {
            Text = room.Name,
            FontSize = 22,
            FontWeight = Fonts.Bold,
            Foreground = new SolidColorBrush(c.Text),
            TextAlignment = TextAlignment.Center,
            TextWrapping = TextWrapping.Wrap,
            MaxLines = 2,
            TextTrimming = TextTrimming.CharacterEllipsis,
            Margin = new Thickness(0, 8, 0, 0),
        });
        var count = room.MemberCount == 1
            ? controller.T("member.one")
            : controller.T("members", ("n", room.MemberCount));
        head.Children.Add(new TextBlock {
            Text = room.IsDirect
                ? controller.T("directChat")
                : room.IsSpace
                    ? $"{controller.T("space")} · {count}"
                    : count,
            FontSize = 15,
            Foreground = new SolidColorBrush(c.TextSecondary),
            HorizontalAlignment = HorizontalAlignment.Center,
        });
        return head;
    }

    // About: the picture, the name, the address, the encryption and the
    // description, with the description under its row in a card.
    private void AddAbout(ColorTokens c, RoomSummary room, RoomDetails details)
    {
        var direct = room.IsDirect;
        var edit = details.Can.EditInfo;
        content.Children.Add(Section(c, controller.T("about")));
        PhotoRow = null;
        NameRow = null;
        TopicRow = null;
        if (edit && !direct) {
            PhotoRow = Row(c, "camera", controller.T("changePhoto"),
                () => _ = ChangePhoto(room));
            content.Children.Add(PhotoRow);
        }

        if (!direct) {
            NameRow = Row(c, "users", controller.T(room.IsSpace
                    ? "space.name"
                    : "room.editName"),
                edit ? () => AskName(room) : null, room.Name, edit);
            content.Children.Add(NameRow);
        }

        var address = details.Aliases.FirstOrDefault() ?? room.Id;
        content.Children.Add(Row(c, "hash", controller.T("address"),
            () => Copy(address), address, false));
        if (!room.IsSpace)
            content.Children.Add(Row(c, details.IsEncrypted ? "lock" : "info",
                controller.T("encryption"), null,
                controller.T(details.IsEncrypted
                    ? "room.encrypted"
                    : "room.notEncrypted"), false));
        if (direct)
            return;
        // The text can be long, so the row only says Edit and the text is
        // spread out under it.
        TopicRow = Row(c, "info", controller.T("topic"),
            edit ? () => AskTopic(room, details.Topic) : null,
            edit ? controller.T("modify") : null, edit);
        content.Children.Add(TopicRow);
        var has = !string.IsNullOrWhiteSpace(details.Topic);
        content.Children.Add(new Border {
            Margin = new Thickness(26, 2, 26, 4),
            Padding = new Thickness(14, 12),
            CornerRadius = new CornerRadius(Radius.Control),
            Background = new SolidColorBrush(c.BgSecondary),
            Child = new SelectableTextBlock {
                Text = has ? details.Topic : controller.T("room.noTopic"),
                FontSize = 15,
                LineHeight = 21,
                TextWrapping = TextWrapping.Wrap,
                Foreground = new SolidColorBrush(has
                    ? c.Text
                    : c.TextTertiary),
            },
        });
    }

    // Mute: a row with a switch; the switch turns at once and goes back if
    // the change fails.
    private void AddMute(ColorTokens c, RoomSummary room)
    {
        content.Children.Add(Gap());
        var toggle = new Toggle {
            IsOn = room.Muted
        };
        toggle.Changed += on => _ = Mute(room, on, toggle);
        content.Children.Add(SwitchRow(c, room.Muted ? "bellOff" : "bell",
            controller.T("mute"), toggle));
    }

    private async Task Mute(RoomSummary room, bool on, Toggle toggle)
    {
        toggle.IsOn = on;
        Ops.Start("mute chat", room.Id);
        try {
            await controller.SetRoomMuted(room.Id, on);
            Ops.Done("mute chat", room.Id);
        } catch (Exception e) {
            Ops.Fail("mute chat", e, room.Id);
            toggle.IsOn = !on;
            controller.ShowNotice(e.Message, NoticeKind.Error);
        }
    }

    private static Border SwitchRow(ColorTokens c, string glyph, string label,
        Toggle toggle)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = glyph,
            Size = 21,
            Color = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(0, 0, 14, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var name = new TextBlock {
            Text = label,
            FontSize = 16,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Fonts.Center(name);
        Grid.SetColumn(name, 1);
        grid.Children.Add(name);
        toggle.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(toggle, 2);
        grid.Children.Add(toggle);
        var row = new Border {
            Height = RowHeight,
            Padding = new Thickness(26, 0),
            Background = Brushes.Transparent,
            Child = grid,
        };
        Avalonia.Automation.AutomationProperties.SetName(row, label);
        return row;
    }

    // Messages: the gallery of the chat and its pinned messages.
    private void AddMessages(ColorTokens c, RoomSummary room)
    {
        content.Children.Add(Section(c, controller.T("messages.title")));
        content.Children.Add(Row(c, "image", controller.T("sharedMedia"),
            OpenGallery));
        var pinned = room.PinnedEventIds.Count;
        content.Children.Add(Row(c, "pin", controller.T("pinned.title"),
            pinned > 0 ? () => ShowPinned?.Invoke() : null,
            pinned.ToString(), pinned > 0));
    }

    // The people: inviting, the first few (the most powerful), and the way
    // to the page with all of them.
    private void AddPeople(ColorTokens c, RoomSummary room,
        RoomDetails details)
    {
        var people = details.Members;
        content.Children.Add(Section(c, room.IsDirect
            ? controller.T("participant")
            : $"{controller.T("membersTitle")} · {people.Count}"));
        InviteRow = null;
        if (!room.IsDirect && details.Can.Invite) {
            InviteRow = Row(c, "userPlus", controller.T("room.invite"),
                () => AskInvite(room), chevron: false);
            content.Children.Add(InviteRow);
        }

        foreach (var member in MemberOrder.Top(people))
            content.Children.Add(MemberRow(c, member, room));
        if (people.Count > MemberOrder.Shown)
            content.Children.Add(Row(c, "users", controller.T("viewAll"),
                OpenMembers));
    }

    // Every person, in that order, as a page of its own; a page at a time.
    private void BuildMembersPage(ColorTokens c, RoomSummary room,
        RoomDetails? details)
    {
        FillBar(c, details == null
                ? controller.T("membersTitle")
                : $"{controller.T("membersTitle")} · {details.Members.Count}",
            LeaveMembers, controller.T("chatInfo"));
        if (details == null) {
            content.Children.Add(new Spinner {
                Size = 28,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 24),
            });
            return;
        }

        if (memberRoom != room.Id) {
            memberRoom = room.Id;
            memberLimit = MemberPage;
        }

        var sorted = MemberOrder.Sort(details.Members);
        foreach (var member in sorted.Take(memberLimit))
            content.Children.Add(MemberRow(c, member, room));
        if (sorted.Count > memberLimit) {
            var more = new TextButton {
                Title = controller.T("members.more",
                    ("n", Math.Min(MemberPage, sorted.Count - memberLimit)))
            };
            more.Click += (_, _) => {
                memberLimit += MemberPage;
                Apply();
            };
            ThemeScope.SetColors(more, c);
            content.Children.Add(more);
        }

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
        joinRow = SettingRow(c, controller.T("join.title"),
            controller.T(joinLabel), "lock", can
                ? () => {
                    var window = TopLevel.GetTopLevel(this);
                    if (window == null)
                        return;
                    MemberMenu.Show(joinRow!, window, [
                        .. new[] {
                            JoinRule.Public, JoinRule.Invite
                        }.Select(r =>
                            new MenuItem(controller.T(JoinKey(r)),
                                () => _ =
                                    Run(controller.SetJoinRule(room.Id, r)),
                                Checked: details.JoinRule == r))
                    ]);
                }
                : null);
        content.Children.Add(joinRow);

        Border? historyRow = null;
        historyRow = SettingRow(c, controller.T("history.title"),
            controller.T(HistoryKey(details.HistoryVisibility)),
            "clock", can
                ? () => {
                    var window = TopLevel.GetTopLevel(this);
                    if (window == null)
                        return;
                    MemberMenu.Show(historyRow!, window, [
                        .. Enum.GetValues<HistoryVisibility>().Select(v =>
                            new MenuItem(controller.T(HistoryKey(v)),
                                () => _ =
                                    Run(controller.SetHistoryVisibility(room.Id,
                                        v)),
                                Checked: details.HistoryVisibility == v))
                    ]);
                }
                : null);
        content.Children.Add(historyRow);
        content.Children.Add(Hint(c, controller.T(
            details.JoinRule == JoinRule.Public
                ? "join.public.hint"
                : "join.invite.hint")));

        if (details.Aliases.Count > 0 || can) {
            content.Children.Add(Section(c, controller.T("addresses.title")));
            for (var i = 0; i < details.Aliases.Count; i++) {
                var alias = details.Aliases[i];
                Border? row = null;
                row = SettingRow(c, alias,
                    i == 0 ? controller.T("address.main") : "",
                    "hash", can
                        ? () => {
                            var window = TopLevel.GetTopLevel(this);
                            if (window == null)
                                return;
                            var items = new List<MenuItem>();
                            if (i0(details, alias) != 0)
                                items.Add(new MenuItem(
                                    controller.T("address.makeMain"),
                                    () => AskMainAlias(room, details, alias),
                                    Icon: "hash"));
                            items.Add(new MenuItem(
                                Foreign(alias, details)
                                    ? controller.T("address.unlist")
                                    : controller.T("address.remove"),
                                () => AskRemoveAlias(room, details, alias,
                                    false), Icon: "close", Danger: true));
                            MemberMenu.Show(row!, window, items);
                        }
                        : null);
                content.Children.Add(row);
            }

            if (can)
                content.Children.Add(SettingRow(c, controller.T("address.add"),
                    "", "plus",
                    () => AskAddAlias(room)));
            content.Children.Add(Hint(c, controller.T("addresses.footer")));
        }

        content.Children.Add(Section(c, controller.T("perm.title")));
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
            row = SettingRow(c, controller.T(key), LevelLabel(current), "info",
                editable
                    ? () => {
                        var window = TopLevel.GetTopLevel(this);
                        if (window == null)
                            return;
                        var presets = new[] {
                            0, 50, 100
                        }.Where(n => n <= myPower).ToList();
                        var items = presets.Select(n =>
                            new MenuItem(LevelLabel(n),
                                () => _ =
                                    Run(controller.SetPowerThresholds(room.Id,
                                        set(levels, n))),
                                Checked: current == n)).ToList();
                        items.Add(new MenuItem(
                            controller.T("level.customAction"),
                            () => AskLevel(room, current, myPower,
                                n => set(levels, n)),
                            Checked: !presets.Contains(current)));
                        MemberMenu.Show(row!, window, items);
                    }
                    : null);
            content.Children.Add(row);
        }

        content.Children.Add(Hint(c, controller.T("perm.footer")));
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
        return level >= 100 ? $"{controller.T("role.admin")} · {level}"
            : level == 50 ? $"{controller.T("role.moderator")} · 50"
            : level == 0 ? $"{controller.T("role.member")} · 0"
            : controller.T("level.custom", ("n", level));
    }

    private TextBlock Hint(ColorTokens c, string text)
    {
        return new TextBlock {
            Text = text,
            FontSize = 13,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(26, 2, 20, 6),
        };
    }

    /// <summary>Runs a change of the room's settings; why it failed is shown as a notice.</summary>
    private async Task Run(Task change)
    {
        Ops.Start("change room settings");
        try {
            await change;
            Ops.Done("change room settings");
        } catch (EngineException e) {
            Ops.Fail("change room settings", e);
            controller.ShowNotice(
                e.Code == EngineErrorCode.Forbidden
                    ? controller.T("notAllowed")
                    : e.Message,
                NoticeKind.Error);
        }
    }

    /// <summary>Asks for the name of a new address, and checks that it is free before it is added.</summary>
    public void AskAddAlias(RoomSummary room)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var server = ServerOf(controller.Store.Value.UserId ?? "");
        MemberPrompt.Warning = false;
        MemberPrompt.Glyph = "hash";
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("address.add"), controller.T("address.add.body"),
            [new PromptField(controller.T("address.localpart"), "hash")],
            controller.T("address.add.confirm"),
            async v => {
                var name = v[0].Trim().TrimStart('#');
                if (name.Length == 0 ||
                    !LocalPart().IsMatch(name))
                    throw new InvalidOperationException(
                        controller.T("address.invalid"));
                var alias = $"#{name}:{server}";
                bool free;
                try {
                    free = await controller.IsAliasAvailable(alias);
                } catch (Exception) {
                    throw new InvalidOperationException(
                        controller.T("address.check.failed"));
                }

                if (!free)
                    throw new InvalidOperationException(
                        controller.T("address.taken"));
                try {
                    await controller.AddRoomAlias(room.Id, alias);
                } catch (EngineException e) {
                    throw new InvalidOperationException(
                        e.Code == EngineErrorCode.Forbidden
                            ? controller.T("notAllowed")
                            : controller.T("address.invalid"));
                }
            });
    }

    private void AskMainAlias(RoomSummary room, RoomDetails d, string alias)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var body = controller.T("address.main.body");
        if (d.Aliases.Count > 0 && d.Aliases[0] != alias)
            body += " " +
                    controller.T("address.main.old", ("alias", d.Aliases[0]));
        MemberPrompt.Warning = false;
        MemberPrompt.Glyph = "hash";
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("address.main.title"), body + "\n\n" + alias, [],
            controller.T("address.main.yes"),
            _ => controller.SetMainAlias(room.Id, alias));
    }

    /// <summary>Removing an address asks twice: first plainly, then with the warning that it cannot be undone.</summary>
    public void AskRemoveAlias(RoomSummary room, RoomDetails d, string alias,
        bool sure)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        var foreign = Foreign(alias, d);
        var server = ServerOf(alias);
        var colors = ThemeScope.GetColors(this);
        var locale = controller.Store.Value.Locale;
        if (!sure) {
            MemberPrompt.Warning = true;
            MemberPrompt.Show(window, colors, locale,
                foreign
                    ? controller.T("address.unlist.title")
                    : controller.T("address.remove.title"),
                (foreign
                    ? controller.T("address.unlist.body", ("server", server))
                    : controller.T("address.remove.body"))
                + "\n\n" + alias, [],
                foreign
                    ? controller.T("address.unlist")
                    : controller.T("address.remove"),
                _ => {
                    Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                        AskRemoveAlias(room, d, alias, true));
                    return Task.CompletedTask;
                });
            return;
        }

        var warn = foreign
            ? controller.T("address.unlist.warn", ("server", server))
            : controller.T("address.remove.warn");
        if (d.Aliases.Count > 0 && d.Aliases[0] == alias)
            warn += " " + controller.T("address.remove.main", ("next",
                d.Aliases.Count > 1
                    ? controller.T("address.remove.next",
                        ("alias", d.Aliases[1]))
                    : controller.T("address.remove.none")));
        MemberPrompt.Warning = true;
        MemberPrompt.Show(window, colors, locale,
            foreign
                ? controller.T("address.unlist.title2")
                : controller.T("address.remove.title2"),
            warn + "\n\n" + alias, [],
            foreign
                ? controller.T("address.unlist.yes")
                : controller.T("address.remove.yes"),
            async _ => {
                Ops.Start("remove room address", alias);
                await controller.RemoveRoomAlias(room.Id, alias);
                if (!foreign &&
                    controller.Store.Value.Details?.Aliases.Contains(alias) ==
                    true) {
                    Ops.Fail("remove room address",
                        new InvalidOperationException("the address stayed"),
                        alias);
                    controller.ShowNotice(
                        controller.T("address.remove.kept", ("alias", alias)),
                        NoticeKind.Error);
                    return;
                }

                Ops.Done("remove room address", alias);
            });
    }

    /// <summary>Asks for a power level of one's own choosing, from 0 to the highest I hold.</summary>
    private void AskLevel(RoomSummary room, int current, int max,
        Func<int, PowerThresholds> make)
    {
        var window = TopLevel.GetTopLevel(this);
        if (window == null)
            return;
        MemberPrompt.Warning = false;
        MemberPrompt.Glyph = "gear";
        MemberPrompt.Show(window, ThemeScope.GetColors(this),
            controller.Store.Value.Locale,
            controller.T("level.customAction"),
            controller.T("level.custom.body", ("max", max)),
            [new PromptField(controller.T("level.field"), "info")],
            controller.T("save"), v => {
                if (!int.TryParse(v[0].Trim(), out var n) || n < 0 || n > max)
                    throw new InvalidOperationException(controller.T(
                        "level.invalid",
                        ("max", max)));
                return controller.SetPowerThresholds(room.Id, make(n));
            });
        MemberPrompt.Fields[0].Text = current.ToString();
    }

    // A setting: the icon, the name with the value under it, and a small
    // arrow down where a list can be opened.
    private Border SettingRow(ColorTokens c, string label, string value,
        string icon, Action? onPress)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = icon,
            Size = 21,
            Color = new SolidColorBrush(c.TextSecondary),
            Margin = new Thickness(0, 0, 14, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 6),
        };
        words.Children.Add(new TextBlock {
            Text = label,
            FontSize = 16,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        if (value.Length > 0)
            words.Children.Add(new TextBlock {
                Text = value,
                FontSize = 13,
                Foreground = new SolidColorBrush(c.TextSecondary),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        if (onPress != null) {
            var arrow = new Icon {
                Glyph = "chevronDown",
                Size = 16,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(arrow, 2);
            grid.Children.Add(arrow);
        }

        var row = new Border {
            Padding = new Thickness(26, 0),
            MinHeight = RowHeight,
            Background = Brushes.Transparent,
            Child = grid,
        };
        Avalonia.Automation.AutomationProperties.SetName(row, label);
        if (onPress == null)
            return row;
        row.Cursor = new Cursor(StandardCursorType.Hand);
        NavRows.Hover(row, c);
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            onPress();
        };
        return row;
    }

    // The heading of a group of rows, as on the profile page.
    private static TextBlock Section(ColorTokens c, string title)
    {
        return new TextBlock {
            Text = title,
            FontSize = 14,
            FontWeight = Fonts.Bold,
            Foreground = new SolidColorBrush(c.Accent),
            Margin = new Thickness(26, 14, 12, 4),
        };
    }

    // What a person is, said at the right of their row: the role, or the
    // level when it is none of the usual ones.
    private string? TagOf(RoomMemberInfo m)
    {
        if (m.Power is { } power) {
            if (power == 100)
                return controller.T("role.admin");
            if (power == 50)
                return controller.T("role.moderator");
            if (power > 100)
                return LevelLabel(power);
            return power > 0
                ? controller.T("level.custom", ("n", power))
                : null;
        }

        return m.Role switch {
            MemberRole.Admin => controller.T("role.admin"),
            MemberRole.Moderator => controller.T("role.moderator"),
            _ => null,
        };
    }

    // A person: the picture, the name with the address under it, and the
    // role. In a room a press opens the menu of what can be done with them.
    private Control MemberRow(ColorTokens c, RoomMemberInfo m, RoomSummary room)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        var avatar = new Avatar(m.UserId, m.Name, 36) {
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        controller.Pictures.Attach(avatar, m.AvatarUrl, 36);
        grid.Children.Add(avatar);
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center
        };
        words.Children.Add(new TextBlock {
            Text = m.Name,
            FontSize = 16,
            Foreground = new SolidColorBrush(c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        words.Children.Add(new TextBlock {
            Text = m.UserId,
            FontSize = 13,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        Grid.SetColumn(words, 1);
        grid.Children.Add(words);
        var tag = TagOf(m);
        if (tag != null) {
            var role = new TextBlock {
                Text = tag,
                FontSize = 13,
                Foreground = new SolidColorBrush(c.Accent),
                Margin = new Thickness(8, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(role, 2);
            grid.Children.Add(role);
        }

        Avalonia.Automation.AutomationProperties.SetName(grid, m.Name);
        var row = new Border {
            Height = 54,
            Padding = new Thickness(26, 0),
            Child = grid,
            Background = Brushes.Transparent,
        };
        if (room.IsDirect)
            return row;
        row.Cursor = new Cursor(StandardCursorType.Hand);
        NavRows.Hover(row, c);
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            OpenMemberMenu(row, room, m);
        };
        return row;
    }
}
