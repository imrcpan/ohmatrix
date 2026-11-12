using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The rows of a page that opens something (<c>NavRow</c>): an icon, the name, the value of the setting if it has one and a small arrow, on the
/// secondary surface with a margin round it, or flat across the pane with a tint under the pointer. The panels of the profile, the room and the
/// encryption are made of them.
/// </summary>
public static class NavRows {
    public static Border Make(Theming.ColorTokens c, string glyph,
        string label, Action open,
        double top, string? value = null, bool chevron = true,
        bool danger = false, bool flat = false, bool selectable = false,
        double height = 48)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        grid.Children.Add(new Icon {
            Glyph = glyph,
            Size = 21,
            Color = new SolidColorBrush(danger ? c.Danger : c.TextSecondary),
            Margin = new Thickness(0, 0, 14, 0),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var text = new TextBlock {
            Text = label,
            FontSize = 16,
            Foreground = new SolidColorBrush(danger ? c.Danger : c.Text),
            TextTrimming = TextTrimming.CharacterEllipsis,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Fonts.Center(text);
        Grid.SetColumn(text, 1);
        grid.Children.Add(text);
        if (value != null) {
            // A value that is not a setting can be selected to copy it.
            var shown =
                selectable ? new SelectableTextBlock() : new TextBlock();
            shown.Text = value;
            shown.FontSize = 15;
            shown.Foreground = new SolidColorBrush(c.TextSecondary);
            shown.Margin = new Thickness(12, 0, 6, 0);
            shown.TextAlignment = TextAlignment.Right;
            shown.TextTrimming = TextTrimming.CharacterEllipsis;
            shown.VerticalAlignment = VerticalAlignment.Center;
            Fonts.Center(shown);
            Grid.SetColumn(shown, 2);
            grid.Children.Add(shown);
            // The name keeps its room and the value takes what is left.
            grid.ColumnDefinitions =
                new ColumnDefinitions("Auto,Auto,*,Auto");
        }

        if (chevron) {
            var arrow = new Icon {
                Glyph = "chevronRight",
                Size = 16,
                Color = new SolidColorBrush(c.TextTertiary),
                VerticalAlignment = VerticalAlignment.Center,
            };
            Grid.SetColumn(arrow, value == null ? 2 : 3);
            grid.Children.Add(arrow);
        }

        // Flat: the rows follow each other with no gap, and have no
        // background of their own (the page behind them shows).
        var row = new Border {
            Margin = flat ? new Thickness(0) : new Thickness(12, top, 12, 0),
            Padding = new Thickness(flat ? 26 : 14, 0),
            Height = height,
            CornerRadius = flat
                ? new CornerRadius(0)
                : new CornerRadius(Radius.Control),
            Background = flat
                ? Brushes.Transparent
                : new SolidColorBrush(c.BgSecondary),
            Cursor = chevron ? new Cursor(StandardCursorType.Hand) : null,
            Child = grid,
        };
        row.PointerPressed += (_, e) => {
            e.Handled = true;
            open();
        };
        if (flat)
            Hover(row, c);
        Avalonia.Automation.AutomationProperties.SetName(row, label);
        return row;
    }

    /// <summary>The row takes the colour of a hovered row while the pointer is over it.</summary>
    public static void Hover(Border row, Theming.ColorTokens c)
    {
        var over = new SolidColorBrush(c.Hover);
        row.PointerEntered += (_, _) => row.Background = over;
        row.PointerExited += (_, _) => row.Background = Brushes.Transparent;
    }
}
