using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Overlays;
using Xunit;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

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

    // ------------------------------------------------------------------ Menu

    private static (Window Window, Border Anchor) Anchored(double top)
    {
        var anchor = new Border {
            Width = 120,
            Height = 36,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Top,
            Margin = new Thickness(40, top, 0, 0),
        };
        var root = new Grid();
        root.Children.Add(anchor);
        return (Open(root), anchor);
    }

    private static List<MenuItem> Items(int n)
    {
        return Enumerable.Range(0, n)
            .Select(i => new MenuItem($"Item {i}", () => {
            }))
            .ToList();
    }

    [AvaloniaFact]
    public void A_menu_grows_from_the_corner_at_its_anchor()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();

        // Below its anchor, from the left: from the top left.
        menu.Show(anchor, window, Items(3));
        Assert.Equal(new RelativePoint(0, 0, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        Assert.Equal(0, menu.Surface.Opacity);
        clock.Finish();
        Assert.Equal(1, menu.Surface.Opacity);
        Assert.Null(menu.Surface.RenderTransform);

        // From the right edge of its anchor: from the top right.
        menu.AlignRight = true;
        menu.Show(anchor, window, Items(3));
        Assert.Equal(new RelativePoint(1, 0, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        clock.Finish();
        menu.Close();
        clock.Finish();
    }

    [AvaloniaFact]
    public void A_menu_that_flips_above_its_anchor_grows_from_the_bottom()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(340);
        var menu = new Menu();
        menu.Show(anchor, window, Items(4));
        Assert.True(menu.Top < 340);
        Assert.Equal(new RelativePoint(0, 1, RelativeUnit.Relative),
            menu.Surface.RenderTransformOrigin);
        clock.Finish();
    }

    [AvaloniaFact]
    public void A_closed_menu_is_closed_at_once_and_goes_when_it_has_faded()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();
        menu.Show(anchor, window, Items(3));
        var shade = (Control)menu.Surface.Parent!;
        clock.Finish();

        menu.Close();
        Assert.False(menu.IsOpen);
        Assert.NotNull(shade.Parent);
        Assert.False(shade.IsHitTestVisible);
        // A menu is gone sooner than a dialog.
        var took = clock.Finish();
        Assert.InRange(took, 0, 116);
        Assert.Null(shade.Parent);
    }

    [AvaloniaFact]
    public void A_menu_shown_again_while_it_goes_stays()
    {
        using var clock = new FrameClock();
        var (window, anchor) = Anchored(40);
        var menu = new Menu();
        menu.Show(anchor, window, Items(3));
        var shade = (Control)menu.Surface.Parent!;
        clock.Finish();
        menu.Close();
        clock.Frame();
        clock.Frame(32);
        menu.Show(anchor, window, Items(3));
        Assert.True(menu.IsOpen);
        clock.Finish();
        Assert.NotNull(shade.Parent);
        Assert.True(menu.IsOpen);
    }
}
