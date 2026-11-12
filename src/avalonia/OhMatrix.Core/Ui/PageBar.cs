using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui;

/// <summary>The bar at the top of a page of the left pane (<c>PageHeader</c>): Back, then the title; 56 high, with no line under it.</summary>
public static class PageBar {
    /// <summary>Fills <paramref name="bar"/> with the back button and the title and gives it its height.</summary>
    public static void Fill(Border bar, ColorTokens colors, string title,
        string backLabel,
        Action onBack, double titleSize = 22)
    {
        var back = new IconButton("back", backLabel, 26);
        back.Click += (_, _) => onBack();
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            Margin = new Thickness(8, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };
        row.Children.Add(back);
        var heading = new TextBlock {
            Text = title,
            FontSize = titleSize,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(colors.Text),
            VerticalAlignment = VerticalAlignment.Center,
        };
        Fonts.Center(heading);
        row.Children.Add(heading);
        bar.Height = 56;
        bar.BorderThickness = new Thickness(0);
        bar.Child = row;
    }

    /// <summary>The room at the left and the right of a title, and of the rows, headings and notes under it in the panes of the settings window.</summary>
    public const double Side = 24;

    /// <summary>The height of the bar over a chat and over its info panel, so that the lines under them meet.</summary>
    public const double HeaderHeight = 64;

    /// <summary>
    /// The room above the heading of a pane of the settings window, and the height of its bar: the heading sits at the top of the bar, so the room
    /// under it is what is left. The first entry of the list beside it is level with the heading.
    /// </summary>
    public const double TitleTop = 21;

    public const double TitleHeight = 62;

    /// <summary>
    /// Fills <paramref name="bar"/> with the title alone, level with the rows under it: the heading of a pane of the settings window, which has no
    /// way back to go (the list at its left is the way to the others).
    /// </summary>
    public static void Title(Border bar, ColorTokens colors, string title,
        double titleSize = 22)
    {
        var heading = new TextBlock {
            Text = title,
            FontSize = titleSize,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(colors.Text),
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(Side, TitleTop, Side, 0),
        };
        Fonts.Center(heading);
        bar.Height = TitleHeight;
        bar.BorderThickness = new Thickness(0);
        bar.Child = heading;
    }
}
