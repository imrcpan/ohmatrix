using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class RoomRowTests {
    private static RoomRow Row()
    {
        return new RoomRow {
            RoomId = "!room:localhost",
            Title = "Team chat",
            Preview = "Original message",
            Time = "12:34",
            Unread = 4,
            AvatarUrl = "mxc://localhost/room",
            Pictures = new Pictures(null),
        };
    }

    private static Window Open(RoomRow row)
    {
        row.Update();
        var panel = new StackPanel();
        panel.Children.Add(row);
        var window = new Window {
            Content = panel,
            Width = 360,
            Height = 180,
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        return window;
    }

    private static TextBlock Text(RoomRow row, string text)
    {
        return row.GetVisualDescendants().OfType<TextBlock>()
            .Single(t => t.Text == text);
    }

    private static Avatar Picture(RoomRow row)
    {
        return row.GetVisualDescendants().OfType<Avatar>().Single();
    }

    private static Border Parent(TextBlock label)
    {
        return Assert.IsType<Border>(label.GetVisualParent());
    }

    private static Color ColorOf(IBrush? brush)
    {
        return Assert.IsAssignableFrom<ISolidColorBrush>(brush).Color;
    }

    private static void SameTree(Visual[] before, RoomRow row)
    {
        var after = row.GetVisualDescendants().ToArray();
        Assert.Equal(before.Length, after.Length);
        for (var i = 0; i < before.Length; i++)
            Assert.Same(before[i], after[i]);
    }

    private static void Click(Window window, Control control,
        MouseButton button = MouseButton.Left)
    {
        window.UpdateLayout();
        var middle = control.TranslatePoint(new Point(
                control.Bounds.Width / 2, control.Bounds.Height / 2),
            window)!.Value;
        window.MouseDown(middle, button);
        window.MouseUp(middle, button);
    }

    [AvaloniaFact]
    public void An_update_still_reaches_the_name_and_the_height_of_the_row()
    {
        var row = Row();
        row.Update();
        Assert.Equal("Team chat", AutomationProperties.GetName(row));
        var height = row.Height;

        // Updated again with nothing changed, then with another title.
        row.Update();
        Assert.Equal("Team chat", AutomationProperties.GetName(row));
        row.Title = "Crew";
        row.Update();
        Assert.Equal("Crew", AutomationProperties.GetName(row));

        // An invitation has the height of its content; without it the row
        // has its own height again.
        row.Invite = ("Accept", "Decline", () => {
                }, () => {
                }
            );
        row.Update();
        Assert.True(double.IsNaN(row.Height));
        row.Invite = null;
        row.Update();
        Assert.Equal(height, row.Height);
        // The narrow strip is the height of a row even for an invitation.
        row.Invite = ("Accept", "Decline", () => {
                }, () => {
                }
            );
        row.Compact = true;
        row.Update();
        Assert.Equal(height, row.Height);
    }

    [AvaloniaFact]
    public void Updates_keep_the_subtree_and_do_not_reattach_the_avatar()
    {
        var row = Row();
        row.Muted = true;
        row.Pinned = true;
        var window = Open(row);
        try {
            var content = row.Child;
            var avatar = Picture(row);
            // Attaching again with this provider would clear the picture.
            using var image = new RenderTargetBitmap(new PixelSize(8, 8));
            avatar.Source = image;
            var tree = row.GetVisualDescendants().ToArray();
            var title = Text(row, row.Title);
            var preview = Text(row, row.Preview);
            var time = Text(row, row.Time);
            var count = Text(row, "4");
            var secondary = preview.Foreground;
            var number = count.Text;
            row.Update();
            Assert.Same(secondary, preview.Foreground);
            Assert.Same(number, count.Text);
            SameTree(tree, row);

            row.Preview = "A new message";
            row.Time = "12:35";
            row.Unread = 8;
            row.Selected = true;
            row.Muted = false;
            row.Pinned = false;
            row.Update();
            Assert.Same(content, row.Child);
            Assert.Same(avatar, Picture(row));
            Assert.Same(image, Assert.IsType<Image>(avatar.Child).Source);
            Assert.Equal("A new message", preview.Text);
            Assert.Equal("12:35", time.Text);
            Assert.Equal("8", count.Text);
            Assert.Equal(row.Title, title.Text);
            Assert.Equal(row.Title, AutomationProperties.GetName(row));
            Assert.All(row.GetVisualDescendants().OfType<Icon>(),
                icon => Assert.False(icon.IsVisible));
            SameTree(tree, row);

            row.Unread = 0;
            row.MarkedUnread = true;
            row.Update();
            Assert.False(count.IsVisible);
            Assert.True(Parent(count).IsVisible);
            SameTree(tree, row);
            row.Unread = 120;
            row.Update();
            Assert.True(count.IsVisible);
            Assert.Equal("99+", count.Text);
            SameTree(tree, row);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void The_avatar_changes_only_when_its_inputs_change()
    {
        var row = Row();
        var window = Open(row);
        try {
            var content = row.Child;
            var avatar = Picture(row);
            row.Title = new string(row.Title.ToCharArray());
            row.AvatarUrl = new string(row.AvatarUrl!.ToCharArray());
            row.Update();
            Assert.Same(avatar, Picture(row));

            void Replaced()
            {
                row.Update();
                var next = Picture(row);
                Assert.NotSame(avatar, next);
                Assert.Same(content, row.Child);
                avatar = next;
                row.Update();
                Assert.Same(avatar, Picture(row));
            }

            row.Title = "New name";
            Replaced();
            Assert.Equal("NN", Assert.IsType<TextBlock>(avatar.Child).Text);
            Assert.Equal("New name", AutomationProperties.GetName(avatar));
            Assert.Equal("New name", AutomationProperties.GetName(row));
            row.IsSpace = true;
            Replaced();
            Assert.Equal(new CornerRadius(12), avatar.CornerRadius);
            row.AvatarUrl = "mxc://localhost/other";
            Replaced();
            row.Pictures = new Pictures(null);
            Replaced();
            row.AvatarUrl = null;
            Replaced();
            row.Pictures = null;
            Replaced();
            row.IsSpace = false;
            Replaced();
            Assert.Equal(new CornerRadius(22), avatar.CornerRadius);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_font_change_updates_cached_labels_and_avatar_initials()
    {
        var row = Row();
        row.Invite = ("Accept", "Decline", () => {
                }, () => {
                }
            );
        var window = Open(row);
        try {
            var avatar = Picture(row);
            var labels = row.GetVisualDescendants().OfType<TextBlock>()
                .Where(t => t != avatar.Child).ToArray();
            Fonts.Use("monospace");
            row.Update();
            Assert.NotSame(avatar, Picture(row));
            Assert.All(row.GetVisualDescendants().OfType<TextBlock>(),
                label => Assert.Equal(Fonts.System, label.FontFamily));
            Assert.All(labels,
                label => Assert.Contains(label, row.GetVisualDescendants()));
            avatar = Picture(row);
            Fonts.Use("monospace");
            row.Update();
            Assert.Same(avatar, Picture(row));
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Theme_and_selection_recolour_existing_controls()
    {
        var row = Row();
        row.Muted = true;
        row.Pinned = true;
        row.Invite = ("Accept", "Decline", () => {
                }, () => {
                }
            );
        var window = Open(row);
        try {
            var tree = row.GetVisualDescendants().ToArray();
            var title = Text(row, row.Title);
            var preview = Text(row, row.Preview);
            var time = Text(row, row.Time);
            var count = Text(row, "4");
            var badge = Parent(count);
            var accept = Text(row, "Accept");
            var decline = Text(row, "Decline");
            foreach (var theme in new[] {
                         "light", "dark", "dark-green"
                     }) {
                var colors = Themes.Get(theme)!.Colors;
                ThemeScope.SetColors(window, colors);
                Assert.Equal(colors.Text, ColorOf(title.Foreground));
                Assert.Equal(colors.TextSecondary, ColorOf(preview.Foreground));
                Assert.Equal(colors.TextSecondary, ColorOf(time.Foreground));
                Assert.Equal(colors.BadgeMuted, ColorOf(badge.Background));
                Assert.Equal(colors.OnAccent, ColorOf(count.Foreground));
                Assert.Equal(colors.Accent, ColorOf(Parent(accept).Background));
                Assert.Equal(colors.OnAccent, ColorOf(accept.Foreground));
                Assert.Equal(colors.BgSecondary,
                    ColorOf(Parent(decline).Background));
                Assert.Equal(colors.Text, ColorOf(decline.Foreground));
                SameTree(tree, row);

                row.Selected = true;
                row.Update();
                Assert.Equal(colors.Selected, ColorOf(row.Background));
                Assert.Equal(colors.OnSelected, ColorOf(title.Foreground));
                Assert.Equal(colors.OnSelectedSecondary,
                    ColorOf(preview.Foreground));
                Assert.Equal(colors.OnSelectedSecondary,
                    ColorOf(time.Foreground));
                Assert.All(row.GetVisualDescendants().OfType<Icon>(),
                    icon => Assert.Equal(colors.OnSelectedSecondary,
                        ColorOf(icon.Color)));
                Assert.Equal(colors.OnSelected, ColorOf(badge.Background));
                Assert.Equal(colors.Selected, ColorOf(count.Foreground));
                Assert.Equal(colors.OnSelected,
                    ColorOf(Parent(accept).Background));
                Assert.Equal(colors.Selected, ColorOf(accept.Foreground));
                SameTree(tree, row);

                row.Unread = 0;
                row.MarkedUnread = true;
                row.Update();
                Assert.Equal(12, badge.Width);
                Assert.Equal(12, badge.Height);
                Assert.False(count.IsVisible);
                Assert.Equal(colors.OnSelected, ColorOf(badge.Background));
                row.Selected = false;
                row.Update();
                Assert.Equal(colors.Badge, ColorOf(badge.Background));
                row.MarkedUnread = false;
                row.Update();
                Assert.False(badge.IsVisible);
                row.Unread = 4;
                row.Update();
                Assert.True(badge.IsVisible);
                SameTree(tree, row);
            }
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Compact_transitions_keep_the_avatar_and_badge()
    {
        var row = Row();
        row.Compact = true;
        row.Selected = true;
        row.Muted = true;
        row.Unread = 120;
        var window = Open(row);
        try {
            var content = row.Child;
            var avatar = Picture(row);
            var count = Text(row, "99+");
            var badge = Parent(count);
            var title = Text(row, row.Title);
            var column = title.GetVisualAncestors().OfType<StackPanel>()
                .First();
            var colors = Themes.Get("light")!.Colors;
            Assert.Same(avatar.GetVisualParent(), badge.GetVisualParent());
            Assert.False(column.IsVisible);
            Assert.Equal(RoomRow.RowHeight, row.Height);
            Assert.Equal(44, avatar.Width);
            Assert.Equal(default, avatar.Margin);
            Assert.Equal(20, badge.MinWidth);
            Assert.Equal(20, badge.Height);
            Assert.Equal(11, count.FontSize);
            Assert.Equal(FontWeight.Bold, count.FontWeight);
            Assert.Equal(new Thickness(0, -4, -6, 0), badge.Margin);
            Assert.Equal(new Thickness(2), badge.BorderThickness);
            Assert.Equal(colors.BadgeMuted, ColorOf(badge.Background));
            Assert.Equal(colors.OnAccent, ColorOf(count.Foreground));
            Assert.Equal(colors.Selected, ColorOf(badge.BorderBrush));

            colors = Themes.Get("dark")!.Colors;
            ThemeScope.SetColors(window, colors);
            Assert.Same(avatar, Picture(row));
            Assert.Equal(colors.BadgeMuted, ColorOf(badge.Background));
            Assert.Equal(colors.Selected, ColorOf(badge.BorderBrush));
            row.Unread = 0;
            row.MarkedUnread = true;
            row.Selected = false;
            row.Update();
            Assert.Equal(13, badge.Width);
            Assert.Equal(13, badge.Height);
            Assert.Equal(new CornerRadius(7), badge.CornerRadius);
            Assert.Equal(new Thickness(0, -1, -2, 0), badge.Margin);
            Assert.False(count.IsVisible);
            Assert.Equal(colors.Badge, ColorOf(badge.Background));
            Assert.Equal(colors.Bg, ColorOf(badge.BorderBrush));

            row.Compact = false;
            row.Unread = 8;
            row.Update();
            window.UpdateLayout();
            Assert.Same(content, row.Child);
            Assert.Same(avatar, Picture(row));
            Assert.Same(count, Text(row, "8"));
            Assert.True(column.IsVisible);
            Assert.NotSame(avatar.GetVisualParent(), badge.GetVisualParent());
            Assert.Equal(new Thickness(0, 0, 11, 0), avatar.Margin);
            Assert.Equal(22, badge.MinWidth);
            Assert.Equal(22, badge.Height);
            Assert.Equal(13, count.FontSize);
            Assert.Equal(FontWeight.SemiBold, count.FontWeight);
            Assert.Equal(new Thickness(8, 0, 0, 0), badge.Margin);
            Assert.Equal(default, badge.BorderThickness);
            Assert.Null(badge.BorderBrush);
            row.Compact = true;
            row.Update();
            Assert.Same(avatar, Picture(row));
            Assert.Same(avatar.GetVisualParent(), badge.GetVisualParent());
            row.Unread = 0;
            row.MarkedUnread = false;
            row.Update();
            Assert.False(badge.IsVisible);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Icons_are_created_once_and_keep_their_positions()
    {
        var row = Row();
        var window = Open(row);
        try {
            Assert.Empty(row.GetVisualDescendants().OfType<Icon>());
            row.Pinned = true;
            row.Update();
            var pin = row.GetVisualDescendants().OfType<Icon>().Single();
            Assert.Equal("pin", pin.Glyph);
            Assert.Equal(1, Grid.GetColumn(pin));
            row.Muted = true;
            row.Update();
            var mute = row.GetVisualDescendants().OfType<Icon>()
                .Single(i => i.Glyph == "bellOff");
            Assert.Equal(1, Grid.GetColumn(mute));
            Assert.Equal(2, Grid.GetColumn(pin));
            row.Muted = false;
            row.Pinned = false;
            row.Update();
            Assert.False(mute.IsVisible);
            Assert.False(pin.IsVisible);
            row.Pinned = true;
            row.Update();
            Assert.True(pin.IsVisible);
            Assert.Equal(1, Grid.GetColumn(pin));
            row.Muted = true;
            row.Update();
            Assert.True(mute.IsVisible);
            Assert.Equal(2, Grid.GetColumn(pin));
            Assert.Equal(2, row.GetVisualDescendants().OfType<Icon>().Count());
            Assert.Contains(pin, row.GetVisualDescendants());
            Assert.Contains(mute, row.GetVisualDescendants());
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Invite_buttons_keep_current_actions_without_clicking_the_row()
    {
        var row = Row();
        var oldCalls = 0;
        var accepts = 0;
        var declines = 0;
        var clicks = 0;
        row.Click += (_, _) => clicks++;
        row.Invite = ("Accept", "Decline", () => oldCalls++, () => oldCalls++);
        var window = Open(row);
        try {
            var accept = Text(row, "Accept");
            var decline = Text(row, "Decline");
            var buttons = Assert.IsType<StackPanel>(
                Parent(accept).GetVisualParent());
            row.Invite = ("Join", "Ignore", () => accepts++, () => declines++);
            row.Update();
            Assert.True(double.IsNaN(row.Height));
            Assert.Same(accept, Text(row, "Join"));
            Assert.Same(decline, Text(row, "Ignore"));
            Click(window, Parent(accept));
            Click(window, Parent(decline));
            Assert.Equal(0, oldCalls);
            Assert.Equal(1, accepts);
            Assert.Equal(1, declines);
            Assert.Equal(0, clicks);

            row.Invite = null;
            row.Update();
            Assert.False(buttons.IsVisible);
            Assert.Equal(RoomRow.RowHeight, row.Height);
            row.Invite = ("Join", "Ignore", () => accepts++, () => declines++);
            row.Compact = true;
            row.Update();
            Assert.False(buttons.IsVisible);
            Assert.Equal(RoomRow.RowHeight, row.Height);
            row.Compact = false;
            row.Update();
            Assert.True(buttons.IsVisible);
            Assert.Same(accept, Text(row, "Join"));
            Assert.Same(decline, Text(row, "Ignore"));
            Assert.True(double.IsNaN(row.Height));
            var latest = 0;
            row.Invite = ("Join", "Ignore", () => latest++, () => latest++);
            Click(window, Parent(accept));
            Click(window, Parent(decline));
            Assert.Equal(2, latest);
            Assert.Equal(1, accepts);
            Assert.Equal(1, declines);
            Assert.Equal(0, clicks);

            row.Invite = null;
            row.Update();
            Click(window, Text(row, row.Title));
            Assert.Equal(1, clicks);
            var menus = 0;
            row.MenuRequested += (_, _) => menus++;
            Click(window, Text(row, row.Title), MouseButton.Right);
            Assert.Equal(1, menus);
            Assert.Equal(1, clicks);
        } finally {
            window.Close();
        }
    }
}
