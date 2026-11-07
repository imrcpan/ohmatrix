using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class DialogTests {
    private static Window Open(Dialog dialog, string theme,
        bool withButtons = true)
    {
        var colors = Themes.Get(theme)!.Colors;
        var window = new Window {
            Content = new Grid {
                Background = new SolidColorBrush(colors.BgSecondary)
            },
            Width = 480,
            Height = 400,
        };
        window.Show();
        var buttons = withButtons
            ? new Control[] {
                new PrimaryButton {
                    Title = "Keep"
                },
                new TextButton {
                    Title = "Revert"
                }
            }
            : [];
        dialog.Show(window, colors, "Keep this zoom?",
            "It goes back in 15 seconds.", buttons);
        window.UpdateLayout();
        return window;
    }

    [AvaloniaFact]
    public void Card_is_centred_and_no_wider_than_400()
    {
        var dialog = new Dialog();
        var window = Open(dialog, "light");
        Assert.True(dialog.IsOpen);
        Assert.Equal(400, dialog.Card.Bounds.Width, 0.5);
        Assert.Equal((480 - 400) / 2.0, dialog.Card.Bounds.X, 0.5);
    }

    [AvaloniaFact]
    public void Escape_closes_and_reports()
    {
        var dialog = new Dialog();
        var called = false;
        dialog.OnClose = () => called = true;
        var window = Open(dialog, "light");
        window.KeyPress(Key.Escape, RawInputModifiers.None, PhysicalKey.Escape,
            null);
        Assert.False(dialog.IsOpen);
        Assert.True(called);
    }

    [AvaloniaFact]
    public void Press_outside_closes_unless_modal()
    {
        var open = new Dialog();
        var window = Open(open, "light");
        window.MouseDown(new Point(5, 5), MouseButton.Left);
        Assert.False(open.IsOpen);

        var modal = new Dialog {
            Modal = true
        };
        var other = Open(modal, "light");
        other.MouseDown(new Point(5, 5), MouseButton.Left);
        Assert.True(modal.IsOpen);
    }

    [AvaloniaFact]
    public void Renders_in_light_and_dark()
    {
        foreach (var theme in new[] {
                     "light", "dark"
                 }) {
            var dialog = new Dialog();
            var window = Open(dialog, theme);
            var frame = window.CaptureRenderedFrame();
            Assert.NotNull(frame);
            var path =
                Environment.GetEnvironmentVariable("OHMATRIX_DIALOG_SHEET");
            if (!string.IsNullOrEmpty(path))
                frame.Save(path.Replace(".png", $"-{theme}.png"),
                    new PngBitmapEncoderOptions());
        }
    }
}
