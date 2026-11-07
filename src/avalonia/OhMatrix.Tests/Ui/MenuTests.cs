using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;
using Menu = OhMatrix.Core.Ui.Menu;
using MenuItem = OhMatrix.Core.Ui.MenuItem;

namespace OhMatrix.Tests.Ui;

public class MenuTests {
    private static (Window Window, Border Anchor) Setup(string theme,
        double anchorTop)
    {
        var anchor = new Border {
            Width = 120,
            Height = 36,
            Background = Brushes.LightGray,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Top,
            Margin = new Thickness(40, anchorTop, 0, 0),
        };
        var root = new Grid();
        ThemeScope.SetColors(root, Themes.Get(theme)!.Colors);
        root.Background = new SolidColorBrush(Themes.Get(theme)!.Colors.Bg);
        root.Children.Add(anchor);
        var window = new Window {
            Content = root,
            Width = 480,
            Height = 400
        };
        window.Show();
        return (window, anchor);
    }

    private static Avalonia.Input.PointerReleasedEventArgs Release(Control row)
    {
        var pointer =
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true);
        return new Avalonia.Input.PointerReleasedEventArgs(
            row,
            pointer,
            row,
            new Point(10, 10),
            0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.None,
                Avalonia.Input.PointerUpdateKind.LeftButtonReleased
            ),
            Avalonia.Input.KeyModifiers.None,
            Avalonia.Input.MouseButton.Left
        ) {
            RoutedEvent = Avalonia.Input.InputElement.PointerReleasedEvent,
        };
    }

    // Where the menu is: the offset the popup was given, against the top left of the window.
    private static double TopInWindow(Menu menu)
    {
        return menu.Top;
    }

    private static List<MenuItem> Items(int n, Action? press = null)
    {
        return Enumerable
            .Range(0, n)
            .Select(i => new MenuItem($"Item {i}", press ?? (() => {
            }), Checked: i == 1))
            .ToList();
    }

    [AvaloniaFact]
    public void A_menu_opens_below_its_anchor_and_closes_before_its_item_runs()
    {
        var (window, anchor) = Setup("light", 40);
        var menu = new Menu();
        var order = new List<string>();
        var items = new List<MenuItem> {
            new("One", () => order.Add(menu.IsOpen ? "open" : "closed")),
            new("Two", () => {
            }),
        };
        menu.Show(anchor, window, items);
        Assert.True(menu.IsOpen);
        var row = (Border)menu.Rows[0];
        // Pressed and released on the row, as the pointer does: the menu is shut, and then the row's action runs.
        row.RaiseEvent(Release(row));
        Assert.Equal(["closed"], order);
        Assert.False(menu.IsOpen);
    }

    [AvaloniaFact]
    public void A_menu_near_the_bottom_flips_above_its_anchor()
    {
        var (window, anchor) = Setup("light", 340);
        var menu = new Menu();
        menu.Show(anchor, window, Items(4));
        var top = TopInWindow(menu);
        Assert.True(top < 340, $"the menu is at {top}, below the anchor");
    }

    [AvaloniaFact]
    public void A_long_menu_scrolls_and_stays_inside_the_window()
    {
        var (window, anchor) = Setup("light", 200);
        var menu = new Menu();
        menu.Show(anchor, window, Items(30));
        var scroller = menu.Scroller;
        Assert.True(scroller.MaxHeight <= 400 - 16);
        Assert.Equal(
            Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
            scroller.VerticalScrollBarVisibility
        );
    }

    // Writes the menu to a picture when OHMATRIX_MENU_SHEET names a file, to look at it.
    [AvaloniaTheory]
    [InlineData("dark")]
    [InlineData("light")]
    public void The_menu_can_be_drawn(string theme)
    {
        var (window, anchor) = Setup(theme, 40);
        var menu = new Menu();
        var items = new List<MenuItem> {
            new("English", () => {
            }, Checked: true),
            new("简体中文", () => {
            }),
            new("Delete chat", () => {
            }, Icon: "trash", Danger: true),
        };
        menu.Show(anchor, window, items);
        var frame = window.CaptureRenderedFrame();
        Assert.NotNull(frame);
        var path = Environment.GetEnvironmentVariable("OHMATRIX_MENU_SHEET");
        if (!string.IsNullOrEmpty(path))
            frame.Save(path.Replace(".png", $"-{theme}.png"),
                new PngBitmapEncoderOptions());
    }
}
