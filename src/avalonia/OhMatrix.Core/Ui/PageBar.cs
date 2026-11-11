using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>The bar at the top of a page of the left pane (<c>PageHeader</c>): Back, then the title; 56 high, with no line under it.</summary>
public static class PageBar {
    /// <summary>Fills <paramref name="bar"/> with the back button and the title and gives it its height.</summary>
    public static void Fill(Border bar, ColorTokens colors, string title,
        string backLabel,
        Action onBack)
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
        row.Children.Add(new TextBlock {
            Text = title,
            FontSize = 22,
            FontWeight = FontWeight.Bold,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(colors.Text),
            VerticalAlignment = VerticalAlignment.Center,
        });
        bar.Height = 56;
        bar.BorderThickness = new Thickness(0);
        bar.Child = row;
    }
}
