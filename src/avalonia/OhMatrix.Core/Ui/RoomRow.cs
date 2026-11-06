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

    /// <summary>The picture of the room; null shows the initials.</summary>
    public IImage? Picture { get; set; }

    /// <summary>Pending invitation: Accept and Decline under the preview, with their labels.</summary>
    public (string Accept, string Decline, Action OnAccept, Action OnDecline)? Invite {
        get;
        set;
    }

    public RoomRow()
    {
        Margin = new Thickness(6, 0);
        Padding = new Thickness(8, 7);
        CornerRadius = new CornerRadius(12);
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

    /// <summary>Draws the row again from its properties.</summary>
    public void Update()
    {
        var c = Colors;
        Height = Invite is null || Compact ? RowHeight : double.NaN;
        Avalonia.Automation.AutomationProperties.SetName(this, Title);
        var secondary = new SolidColorBrush(Selected ? c.OnSelectedSecondary : c.TextSecondary);
        var avatar = new Avatar(RoomId, Title, 44, IsSpace) {
            Source = Picture
        };
        if (Compact) {
            Child = CompactContent(avatar, c);
            Refresh();
            return;
        }

        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*")
        };
        avatar.Margin = new Thickness(0, 0, 11, 0);
        avatar.VerticalAlignment = VerticalAlignment.Center;
        var column = new StackPanel {
            Spacing = 3,
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(column, 1);
        row.Children.Add(avatar);
        row.Children.Add(column);

        var top = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto,Auto,Auto")
        };
        top.Children.Add(Ellipsis(
            Title, 16, FontWeight.SemiBold, Selected ? c.OnSelected : c.Text
        ));
        var at = 1;
        if (Muted)
            at = AddSmallIcon(top, "bellOff", secondary, at);
        if (Pinned)
            at = AddSmallIcon(top, "pin", secondary, at);
        var time = new TextBlock {
            Text = Time,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = secondary,
            Margin = new Thickness(6, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(time, 3);
        top.Children.Add(time);
        column.Children.Add(top);

        var bottom = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        var preview = Ellipsis(Preview, 15, FontWeight.Normal,
            Selected ? c.OnSelectedSecondary : c.TextSecondary);
        preview.LineHeight = 20;
        bottom.Children.Add(preview);
        if (Unread == 0 && MarkedUnread) {
            var dot = new Border {
                Width = 12,
                Height = 12,
                CornerRadius = new CornerRadius(6),
                Margin = new Thickness(8, 0, 4, 0),
                Background = new SolidColorBrush(Selected ? c.OnSelected : c.Badge),
            };
            Grid.SetColumn(dot, 1);
            bottom.Children.Add(dot);
        }

        if (Unread > 0) {
            var pill = new Border {
                MinWidth = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Padding = new Thickness(7, 0),
                Margin = new Thickness(8, 0, 0, 0),
                Background = new SolidColorBrush(
                    Selected ? c.OnSelected : Muted ? c.BadgeMuted : c.Badge
                ),
                Child = new TextBlock {
                    Text = Count(),
                    FontSize = 13,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(Selected ? c.Selected : c.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            Grid.SetColumn(pill, 1);
            bottom.Children.Add(pill);
        }

        column.Children.Add(bottom);
        if (Invite is { } invite)
            column.Children.Add(InviteButtons(invite, c));
        Child = row;
        Refresh();
    }

    private string Count()
    {
        return Unread > 99 ? "99+" : Unread.ToString();
    }

    private Control CompactContent(Avatar avatar, Theming.ColorTokens c)
    {
        var holder = new Grid {
            HorizontalAlignment = HorizontalAlignment.Left,
            VerticalAlignment = VerticalAlignment.Center,
        };
        holder.Children.Add(avatar);
        var ring = new SolidColorBrush(Selected ? c.Selected : c.Bg);
        if (Unread > 0) {
            holder.Children.Add(new Border {
                MinWidth = 20,
                Height = 20,
                CornerRadius = new CornerRadius(10),
                Padding = new Thickness(5, 0),
                Background = new SolidColorBrush(Muted ? c.BadgeMuted : c.Badge),
                BorderBrush = ring,
                BorderThickness = new Thickness(2),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, -4, -6, 0),
                Child = new TextBlock {
                    Text = Count(),
                    FontSize = 11,
                    FontWeight = FontWeight.Bold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            });
        } else if (MarkedUnread) {
            holder.Children.Add(new Border {
                Width = 13,
                Height = 13,
                CornerRadius = new CornerRadius(7),
                Background = new SolidColorBrush(c.Badge),
                BorderBrush = ring,
                BorderThickness = new Thickness(2),
                HorizontalAlignment = HorizontalAlignment.Right,
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, -1, -2, 0),
            });
        }

        return holder;
    }

    private static TextBlock Ellipsis(string text, double size, FontWeight weight, Color color)
    {
        return new TextBlock {
            Text = text,
            FontSize = size,
            FontWeight = weight,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(color),
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    private static int AddSmallIcon(Grid top, string glyph, IBrush color, int column)
    {
        var icon = new Icon {
            Glyph = glyph,
            Size = 13,
            Color = color,
            Margin = new Thickness(6, 0, 0, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(icon, column);
        top.Children.Add(icon);
        return column + 1;
    }

    private StackPanel InviteButtons(
        (string Accept, string Decline, Action OnAccept, Action OnDecline) invite,
        Theming.ColorTokens c
    )
    {
        var accept = Pill(invite.Accept, FontWeight.SemiBold, Selected ? c.OnSelected : c.Accent,
            Selected ? c.Selected : c.OnAccent, invite.OnAccept);
        var decline = Pill(invite.Decline, FontWeight.Medium, c.BgSecondary, c.Text,
            invite.OnDecline);
        var buttons = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            Margin = new Thickness(0, 6, 0, 0),
        };
        buttons.Children.Add(accept);
        buttons.Children.Add(decline);
        return buttons;
    }

    private static Border Pill(string label, FontWeight weight, Color fill, Color ink, Action press)
    {
        var pill = new Border {
            Background = new SolidColorBrush(fill),
            CornerRadius = new CornerRadius(14),
            Padding = new Thickness(16, 6),
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = new TextBlock {
                Text = label,
                FontSize = 14,
                FontWeight = weight,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(ink),
            },
        };
        pill.PointerPressed += (_, e) => {
            e.Handled = true;
            press();
        };
        return pill;
    }

    protected override void Refresh()
    {
        var c = Colors;
        Background = Selected ? new SolidColorBrush(c.Selected)
            : Pressed ? new SolidColorBrush(c.Separator)
            : Hovered ? new SolidColorBrush(c.Hover)
            : Brushes.Transparent;
    }
}
