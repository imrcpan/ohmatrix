using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Media;

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
        Detach();
    }

    private OverlayLayer? layer;

    private readonly SolidColorBrush backdrop =
        new(Color.FromArgb(250, 0, 0, 0));

    private readonly Grid shade = new() {
        Focusable = true,
        ClipToBounds = true,
    };

    // The picture is on a stage that fills the window, and the stage is what
    // comes from the thumbnail; the buttons and the title are on a layer of
    // their own, which comes after the picture.
    private readonly Grid stage = new();
    private readonly Grid chrome = new();

    private readonly Image picture = new() {
        Stretch = Stretch.Uniform,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly ScaleTransform scale = new(1, 1);
    private readonly TranslateTransform move = new();

    private readonly TextBlock title = new() {
        FontSize = 16,
        FontWeight = Fonts.Normal,
        Foreground = Brushes.White,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly IconButton saveButton;
    private Func<Task>? onSave;
    private double zoom = 1;
    private Point? dragFrom;
    private Point dragStartOffset;

    // The window dims, and the picture comes from the thumbnail it was
    // pressed on, as the picture of a chat is opened in Telegram; it goes
    // back to it. The picture is zoomed and moved by the person, inside the
    // stage.
    private readonly Presence presence;
    private readonly Presence controls;

    // The picture of the chat that is opened, while its place is taken by
    // the one that flies: it is shown again when that has landed on it.
    private Visual? lifted;

    public ImageViewer()
    {
        shade.Background = backdrop;
        presence = Presences.Cover(stage);
        presence.Backdrop = backdrop;
        controls = Presences.Controls(chrome);
        picture.RenderTransform = new TransformGroup {
            Children = [scale, move]
        };
        picture.RenderTransformOrigin = RelativePoint.Center;
        stage.Children.Add(picture);
        shade.Children.Add(stage);
        shade.Children.Add(chrome);
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
        chrome.Children.Add(saveButton);
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

        chrome.Children.Add(tools);
        title.Margin = new Thickness(20, 12, 110, 0);
        title.VerticalAlignment = VerticalAlignment.Top;
        title.Height = 36;
        chrome.Children.Add(title);
        chrome.Children.Add(close);

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

    /// <summary>It is shown and not on its way out: a viewer that is fading away has been closed.</summary>
    public bool IsOpen => shade.Parent != null && !presence.Leaving;

    /// <summary>The zoom now: 1 is the picture fitted to the window.</summary>
    public double Zoom => zoom;

    public Image Picture => picture;

    /// <summary>Opens the picture; <paramref name="source"/> is fetched large, and the small one already on screen shows until it has come.</summary>
    /// <summary>The button that saves the picture is shown when <paramref name="save"/> is given.</summary>
    public IconButton SaveButton => saveButton;

    public void Show(TopLevel window, Pictures pictures, string source,
        string name,
        IImage? preview, Func<Task>? save = null, Visual? from = null)
    {
        Detach();
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
        stage.Width = shade.Width;
        stage.Height = shade.Height;
        Aim(window, from, preview);
        shade.IsHitTestVisible = true;
        layer.Children.Add(shade);
        presence.Enter();
        controls.Enter();
        // What is pressed is taken out of the chat as the picture comes out
        // of it.
        if (from != null && presence.Solid) {
            lifted = from;
            from.Opacity = 0;
        }

        shade.Focus();
        var size = (int)Math.Min(2048,
            Math.Max(window.ClientSize.Width, window.ClientSize.Height));
        pictures.Attach(picture, source, size, size);
    }

    /// <summary>Closes it: it fades away, and what is under it can be pressed at once.</summary>
    public void Close()
    {
        dragFrom = null;
        if (shade.Parent == null || presence.Leaving)
            return;
        shade.IsHitTestVisible = false;
        // It goes back to where the picture is now, which is not where it
        // was if the chat has moved.
        if (lifted is Visual { } thumbnail && TopLevel.GetTopLevel(thumbnail) is
                { } window)
            Aim(window, thumbnail, picture.Source);
        else
            Aim(null, null, null);
        controls.Leave(() => {
        });
        presence.Leave(Remove);
    }

    // Takes it away without a motion: for a picture that is shown again at
    // once and for a page that is thrown away.
    private void Detach()
    {
        dragFrom = null;
        presence.Cancel();
        controls.Cancel();
        Remove();
    }

    private void Remove()
    {
        if (lifted != null) {
            lifted.Opacity = 1;
            lifted = null;
        }

        layer?.Children.Remove(shade);
    }

    private const double DefaultScale = 0.94;

    // Where the picture comes from, and goes back to: the place of the
    // thumbnail it was opened from, as a scale and a shift of the stage
    // (the picture is in the middle of the window, as big as it can be).
    // With no thumbnail it comes from a little less than its size.
    private void Aim(TopLevel? window, Visual? from, IImage? preview)
    {
        presence.FromScale = DefaultScale;
        presence.FromX = 0;
        presence.FromY = 0;
        presence.Solid = false;
        if (window == null || from == null)
            return;
        var origin = from.TranslatePoint(new Point(0, 0), window);
        if (origin == null)
            return;
        var at = origin.Value;
        var size = from.Bounds.Size;
        var whole = window.ClientSize;
        if (size.Width < 1 || size.Height < 1 || whole.Width < 1 ||
            whole.Height < 1)
            return;
        // The picture is as wide as the window, or as high.
        var shape = preview is { Size: { Width: > 0, Height: > 0 } }
            ? preview.Size.Width / preview.Size.Height
            : size.Width / size.Height;
        var fitted = shape >= whole.Width / whole.Height
            ? new Size(whole.Width, whole.Width / shape)
            : new Size(whole.Height * shape, whole.Height);
        presence.FromScale = Math.Max(size.Width / fitted.Width,
            size.Height / fitted.Height);
        presence.FromX = at.X + size.Width / 2 - whole.Width / 2;
        presence.FromY = at.Y + size.Height / 2 - whole.Height / 2;
        presence.Solid = true;
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
