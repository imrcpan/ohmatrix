using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Xunit;
using Spinner = OhMatrix.Core.Ui.Widgets.Spinner;

namespace OhMatrix.Tests.Ui;

public class SpinnerTests {
    // How many pixels of the window are dark now.
    private static int Dark(Window window)
    {
        window.UpdateLayout();
        var bitmap = window.CaptureRenderedFrame()!;
        using var buffer = bitmap.Lock();
        var dark = 0;
        unsafe {
            var p = (byte*)buffer.Address;
            for (var y = 0; y < buffer.Size.Height; y++) {
                for (var x = 0; x < buffer.Size.Width; x++) {
                    var px = p + y * buffer.RowBytes + x * 4;
                    if (px[0] < 128 && px[1] < 128 && px[2] < 128)
                        dark++;
                }
            }
        }

        return dark;
    }

    [AvaloniaFact]
    public void The_ring_follows_its_size_and_colour_when_drawn_again()
    {
        // The path and the pen are kept between draws, and only the angle
        // changes (the running animation sets it, and the ring turns between
        // two looks, so the counts are compared with some room): a new size
        // or colour must still show.
        var spinner = new Spinner {
            Size = 48,
            Color = Brushes.Black
        };
        var window = new Window {
            Content = spinner,
            Width = 64,
            Height = 64,
            Background = Brushes.White
        };
        window.Show();
        var full = Dark(window);
        Assert.True(full > 100);
        Assert.InRange(Dark(window), full * 0.9, full * 1.1);
        spinner.Size = 24;
        var small = Dark(window);
        Assert.InRange(small, 20, full / 2);
        spinner.Size = 48;
        Assert.InRange(Dark(window), full * 0.9, full * 1.1);
        spinner.Color = Brushes.White;
        Assert.Equal(0, Dark(window));
        spinner.Color = Brushes.Black;
        Assert.InRange(Dark(window), full * 0.9, full * 1.1);
    }
}
