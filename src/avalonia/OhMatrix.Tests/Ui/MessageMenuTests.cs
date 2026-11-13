using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Chat.Messages;
using Xunit;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Tests.Ui;

public class MessageMenuTests {
    [AvaloniaFact]
    public void The_list_of_actions_has_a_shadow_as_the_bar_of_reactions_has()
    {
        foreach (var theme in new[] {
                     "light", "dark"
                 }) {
            var colors = Themes.Get(theme)!.Colors;
            var window = new Window {
                Content = new Grid {
                    Background = Brushes.White
                },
                Width = 480,
                Height = 400,
            };
            window.Show();
            var menu = new MessageMenu();
            menu.Show(window, colors, new Point(100, 60),
                ["\U0001F44D", "\U0001F602", "\U0001F64F"],
                new HashSet<string>(), _ => {
                }, [
                    new MenuItem("Copy", () => {
                    }, "copy"),
                    new MenuItem("Forward", () => {
                    }, "forward"),
                ]);
            window.UpdateLayout();

            // Where the list is: from its first row to its last one, with 2
            // of margin above and below, and 240 wide.
            var first = menu.Rows[0].TranslatePoint(new Point(0, 0), window)!
                .Value;
            var last = menu.Rows[^1].TranslatePoint(
                new Point(0, menu.Rows[^1].Bounds.Height), window)!.Value;
            var frame = window.CaptureRenderedFrame()!;
            // The page is white, so a shadow is what is not: under the list
            // and at its side, where the shadow is made of the surface and
            // not of the clip that cuts the rows to the corners.
            var under = Lightness(frame, (int)(first.X + 120),
                (int)last.Y + 2 + 8);
            var beside = Lightness(frame, (int)first.X - 6,
                (int)((first.Y + last.Y) / 2));
            Assert.True(under < 250, $"{theme}: {under} under the list");
            Assert.True(beside < 252, $"{theme}: {beside} beside the list");
        }
    }

    // The mean of red, green and blue of a pixel.
    private static int Lightness(Avalonia.Media.Imaging.WriteableBitmap frame,
        int x, int y)
    {
        using var buffer = frame.Lock();
        unsafe {
            var px = (byte*)buffer.Address + y * buffer.RowBytes + x * 4;
            return (px[0] + px[1] + px[2]) / 3;
        }
    }
}
