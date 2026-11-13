using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>A row of a <see cref="Menu"/>.</summary>
public sealed record MenuItem(
    string Label,
    Action OnPress,
    string? Icon = null,
    bool Danger = false,
    bool Checked = false
);

/// <summary>
/// A popover menu anchored to a control (<c>Menu</c> of the React Native app): it opens below the anchor, or above it with <see cref="Up"/>, flips to
/// the other side when its own has not room, is clamped inside the window and scrolls when neither side has room for all of it. Rows are 36 high
/// (more when a long name goes on a second line), the checked one has a check mark, and the one under the pointer is tinted.
/// </summary>
public sealed class Menu : IOverlay {
    private const double Margin = 8;

    // Set when the page that owns it is thrown away: an answer that comes
    // late must not open it again over the page that is shown now.
    private bool retired;

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        retired = true;
        Detach();
    }

    private OverlayLayer? layer;

    private readonly Canvas shade = new() {
        Background = Brushes.Transparent
    };

    // The outer border draws the shadow, which falls outside it; the inner one clips the rows to the rounded corners. Clipping the one that has the
    // shadow would cut the shadow off.
    private readonly Border surface = new() {
        CornerRadius = new CornerRadius(MenuStyle.Corner)
    };

    private readonly Border clip = new() {
        CornerRadius = new CornerRadius(MenuStyle.Corner),
        ClipToBounds = true
    };

    private readonly ScrollViewer scroller = new() {
        VerticalScrollBarVisibility =
            Avalonia.Controls.Primitives.ScrollBarVisibility.Auto,
        HorizontalScrollBarVisibility = Avalonia.Controls.Primitives
            .ScrollBarVisibility.Disabled,
    };

    private readonly StackPanel rows = new() {
        Margin = new Thickness(2)
    };

    // The menu pops as the reference page's button 1 does: it grows from the
    // corner it opens from, and its rows come down one after the other.
    private readonly MenuPop pop;

    public Menu()
    {
        pop = new MenuPop(surface);
        scroller.Content = rows;
        clip.Child = scroller;
        surface.Child = clip;
        shade.Children.Add(surface);
        // A press outside the menu shuts it, as light dismiss of a popup does; a press on the menu is its own.
        shade.PointerPressed += (_, e) => {
            if (e.Source is Visual v && !surface.IsVisualAncestorOf(v) &&
                !ReferenceEquals(v, surface))
                Close();
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
        };
    }

    /// <summary>Opens below the anchor, or above it.</summary>
    public bool Up { get; set; }

    /// <summary>The right edge of the menu is the right edge of the anchor, not the left.</summary>
    public bool AlignRight { get; set; }

    public double Width { get; set; } = MenuStyle.Width;

    /// <summary>It is shown and not on its way out: a menu that is fading away has been closed.</summary>
    public bool IsOpen => shade.Parent != null && !pop.Closing;

    /// <summary>The menu itself.</summary>
    public Control Surface => surface;

    /// <summary>The rows as they are laid out now.</summary>
    public IReadOnlyList<Control> Rows => rows.Children;

    /// <summary>The top of the menu in the window, where it was last opened.</summary>
    public double Top => Canvas.GetTop(surface);

    /// <summary>The scrolling part of the menu.</summary>
    public ScrollViewer Scroller => scroller;

    /// <summary>Opens the menu on <paramref name="anchor"/>, in <paramref name="window"/>.</summary>
    public void Show(Control anchor, TopLevel window,
        IReadOnlyList<MenuItem> items)
    {
        var origin = anchor.TranslatePoint(new Point(0, 0), window) ??
                     new Point();
        OpenAt(anchor, window, origin, anchor.Bounds.Width,
            anchor.Bounds.Height, AlignRight, items);
    }

    /// <summary>
    /// Opens the menu at a point of <paramref name="window"/>, the pointer of a right click: below the point, or above it when there is no
    /// room, from its left edge. <paramref name="scope"/> is the control whose colours it takes.
    /// </summary>
    public void Show(Control scope, TopLevel window, Point at,
        IReadOnlyList<MenuItem> items)
    {
        OpenAt(scope, window, at, 0, 0, false, items);
    }

    private void OpenAt(Control scope, TopLevel window, Point origin,
        double anchorWidth, double anchorHeight, bool right,
        IReadOnlyList<MenuItem> items)
    {
        var colors = ThemeScope.GetColors(scope);
        Build(scope, items, colors);
        surface.Width = Width;
        clip.Background = new SolidColorBrush(MenuStyle.Surface(colors));
        surface.BoxShadow = MenuStyle.Shadow(colors);

        var content = Measure(items.Count);
        var place = MenuPlacement.Place(
            origin.Y,
            anchorHeight,
            content,
            Up,
            Margin,
            window.ClientSize.Height - Margin
        );
        var rawLeft = right
            ? origin.X + anchorWidth - Width
            : origin.X;
        var left = Math.Max(Margin,
            Math.Min(rawLeft, window.ClientSize.Width - Width - Margin));
        scroller.MaxHeight = place.Height;
        scroller.VerticalScrollBarVisibility = place.Scrolls
            ? Avalonia.Controls.Primitives.ScrollBarVisibility.Auto
            : Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;

        // A menu that is shown again takes its place in the layer again, and
        // keeps the motion it is in.
        Remove();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null) {
            pop.Stop();
            return;
        }

        Canvas.SetLeft(surface, left);
        Canvas.SetTop(surface, place.Top);
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        shade.IsHitTestVisible = true;
        layer.Children.Add(shade);
        // It grows from the corner at the anchor or the pointer: the left or
        // the right one, the top one when it opens below and the bottom one
        // when above.
        pop.Open(rows.Children, new RelativePoint(right ? 1 : 0,
            place.Top < origin.Y ? 1 : 0, RelativeUnit.Relative));
        shade.Focus();
    }

    /// <summary>Closes it: it shrinks back and fades, and what is under it can be pressed at once.</summary>
    public void Close()
    {
        if (shade.Parent == null || pop.Closing)
            return;
        shade.IsHitTestVisible = false;
        pop.Close(Remove);
    }

    // Takes it away without a motion: for a page that is thrown away.
    private void Detach()
    {
        pop.Stop();
        Remove();
    }

    private void Remove()
    {
        layer?.Children.Remove(shade);
    }

    private double Measure(int count)
    {
        rows.Measure(new Size(Width, double.PositiveInfinity));
        return Math.Max(rows.DesiredSize.Height + 4, count * MenuStyle.Row + 4);
    }

    private void Build(Control anchor, IReadOnlyList<MenuItem> items,
        ColorTokens colors)
    {
        rows.Children.Clear();
        foreach (var item in items)
            rows.Children.Add(MakeRow(item, colors));
    }

    private Control MakeRow(MenuItem item, ColorTokens colors)
    {
        var grid = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        var ink = MenuStyle.Ink(colors, item.Danger);
        if (item.Icon != null) {
            var icon = new Icon {
                Glyph = item.Icon,
                Size = 18,
                Color = new SolidColorBrush(ink),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0),
            };
            grid.Children.Add(icon);
        }

        var label = new TextBlock {
            Text = item.Label,
            FontSize = 15,
            LineHeight = 20,
            Foreground = new SolidColorBrush(ink),
            TextWrapping = TextWrapping.Wrap,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Grid.SetColumn(label, 1);
        grid.Children.Add(label);
        if (item.Checked) {
            var check = new Icon {
                Glyph = "check",
                Size = 18,
                Color = new SolidColorBrush(colors.Accent),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 0, 0),
            };
            Grid.SetColumn(check, 2);
            grid.Children.Add(check);
        }

        var row = new Border {
            MinHeight = MenuStyle.Row,
            Padding = new Thickness(14, 7),
            CornerRadius = new CornerRadius(MenuStyle.Corner),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        Avalonia.Automation.AutomationProperties.SetName(row, item.Label);
        row.PointerEntered += (_, _) =>
            row.Background = new SolidColorBrush(MenuStyle.Hover(colors));
        row.PointerExited += (_, _) => row.Background = Brushes.Transparent;
        row.PointerReleased += (_, e) => {
            if (!new Rect(row.Bounds.Size).Contains(e.GetPosition(row)))
                return;
            // The menu goes first, then what the row does, as in the React Native menu.
            Close();
            item.OnPress();
        };
        return row;
    }
}
