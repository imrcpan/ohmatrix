using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

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
    private const double Row = 36;
    private const double DefaultWidth = 220;
    private const double Margin = 8;

    // Set when the page that owns it is thrown away: an answer that comes
    // late must not open it again over the page that is shown now.
    private bool retired;

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        retired = true;
        Close();
    }

    private OverlayLayer? layer;

    private readonly Canvas shade = new() {
        Background = Brushes.Transparent
    };

    // The outer border draws the shadow, which falls outside it; the inner one clips the rows to the rounded corners. Clipping the one that has the
    // shadow would cut the shadow off.
    private readonly Border surface = new() {
        CornerRadius = new CornerRadius(12)
    };

    private readonly Border clip = new() {
        CornerRadius = new CornerRadius(12),
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

    public Menu()
    {
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

    public double Width { get; set; } = DefaultWidth;

    public bool IsOpen => shade.Parent != null;

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
        var colors = ThemeScope.GetColors(anchor);
        Build(anchor, items, colors);
        surface.Width = Width;
        clip.Background = new SolidColorBrush(colors.Bg);
        surface.BoxShadow = Shadow(colors);

        var origin = anchor.TranslatePoint(new Point(0, 0), window) ??
                     new Point();
        var content = Measure(items.Count);
        var place = MenuPlacement.Place(
            origin.Y,
            anchor.Bounds.Height,
            content,
            Up,
            Margin,
            window.ClientSize.Height - Margin
        );
        var rawLeft = AlignRight
            ? origin.X + anchor.Bounds.Width - Width
            : origin.X;
        var left = Math.Max(Margin,
            Math.Min(rawLeft, window.ClientSize.Width - Width - Margin));
        scroller.MaxHeight = place.Height;
        scroller.VerticalScrollBarVisibility = place.Scrolls
            ? Avalonia.Controls.Primitives.ScrollBarVisibility.Auto
            : Avalonia.Controls.Primitives.ScrollBarVisibility.Disabled;

        Close();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        Canvas.SetLeft(surface, left);
        Canvas.SetTop(surface, place.Top);
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        layer.Children.Add(shade);
        shade.Focus();
    }

    public void Close()
    {
        layer?.Children.Remove(shade);
    }

    private double Measure(int count)
    {
        rows.Measure(new Size(Width, double.PositiveInfinity));
        return Math.Max(rows.DesiredSize.Height + 4, count * Row + 4);
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
        var ink = item.Danger ? colors.Danger : colors.Text;
        if (item.Icon != null) {
            var icon = new Icon {
                Glyph = item.Icon,
                Size = 18,
                Color = new SolidColorBrush(item.Danger
                    ? colors.Danger
                    : colors.TextSecondary),
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 12, 0),
            };
            grid.Children.Add(icon);
        }

        var label = new TextBlock {
            Text = item.Label,
            FontSize = 15,
            LineHeight = 20,
            FontFamily = Fonts.System,
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
            MinHeight = Row,
            Padding = new Thickness(14, 7),
            CornerRadius = new CornerRadius(10),
            Background = Brushes.Transparent,
            Cursor = new Cursor(StandardCursorType.Hand),
            Child = grid,
        };
        Avalonia.Automation.AutomationProperties.SetName(row, item.Label);
        row.PointerEntered += (_, _) =>
            row.Background = new SolidColorBrush(colors.Hover);
        row.PointerExited += (_, _) => row.Background = Brushes.Transparent;
        row.PointerPressed += (_, _) =>
            row.Background = new SolidColorBrush(colors.Separator);
        row.PointerReleased += (_, e) => {
            if (!new Rect(row.Bounds.Size).Contains(e.GetPosition(row)))
                return;
            // The menu goes first, then what the row does, as in the React Native menu.
            Close();
            item.OnPress();
        };
        return row;
    }

    // "0 4px 18px rgba(0,0,0,0.16), 0 0 1px rgba(0,0,0,0.12)" in light, "0 6px 22px rgba(0,0,0,0.55)" in dark (popoverShadow of theme.tsx).
    private static BoxShadows Shadow(ColorTokens colors)
    {
        var dark = colors.Bg.R < 128;
        return dark
            ? new BoxShadows(new BoxShadow {
                OffsetY = 6,
                Blur = 22,
                Color = Color.FromArgb(140, 0, 0, 0)
            })
            : new BoxShadows(
                new BoxShadow {
                    OffsetY = 4,
                    Blur = 18,
                    Color = Color.FromArgb(41, 0, 0, 0)
                },
                [
                    new BoxShadow {
                        Blur = 1,
                        Color = Color.FromArgb(31, 0, 0, 0)
                    }
                ]
            );
    }
}
