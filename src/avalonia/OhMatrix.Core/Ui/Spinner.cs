using Avalonia;
using Avalonia.Animation;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Styling;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

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

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
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

    protected override void OnDetachedFromVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnDetachedFromVisualTree(e);
        turning?.Cancel();
        turning?.Dispose();
        turning = null;
    }

    public override void Render(DrawingContext context)
    {
        var brush = Color ?? new SolidColorBrush(ThemeScope.GetColors(this).Accent);
        var thickness = Math.Max(2, Size / 12);
        var radius = (Size - thickness) / 2;
        var centre = new Point(Size / 2, Size / 2);
        // From the top, three quarters round, as the "spinner" icon is.
        var start = new Point(centre.X, centre.Y - radius);
        var end = new Point(centre.X - radius, centre.Y);
        var figure = new PathFigure {
            StartPoint = start,
            IsClosed = false
        };
        figure.Segments!.Add(new ArcSegment {
            Point = end,
            Size = new Size(radius, radius),
            SweepDirection = SweepDirection.Clockwise,
            IsLargeArc = true,
        });
        var geometry = new PathGeometry();
        geometry.Figures!.Add(figure);
        var pen = new Pen(brush, thickness, lineCap: PenLineCap.Round);
        using (context.PushTransform(Matrix.CreateTranslation(-centre.X, -centre.Y) *
                                     Matrix.CreateRotation(Angle * Math.PI / 180) *
                                     Matrix.CreateTranslation(centre.X, centre.Y))) {
            context.DrawGeometry(null, pen, geometry);
        }
    }
}
