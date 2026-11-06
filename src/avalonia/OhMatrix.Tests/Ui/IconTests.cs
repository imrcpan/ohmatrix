using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class IconTests {
    // The pixels of the control, drawn at 4 times its size.
    private static WriteableBitmap Draw(Control control, double size)
    {
        var window = new Window {
            Width = size,
            Height = size,
            Content = control,
            Background = Brushes.White
        };
        window.Show();
        return window.CaptureRenderedFrame()!;
    }

    private static int Dark(WriteableBitmap bitmap)
    {
        using var buffer = bitmap.Lock();
        var count = 0;
        unsafe {
            var p = (byte*)buffer.Address;
            for (var y = 0; y < buffer.Size.Height; y++) {
                for (var x = 0; x < buffer.Size.Width; x++) {
                    var px = p + y * buffer.RowBytes + x * 4;
                    if (px[0] < 128 && px[1] < 128 && px[2] < 128)
                        count++;
                }
            }
        }

        return count;
    }

    [AvaloniaFact]
    public void Every_icon_draws_something()
    {
        foreach (var name in IconData.Paths.Keys) {
            var icon = new Icon {
                Glyph = name,
                Size = 48,
                Color = Brushes.Black
            };
            Assert.True(Dark(Draw(icon, 48)) > 20, $"the icon {name} drew nothing");
        }
    }

    [AvaloniaFact]
    public void A_solid_icon_is_filled_and_a_line_icon_is_not()
    {
        var play = Dark(Draw(new Icon {
            Glyph = "play",
            Size = 48,
            Color = Brushes.Black
        }, 48));
        var circle = Dark(Draw(new Icon {
            Glyph = "globe",
            Size = 48,
            Color = Brushes.Black
        }, 48));
        Assert.True(play > 400, $"play has {play} dark pixels");
        Assert.True(circle < play * 2);
    }

    [AvaloniaFact]
    public void The_icon_is_as_big_as_its_size()
    {
        var icon = new Icon {
            Glyph = "chat",
            Size = 30,
            Color = Brushes.Black
        };
        icon.Measure(Size.Infinity);
        Assert.Equal(new Size(30, 30), icon.DesiredSize);
    }
}
