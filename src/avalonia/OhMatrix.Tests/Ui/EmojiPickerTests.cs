using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Chat.Composer;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class EmojiPickerTests {
    [AvaloniaFact]
    public void The_tiles_that_come_in_are_not_made_again_by_the_first_layout()
    {
        using var clock = new FrameClock();
        var anchor = new Border {
            Width = 40,
            Height = 40,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Bottom,
            Margin = new Thickness(20, 0, 0, 20),
        };
        var window = new Window {
            Content = new Grid {
                Children = {
                    anchor
                }
            },
            Width = 480,
            Height = 400
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        window.UpdateLayout();
        var picker = new EmojiPicker();
        picker.Show(anchor, window, Themes.Get("light")!.Colors, [], "Search",
            _ => {
            });
        var first = picker.Tiles[0];
        // The tile is hidden, to come in.
        Assert.Equal(0, first.Opacity);
        window.UpdateLayout();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Same(first, picker.Tiles[0]);
        clock.Finish();
        Assert.Equal(1, first.Opacity);
        Assert.Null(first.RenderTransform);
    }
}
