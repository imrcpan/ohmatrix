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

        if (details.Topic is { } topic) {
            content.Children.Add(Section(c, T("topic")));
            content.Children.Add(new TextBlock {
                Text = topic,
                FontSize = 15,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(c.Text),
                TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(20, 0, 20, 8),
            });
        }

        content.Children.Add(Section(c, T("membersTitle")));
        foreach (var member in details.Members)
            content.Children.Add(MemberRow(c, member));
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

    private Control MemberRow(ColorTokens c, RoomMemberInfo m)
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
        return grid;
    }
}
