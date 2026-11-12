using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Ui.Appearance;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class IconSheetTests {
    // Writes every icon on one sheet when OHMATRIX_ICON_SHEET names a file, to look at them; otherwise it only checks that it can be drawn.
    [AvaloniaFact]
    public void The_icons_can_be_drawn_on_a_sheet()
    {
        var grid = new WrapPanel {
            Width = 600,
            Background = Brushes.White
        };
        foreach (var name in IconData.Paths.Keys) {
            grid.Children.Add(new Icon {
                Glyph = name,
                Size = 40,
                Color = Brushes.Black,
                Margin = new(8)
            });
        }

        var window = new Window {
            Width = 600,
            Height = 440,
            Content = grid,
            Background = Brushes.White
        };
        window.Show();
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var path = Environment.GetEnvironmentVariable("OHMATRIX_ICON_SHEET");
        if (!string.IsNullOrEmpty(path))
            frame.Save(path, new PngBitmapEncoderOptions());
    }
}
