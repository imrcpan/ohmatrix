using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Styling;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// A turning ring: three quarters of a circle that goes round. <see cref="Size"/> is the width of the control; with no
/// <see cref="Color"/> it is drawn in the accent of the theme (the big one of a screen that is waiting), with one it is that colour (in a button).
/// </summary>
public sealed class Spinner : Control {
    public static readonly StyledProperty<double> SizeProperty =
        AvaloniaProperty.Register<Spinner, double>(nameof(Size), 56);

    public static readonly StyledProperty<IBrush?> ColorProperty =
        AvaloniaProperty.Register<Spinner, IBrush?>(nameof(Color));

    public static readonly StyledProperty<double> AngleProperty =
        AvaloniaProperty.Register<Spinner, double>(nameof(Angle));

    private CancellationTokenSource? turning;

    // The ring is drawn about sixty times a second and only its angle
    // changes, so what does not change with the angle is made once: the path
    // while the size stays, the pen while its brush and thickness stay, and
    // the brush of the theme's accent while the accent stays.
    private Geometry? ring;
    private double ringSize;
    private Pen? pen;
    private IBrush? penBrush;
    private double penThickness;
    private SolidColorBrush? accent;

    static Spinner()
    {
        AffectsRender<Spinner>(SizeProperty, ColorProperty, AngleProperty);
        AffectsMeasure<Spinner>(SizeProperty);
    }

    public double Size {
        get => GetValue(SizeProperty);
        set => SetValue(SizeProperty, value);
    }

    public IBrush? Color {
        get => GetValue(ColorProperty);
        set => SetValue(ColorProperty, value);
    }

    public double Angle {
        get => GetValue(AngleProperty);
        set => SetValue(AngleProperty, value);
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        return new Size(Size, Size);
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        turning = new CancellationTokenSource();
        var animation = new Animation {
            Duration = TimeSpan.FromSeconds(1),
            IterationCount = IterationCount.Infinite,
            Easing = new LinearEasing(),
            Children = {
                new KeyFrame {
                    Cue = new Cue(0),
                    Setters = {
                        new Setter(AngleProperty, 0.0)
                    }
                },
                new KeyFrame {
                    Cue = new Cue(1),
                    Setters = {
                        new Setter(AngleProperty, 360.0)
                    }
                },
            },
        };
        _ = animation.RunAsync(this, turning.Token);
    }

    protected override void OnDetachedFromVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        turning?.Cancel();
        turning?.Dispose();
        turning = null;
    }

    public override void Render(DrawingContext context)
    {
        var brush = Color ?? AccentBrush();
        var thickness = Math.Max(2, Size / 12);
        var centre = new Point(Size / 2, Size / 2);
        if (ring == null || ringSize != Size) {
            ring = Ring(Size, thickness);
            ringSize = Size;
        }

        if (pen == null || !ReferenceEquals(penBrush, brush) ||
            penThickness != thickness) {
            pen = new Pen(brush, thickness, lineCap: PenLineCap.Round);
            penBrush = brush;
            penThickness = thickness;
        }

        using (context.PushTransform(
                   Matrix.CreateTranslation(-centre.X, -centre.Y) *
                   Matrix.CreateRotation(Angle * Math.PI / 180) *
                   Matrix.CreateTranslation(centre.X, centre.Y))) {
            context.DrawGeometry(null, pen, ring);
        }
    }

    private IBrush AccentBrush()
    {
        var colour = ThemeScope.GetColors(this).Accent;
        if (accent == null || accent.Color != colour)
            accent = new SolidColorBrush(colour);
        return accent;
    }

    // From the top, three quarters round, as the "spinner" icon is.
    private static PathGeometry Ring(double size, double thickness)
    {
        var radius = (size - thickness) / 2;
        var centre = new Point(size / 2, size / 2);
        var figure = new PathFigure {
            StartPoint = new Point(centre.X, centre.Y - radius),
            IsClosed = false
        };
        figure.Segments!.Add(new ArcSegment {
            Point = new Point(centre.X - radius, centre.Y),
            Size = new Size(radius, radius),
            SweepDirection = SweepDirection.Clockwise,
            IsLargeArc = true,
        });
        var geometry = new PathGeometry();
        geometry.Figures!.Add(figure);
        return geometry;
    }
}
