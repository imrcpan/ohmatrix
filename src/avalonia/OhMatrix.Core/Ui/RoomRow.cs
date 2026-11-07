using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>
/// A row of the chat list (<c>RoomRow</c>): 62 high, a 44 picture, the bold title with the time, the preview with the unread count; selected is
/// filled with the selection colour. <see cref="Compact"/> is only the picture with the count on it (the narrow strip).
/// Single lines end in an ellipsis. Set the properties, then call <see cref="Update"/>.
/// </summary>
public sealed class RoomRow : PressableButton {
    public const double RowHeight = 62;

    public required string RoomId { get; init; }
    public string Title { get; set; } = "";
    public string Preview { get; set; } = "";
    public string Time { get; set; } = "";
    public int Unread { get; set; }
    public bool Selected { get; set; }
    public bool Pinned { get; set; }
    public bool MarkedUnread { get; set; }
    public bool Muted { get; set; }
    public bool IsSpace { get; set; }
    public bool Compact { get; set; }

    /// <summary>The picture of the room (an <c>mxc://</c> address) and where to get it from; without them the initials are shown.</summary>
    public string? AvatarUrl { get; set; }

    public Pictures? Pictures { get; set; }

    /// <summary>Pending invitation: Accept and Decline under the preview, with their labels.</summary>
    public (string Accept, string Decline, Action OnAccept, Action OnDecline)?
        Invite {
        get;
        set;
    }

    private readonly Grid row = new() {
        ColumnDefinitions = new ColumnDefinitions("Auto,*")
    };

    private readonly Grid avatarHolder = new() {
        HorizontalAlignment = HorizontalAlignment.Left,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly StackPanel column = new() {
        Spacing = 3,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Grid top = new() {
        ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto,Auto")
    };

    private readonly Grid bottom = new() {
        ColumnDefinitions = new ColumnDefinitions("*,Auto")
    };

    private readonly TextBlock title = Ellipsis(16, FontWeight.SemiBold);
    private readonly TextBlock preview = Ellipsis(15, FontWeight.Normal);

    private readonly TextBlock time = new() {
        FontSize = 13,
        Margin = new Thickness(6, 0, 0, 0),
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly TextBlock count = new() {
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border badge = new();
    private Icon? mute;
    private Icon? pin;
    private StackPanel? buttons;
    private Border? accept;
    private Border? decline;
    private bool? layoutCompact;
    private int counted = -1;

    private Avatar? avatar;
    private string? avatarTitle;
    private string? avatarUrl;
    private Pictures? avatarPictures;
    private bool avatarSpace;
    private FontFamily? avatarFont;
    private Theming.ColorTokens? drawn;

    public RoomRow()
    {
        Margin = new Thickness(6, 0);
        Padding = new Thickness(8, 7);
        CornerRadius = new CornerRadius(12);
        Grid.SetColumn(column, 1);
        Grid.SetColumn(time, 3);
        preview.LineHeight = 20;
        top.Children.Add(title);
        top.Children.Add(time);
        bottom.Children.Add(preview);
        column.Children.Add(top);
        column.Children.Add(bottom);
        row.Children.Add(avatarHolder);
        row.Children.Add(column);
        badge.Child = count;
        Child = row;
    }

    /// <summary>The right-click (or long press) on the row, with the point in the row.</summary>
    public event EventHandler<Point>? MenuRequested;

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        if (e.GetCurrentPoint(this).Properties.IsRightButtonPressed) {
            MenuRequested?.Invoke(this, e.GetPosition(this));
            e.Handled = true;
            return;
        }

        base.OnPointerPressed(e);
    }

    /// <summary>Updates the existing controls from the row's properties.</summary>
    public void Update()
    {
        var c = Colors;
        drawn = c;
        Height = Invite is null || Compact ? RowHeight : double.NaN;
        Avalonia.Automation.AutomationProperties.SetName(this, Title);
        Text(title, Title);
        Text(preview, Preview);
        Text(time, Time);
        UpdateAvatar();
        UpdateLayoutMode();
        UpdateBadge();
        UpdateIcons();
        UpdateInvite();
        title.Foreground = Brush(title.Foreground,
            Selected ? c.OnSelected : c.Text);
        var secondary = Selected ? c.OnSelectedSecondary : c.TextSecondary;
        preview.Foreground = Brush(preview.Foreground, secondary);
        time.Foreground = Brush(time.Foreground, secondary);
        if (mute is not null)
            mute.Color = Brush(mute.Color, secondary);
        if (pin is not null)
            pin.Color = Brush(pin.Color, secondary);
        badge.Background = Brush(badge.Background,
            !Compact && Selected ? c.OnSelected
            : Unread > 0 && Muted ? c.BadgeMuted : c.Badge);
        count.Foreground = Brush(count.Foreground,
            !Compact && Selected ? c.Selected : c.OnAccent);
        badge.BorderBrush = Compact
            ? Brush(badge.BorderBrush, Selected ? c.Selected : c.Bg)
            : null;
        if (accept is not null && decline is not null) {
            PaintPill(accept, Selected ? c.OnSelected : c.Accent,
                Selected ? c.Selected : c.OnAccent);
            PaintPill(decline, c.BgSecondary, c.Text);
        }

        Refresh();
    }

    private void UpdateAvatar()
    {
        if (avatar is not null && avatarTitle == Title &&
            avatarUrl == AvatarUrl && avatarPictures == Pictures &&
            avatarSpace == IsSpace && Equals(avatarFont, Fonts.System))
            return;
        if (avatar is not null)
            avatarHolder.Children.Remove(avatar);
        avatar = new Avatar(RoomId, Title, 44, IsSpace) {
            Margin = Compact ? default : new Thickness(0, 0, 11, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        avatarTitle = Title;
        avatarUrl = AvatarUrl;
        avatarPictures = Pictures;
        avatarSpace = IsSpace;
        avatarFont = Fonts.System;
        avatarHolder.Children.Insert(0, avatar);
        Pictures?.Attach(avatar, AvatarUrl, 44);
    }

    private void UpdateLayoutMode()
    {
        if (layoutCompact == Compact)
            return;
        if (layoutCompact == true)
            avatarHolder.Children.Remove(badge);
        else if (layoutCompact == false)
            bottom.Children.Remove(badge);
        Grid.SetColumn(badge, Compact ? 0 : 1);
        (Compact ? avatarHolder : bottom).Children.Add(badge);
        row.HorizontalAlignment = Compact
            ? HorizontalAlignment.Left
            : HorizontalAlignment.Stretch;
        row.VerticalAlignment = Compact
            ? VerticalAlignment.Center
            : VerticalAlignment.Stretch;
        column.IsVisible = !Compact;
        avatar!.Margin = Compact ? default : new Thickness(0, 0, 11, 0);
        layoutCompact = Compact;
    }

    private void UpdateBadge()
    {
        var numbered = Unread > 0;
        badge.IsVisible = numbered || MarkedUnread && (Compact || Unread == 0);
        count.IsVisible = numbered;
        count.FontFamily = Fonts.System;
        if (numbered && counted != Unread) {
            count.Text = Unread > 99 ? "99+" : Unread.ToString();
            counted = Unread;
        }

        badge.Width = numbered ? double.NaN : Compact ? 13 : 12;
        badge.MinWidth = numbered ? Compact ? 20 : 22 : 0;
        badge.Height = numbered ? Compact ? 20 : 22 : Compact ? 13 : 12;
        badge.CornerRadius = new CornerRadius(
            numbered ? Compact ? 10 : 11 : Compact ? 7 : 6);
        badge.Padding = numbered
            ? new Thickness(Compact ? 5 : 7, 0)
            : default;
        badge.Margin = Compact
            ? numbered
                ? new Thickness(0, -4, -6, 0)
                : new Thickness(0, -1, -2, 0)
            : new Thickness(8, 0, numbered ? 0 : 4, 0);
        badge.BorderThickness = new Thickness(Compact ? 2 : 0);
        badge.HorizontalAlignment = Compact
            ? HorizontalAlignment.Right
            : HorizontalAlignment.Stretch;
        badge.VerticalAlignment = Compact
            ? VerticalAlignment.Top
            : VerticalAlignment.Stretch;
        count.FontSize = Compact ? 11 : 13;
        count.FontWeight = Compact ? FontWeight.Bold : FontWeight.SemiBold;
    }

    private void UpdateIcons()
    {
        if (Muted && mute is null)
            mute = SmallIcon("bellOff", 1);
        if (Pinned && pin is null)
            pin = SmallIcon("pin", Muted ? 2 : 1);
        if (mute is not null)
            mute.IsVisible = Muted;
        if (pin is not null) {
            pin.IsVisible = Pinned;
            Grid.SetColumn(pin, Muted ? 2 : 1);
        }
    }

    private Icon SmallIcon(string glyph, int at)
    {
        var icon = new Icon {
            Glyph = glyph,
            Size = 13,
            Margin = new Thickness(6, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(icon, at);
        top.Children.Add(icon);
        return icon;
    }

    private void UpdateInvite()
    {
        if (Invite is not { } invite || Compact) {
            if (buttons is not null)
                buttons.IsVisible = false;
            return;
        }

        if (buttons is null) {
            // Resolve the actions when pressed: the invitation can change
            // while its controls are kept.
            accept = Pill(FontWeight.SemiBold, () => Invite?.OnAccept());
            decline = Pill(FontWeight.Medium, () => Invite?.OnDecline());
            buttons = new StackPanel {
                Orientation = Orientation.Horizontal,
                Spacing = 8,
                Margin = new Thickness(0, 6, 0, 0),
            };
            buttons.Children.Add(accept);
            buttons.Children.Add(decline);
            column.Children.Add(buttons);
        }

        buttons.IsVisible = true;
        Text((TextBlock)accept!.Child!, invite.Accept);
        Text((TextBlock)decline!.Child!, invite.Decline);
    }

    private static TextBlock Ellipsis(double size, FontWeight weight)
    {
        return new TextBlock {
            FontSize = size,
            FontWeight = weight,
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    private static void Text(TextBlock label, string value)
    {
        if (label.Text != value)
            label.Text = value;
        label.FontFamily = Fonts.System;
    }

    private static Border Pill(FontWeight weight, Action press)
    {
        var pill = new Border {
            CornerRadius = new CornerRadius(14),
            Padding = new Thickness(16, 6),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new TextBlock {
                FontSize = 14,
                FontWeight = weight,
            },
        };
        pill.PointerPressed += (_, e) => {
            e.Handled = true;
            press();
        };
        return pill;
    }

    private static void PaintPill(Border pill, Color fill, Color ink)
    {
        pill.Background = Brush(pill.Background, fill);
        var label = (TextBlock)pill.Child!;
        label.Foreground = Brush(label.Foreground, ink);
    }

    private static IBrush Brush(IBrush? current, Color color)
    {
        return current is ISolidColorBrush solid && solid.Color == color
            ? current
            : new SolidColorBrush(color);
    }

    protected override void Refresh()
    {
        var c = Colors;
        // A row is drawn before it is in the tree, with the default colours;
        // update its brushes when it inherits the colours of its place.
        if (drawn is not null && drawn != c)
            Update();
        Background = Selected ? Brush(Background, c.Selected)
            : Pressed ? Brush(Background, c.Separator)
            : Hovered ? Brush(Background, c.Hover)
            : Brushes.Transparent;
    }
}
