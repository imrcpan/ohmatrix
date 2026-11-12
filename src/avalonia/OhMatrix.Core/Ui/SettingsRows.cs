using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The rows, headings and notes of the panes of the settings window. They are made for the desktop and are not shared with the other pages: a
/// row is 36 high, set in from the edges with the corners of a row of the list at the left, and written in the same size as that list.
/// </summary>
public static class SettingsRows {
    // A row is set in by this much, so that its text is level with the
    // headings (Side) and its hover shows a margin round the text.
    private const double Inset = 12;

    /// <summary>The heading of a group of rows.</summary>
    public static TextBlock Caption(ColorTokens c, string text)
    {
        return new TextBlock {
            Text = text,
            FontSize = SettingsShell.CaptionFont,
            FontWeight = FontWeight.SemiBold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Accent),
            Margin = new Thickness(SettingsShell.Side, 16, 12, 4),
        };
    }

    /// <summary>The small explanation under a row or a group.</summary>
    public static TextBlock Note(ColorTokens c, string text)
    {
        return new TextBlock {
            Text = text,
            FontSize = SettingsShell.NoteFont,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.TextSecondary),
            TextWrapping = TextWrapping.Wrap,
            Margin = new Thickness(SettingsShell.Side, 2, 20, 6),
        };
    }

    /// <summary>
    /// A row with an icon and a name, the value of the setting at its right, and a small arrow when there is something to open. With no
    /// <paramref name="press"/> the row is only shown.
    /// </summary>
    public static Border Option(ColorTokens c, string glyph, string label,
        Action? press, string? value = null, bool arrow = true,
        bool danger = false)
    {
        var line = new Grid {
            ColumnDefinitions = value == null
                ? new ColumnDefinitions("Auto,*,Auto")
                : new ColumnDefinitions("Auto,Auto,*,Auto")
        };
        line.Children.Add(Mark(c, glyph, danger));
        var name = Text(label, SettingsShell.RowFont,
            danger ? c.Danger : c.Text);
        Grid.SetColumn(name, 1);
        line.Children.Add(name);
        if (value != null) {
            var shown = Text(value, SettingsShell.ValueFont, c.TextSecondary);
            shown.Margin = new Thickness(12, 0, 6, 0);
            shown.TextAlignment = TextAlignment.Right;
            Grid.SetColumn(shown, 2);
            line.Children.Add(shown);
        }

        if (arrow && press != null) {
            var chevron = new Icon {
                Glyph = "chevronRight",
                Size = 14,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(chevron, value == null ? 2 : 3);
            line.Children.Add(chevron);
        }

        return Row(c, label, line, press);
    }

    /// <summary>
    /// A row whose value is a drop-down: the value and a small arrow down, in a field of their own that takes the tint under the pointer. The
    /// row itself has no tint; a press anywhere on it opens the list. <paramref name="field"/> is the field, where the list is shown.
    /// </summary>
    public static Border Dropdown(ColorTokens c, string glyph, string label,
        Action open, string value, out Border field)
    {
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        line.Children.Add(Mark(c, glyph, false));
        var name = Text(label, SettingsShell.RowFont, c.Text);
        Grid.SetColumn(name, 1);
        line.Children.Add(name);
        var shown = Text(value, SettingsShell.ValueFont, c.TextSecondary);
        shown.TextAlignment = TextAlignment.Right;
        var arrow = new Icon {
            Glyph = "chevronDown",
            Size = 12,
            Color = new SolidColorBrush(c.TextSecondary),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var box = new Border {
            CornerRadius = new CornerRadius(6),
            Padding = new Thickness(8, 0, 6, 0),
            Height = 28,
            Background = Brushes.Transparent,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new StackPanel {
                Orientation = Orientation.Horizontal,
                Spacing = 4,
                Children = {
                    shown,
                    arrow
                },
            },
        };
        var over = new SolidColorBrush(c.Hover);
        box.PointerEntered += (_, _) => box.Background = over;
        box.PointerExited += (_, _) => box.Background = Brushes.Transparent;
        Grid.SetColumn(box, 2);
        line.Children.Add(box);
        field = box;
        return Row(c, label, line, open, tint: false);
    }

    /// <summary>A row with an icon, a name and a switch at its right; the switch does the work, not the row.</summary>
    public static Border Switch(ColorTokens c, string glyph, string label,
        Toggle toggle)
    {
        toggle.VerticalAlignment = VerticalAlignment.Center;
        if (toggle.Parent is Panel old)
            old.Children.Remove(toggle);
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        line.Children.Add(Mark(c, glyph, false));
        var name = Text(label, SettingsShell.RowFont, c.Text);
        Grid.SetColumn(name, 1);
        line.Children.Add(name);
        Grid.SetColumn(toggle, 2);
        line.Children.Add(toggle);
        return Row(c, label, line, null);
    }

    /// <summary>
    /// A row of a list of choices: the name, in <paramref name="font"/> when it is given, and a tick at the right of the one that is in use.
    /// </summary>
    public static Border Choice(ColorTokens c, string label, bool active,
        Action choose, FontFamily? font = null)
    {
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        var name = Text(label, SettingsShell.RowFont, c.Text);
        if (font != null)
            name.FontFamily = font;
        line.Children.Add(name);
        if (active) {
            var tick = new Icon {
                Glyph = "check",
                Size = SettingsShell.RowIcon,
                Color = new SolidColorBrush(c.Accent),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(tick, 1);
            line.Children.Add(tick);
        }

        return Row(c, label, line, choose);
    }

    /// <summary>
    /// A read-only field that holds a path, across the whole pane. A path that is too long is cut at its start with three dots, so its end, the
    /// name of the folder, is what is seen; the whole path is in the tip.
    /// </summary>
    public static Border PathField(ColorTokens c, string shown, string full)
    {
        var text = new EllipsisText {
            Text = shown,
            FromStart = true,
            FontSize = SettingsShell.ValueFont,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(c.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        var field = new Border {
            Height = 34,
            Margin =
                new Thickness(SettingsShell.Side, 0, SettingsShell.Side, 0),
            Padding = new Thickness(12, 0),
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(c.BgSecondary),
            Child = text,
        };
        ToolTip.SetTip(field, full);
        Avalonia.Automation.AutomationProperties.SetName(field, full);
        return field;
    }

    /// <summary>
    /// A button of the pane: an icon and its words on a field of the secondary colour. Without <paramref name="enabled"/> it is drawn faded and
    /// does nothing.
    /// </summary>
    public static Border Action(ColorTokens c, string glyph, string label,
        Action press, bool enabled = true)
    {
        var words = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            VerticalAlignment = VerticalAlignment.Center,
            Children = {
                new Icon {
                    Glyph = glyph,
                    Size = 14,
                    Color = new SolidColorBrush(c.Text),
                    VerticalAlignment = VerticalAlignment.Center,
                },
                new TextBlock {
                    Text = label,
                    FontSize = SettingsShell.ValueFont,
                    FontWeight = FontWeight.Medium,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(c.Text),
                    VerticalAlignment = VerticalAlignment.Center,
                },
            },
        };
        var button = new Border {
            Height = 32,
            Padding = new Thickness(12, 0),
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(c.BgSecondary),
            Opacity = enabled ? 1 : 0.4,
            Child = words,
        };
        if (enabled) {
            button.Cursor = new Cursor(StandardCursorType.Hand);
            var over = new SolidColorBrush(c.Hover);
            button.PointerEntered += (_, _) => button.Background = over;
            button.PointerExited += (_, _) =>
                button.Background = new SolidColorBrush(c.BgSecondary);
            button.PointerPressed += (_, e) => {
                e.Handled = true;
                press();
            };
        }

        Avalonia.Automation.AutomationProperties.SetName(button, label);
        return button;
    }

    private static Icon Mark(ColorTokens c, string glyph, bool danger)
    {
        return new Icon {
            Glyph = glyph,
            Size = SettingsShell.RowIcon,
            Color = new SolidColorBrush(danger ? c.Danger : c.TextSecondary),
            Margin = new Thickness(0, 0, 12, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
    }

    private static TextBlock Text(string text, double size, Color color)
    {
        var block = new TextBlock {
            Text = text,
            FontSize = size,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(color),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Fonts.Center(block);
        return block;
    }

    // The frame of a row: 36 high, set in, with a tint under the pointer
    // when it can be pressed.
    private static Border Row(ColorTokens c, string label, Control content,
        Action? press, bool tint = true)
    {
        var row = new Border {
            Height = SettingsShell.RowHeight,
            Margin = new Thickness(SettingsShell.Side - Inset, 3),
            Padding = new Thickness(Inset, 0),
            CornerRadius = new CornerRadius(8),
            Background = Brushes.Transparent,
            Child = content,
        };
        if (press != null) {
            row.Cursor = new Cursor(StandardCursorType.Hand);
            if (tint) {
                var over = new SolidColorBrush(c.Hover);
                row.PointerEntered += (_, _) => row.Background = over;
                row.PointerExited += (_, _) =>
                    row.Background = Brushes.Transparent;
            }

            row.PointerPressed += (_, e) => {
                e.Handled = true;
                press();
            };
        }

        Avalonia.Automation.AutomationProperties.SetName(row, label);
        return row;
    }
}
