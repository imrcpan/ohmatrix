using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Overlays;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// How the overlays come and go with motion on (the other tests run with it off, and look at where a change ends): a closed overlay is closed
/// at once, and is taken off the screen when it has faded away.
/// </summary>
public class OverlayMotionTests {
    private static Window Open(Control? content = null)
    {
        var window = new Window {
            Content = content ?? new Grid(),
            Width = 480,
            Height = 400
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        return window;
    }

    // ---------------------------------------------------------------- Dialog

    private static Control ShadeOf(Dialog dialog)
    {
        return (Control)dialog.Card.Parent!;
    }

    private static void Show(Dialog dialog, Window window)
    {
        dialog.Show(window, Themes.Get("light")!.Colors, "Title", "Message");
    }

    [AvaloniaFact]
    public void A_dialog_fades_in_and_its_card_grows()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        Assert.True(dialog.IsOpen);
        Assert.Equal(0, shade.Opacity);
        Assert.NotNull(dialog.Card.RenderTransform);
        Assert.Equal(1, dialog.Card.Opacity);

        clock.Finish();
        Assert.True(dialog.IsOpen);
        Assert.Equal(1, shade.Opacity);
        Assert.Null(dialog.Card.RenderTransform);
    }

    [AvaloniaFact]
    public void A_closed_dialog_is_closed_at_once_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Finish();

        dialog.Close();
        Assert.False(dialog.IsOpen);
        // It is still on the screen, fading, and the press goes through it.
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        clock.Finish();
        Assert.Null(shade.Parent);
        Assert.False(dialog.IsOpen);
    }

    [AvaloniaFact]
    public void A_dialog_closed_twice_closes_once()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Finish();
        dialog.Close();
        clock.Frame();
        clock.Frame(48);
        dialog.Close();
        clock.Finish();
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void Escape_while_a_dialog_goes_does_not_report_again()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        var reports = 0;
        dialog.OnClose = () => reports++;
        var window = Open();
        Show(dialog, window);
        clock.Finish();

        window.KeyPress(Key.Escape, RawInputModifiers.None,
            PhysicalKey.Escape, null);
        Assert.Equal(1, reports);
        Assert.False(dialog.IsOpen);
        clock.Frame();
        clock.Frame(48);
        window.KeyPress(Key.Escape, RawInputModifiers.None,
            PhysicalKey.Escape, null);
        Assert.Equal(1, reports);
        clock.Finish();
        Assert.Equal(1, reports);
    }

    [AvaloniaFact]
    public void A_dialog_shown_while_it_goes_is_shown_afresh_and_stays()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        var window = Open();
        Show(dialog, window);
        var shade = ShadeOf(dialog);
        clock.Finish();
        dialog.Close();
        clock.Frame();
        clock.Frame(48);

        Show(dialog, window);
        Assert.True(dialog.IsOpen);
        Assert.True(shade.IsHitTestVisible);
        Assert.Equal(0, shade.Opacity);
        clock.Finish();
        // What was going is not taken away when its time is over.
        Assert.NotNull(shade.Parent);
        Assert.Equal(1, shade.Opacity);
        Assert.True(dialog.IsOpen);
    }

    [AvaloniaFact]
    public void A_dialog_that_is_retired_is_taken_away_at_once()
    {
        using var clock = new FrameClock();
        var dialog = new Dialog();
        Show(dialog, Open());
        var shade = ShadeOf(dialog);
        clock.Frame();
        dialog.Retire();
        Assert.Null(shade.Parent);
        Assert.False(dialog.IsOpen);
        clock.Finish();
        Assert.Null(shade.Parent);
    }
}
