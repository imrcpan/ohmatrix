using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The full-size picture (<c>ImageViewer</c>): over a near-black backdrop, fitted to the window, zoomed with the wheel (about the pointer) or a
/// double press, moved by dragging when zoomed, and closed with Esc, a press outside the picture or the cross.
/// </summary>
public sealed class ImageViewer : IOverlay {
    public const double MaxZoom = 8;

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

    private readonly Grid shade = new() {
        Background = new SolidColorBrush(Color.FromArgb(250, 0, 0, 0)),
        Focusable = true,
        ClipToBounds = true,
    };

    private readonly Image picture = new() {
        Stretch = Stretch.Uniform,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly ScaleTransform scale = new(1, 1);
    private readonly TranslateTransform move = new();

    private readonly TextBlock title = new() {
        FontSize = 16,
        FontWeight = FontWeight.Medium,
        FontFamily = Fonts.System,
        Foreground = Brushes.White,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly IconButton saveButton;
    private Func<Task>? onSave;
    private double zoom = 1;
    private Point? dragFrom;
    private Point dragStartOffset;

    public ImageViewer()
    {
        picture.RenderTransform = new TransformGroup {
            Children = [scale, move]
        };
        picture.RenderTransformOrigin = RelativePoint.Center;
        shade.Children.Add(picture);
        var close = new IconButton("close", "Close", 26) {
            Tint = Colors.White,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 12, 12, 0),
        };
        close.Click += (_, _) => Close();
        ThemeScope.SetColors(close, Themes.Resolve("dark", null).Colors);
        saveButton = new IconButton("download", "Save", 26) {
            Tint = Colors.White,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 12, 56, 0),
            IsVisible = false,
        };
        saveButton.Click += (_, _) => {
            if (onSave != null)
                _ = onSave();
        };
        ThemeScope.SetColors(saveButton, Themes.Resolve("dark", null).Colors);
        shade.Children.Add(saveButton);
        var tools = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 4,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, 0, 16),
        };
        foreach (var (glyph, name, act) in new (string, string, Action)[] {
                     ("zoomOut", "Zoom out", () => ZoomBy(0.8, Center())),
                     ("zoomIn", "Zoom in", () => ZoomBy(1.25, Center())),
                     ("minimize", "Fit", Reset),
                 }) {
            var button = new IconButton(glyph, name, 24, 40) {
                Tint = Colors.White
            };
            ThemeScope.SetColors(button, Themes.Resolve("dark", null).Colors);
            var run = act;
            button.Click += (_, _) => run();
            tools.Children.Add(button);
        }

        shade.Children.Add(tools);
        title.Margin = new Thickness(20, 12, 110, 0);
        title.VerticalAlignment = VerticalAlignment.Top;
        title.Height = 36;
        shade.Children.Add(title);
        shade.Children.Add(close);

        shade.PointerWheelChanged += (_, e) => {
            ZoomBy(e.Delta.Y > 0 ? 1.15 : 1 / 1.15, e.GetPosition(shade));
            e.Handled = true;
        };
        shade.PointerPressed += (_, e) => {
            if (e.ClickCount == 2) {
                ToggleZoom(e.GetPosition(shade));
                return;
            }

            if (zoom > 1) {
                dragFrom = e.GetPosition(shade);
                dragStartOffset = new Point(move.X, move.Y);
                e.Pointer.Capture(shade);
            } else if (!OverPicture(e.GetPosition(shade)))
                Close();
        };
        shade.PointerMoved += (_, e) => {
            var from = dragFrom;
            if (from == null)
                return;
            var now = e.GetPosition(shade);
            move.X = dragStartOffset.X + now.X - from.Value.X;
            move.Y = dragStartOffset.Y + now.Y - from.Value.Y;
        };
        shade.PointerReleased += (_, e) => {
            dragFrom = null;
            e.Pointer.Capture(null);
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
            else if (e.Key is Key.Add or Key.OemPlus)
                ZoomBy(1.25, Center());
            else if (e.Key is Key.Subtract or Key.OemMinus)
                ZoomBy(0.8, Center());
        };
    }

    public bool IsOpen => shade.Parent != null;

    /// <summary>The zoom now: 1 is the picture fitted to the window.</summary>
    public double Zoom => zoom;

    public Image Picture => picture;

    /// <summary>Opens the picture; <paramref name="source"/> is fetched large, and the small one already on screen shows until it has come.</summary>
    /// <summary>The button that saves the picture is shown when <paramref name="save"/> is given.</summary>
    public IconButton SaveButton => saveButton;

    public void Show(TopLevel window, Pictures pictures, string source,
        string name,
        IImage? preview, Func<Task>? save = null)
    {
        Close();
        onSave = save;
        saveButton.IsVisible = save != null;
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        title.Text = name;
        picture.Source = preview;
        Reset();
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        layer.Children.Add(shade);
        shade.Focus();
        var size = (int)Math.Min(2048,
            Math.Max(window.ClientSize.Width, window.ClientSize.Height));
        pictures.Attach(picture, source, size, size);
    }

    public void Close()
    {
        layer?.Children.Remove(shade);
        dragFrom = null;
    }

    /// <summary>Zooms by <paramref name="factor"/> keeping the point under <paramref name="at"/> where it is.</summary>
    public void ZoomBy(double factor, Point at)
    {
        var next = Math.Clamp(zoom * factor, 1, MaxZoom);
        var k = next / zoom;
        // The picture is scaled about the middle of the window: a point at c + d (c the middle) goes to c + k d + t.
        var c = Center();
        move.X = (1 - k) * (at.X - c.X) + k * move.X;
        move.Y = (1 - k) * (at.Y - c.Y) + k * move.Y;
        zoom = next;
        scale.ScaleX = next;
        scale.ScaleY = next;
        if (next <= 1)
            Reset();
    }

    private void ToggleZoom(Point at)
    {
        if (zoom > 1)
            Reset();
        else
            ZoomBy(2.5, at);
    }

    private void Reset()
    {
        zoom = 1;
        scale.ScaleX = 1;
        scale.ScaleY = 1;
        move.X = 0;
        move.Y = 0;
    }

    private Point Center()
    {
        return new Point(shade.Bounds.Width / 2, shade.Bounds.Height / 2);
    }

    private bool OverPicture(Point p)
    {
        var b = picture.Bounds;
        return b.Contains(p);
    }
}
