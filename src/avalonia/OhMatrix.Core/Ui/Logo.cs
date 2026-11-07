using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The app's logo, drawn from the shapes of its SVG (<c>logo/colorful/1.svg</c>): the rounded blue body with its rim, shade, glow and gloss, and the two
/// white shapes with a soft shadow. <see cref="Size"/> px square; the logo keeps its own proportions inside.
/// </summary>
public sealed class Logo : Viewbox {
    private static readonly Geometry Body = Geometry.Parse(LogoData.Background);
    private static readonly Geometry Roof = Geometry.Parse(LogoData.Roof);

    private static readonly Geometry Mountains =
        Geometry.Parse(LogoData.Mountains);

    public Logo(double size)
    {
        Width = size;
        Height = size;
        Stretch = Stretch.Uniform;
        var canvas = new Canvas {
            Width = LogoData.Width,
            Height = LogoData.Height,
            RenderTransform = new TranslateTransform(-LogoData.X, -LogoData.Y),
            RenderTransformOrigin = RelativePoint.TopLeft,
        };
        // Everything is placed where the SVG places it, so the canvas starts at the corner of the view box.
        canvas.Children.Add(Layer(Body, Linear(Color.Parse("#FFFFFF"), 0.55,
            Color.Parse("#FFFFFF"),
            0,
            Color.Parse("#003B6B"), 0.45)));
        var shrink = new MatrixTransform(
            Matrix.CreateTranslation(-627.5, -627.5)
            * Matrix.CreateScale(0.99, 0.99)
            * Matrix.CreateTranslation(627.5, 627.5));
        foreach (var brush in new IBrush[] {
                     new LinearGradientBrush {
                         StartPoint =
                             new RelativePoint(0, 0, RelativeUnit.Relative),
                         EndPoint =
                             new RelativePoint(0, 1, RelativeUnit.Relative),
                         GradientStops = [
                             new GradientStop(Color.Parse("#2E9BE6"), 0),
                             new GradientStop(Color.Parse("#007ACC"), 0.45),
                             new GradientStop(Color.Parse("#005A9E"), 1),
                         ],
                     },
                     new LinearGradientBrush {
                         StartPoint =
                             new RelativePoint(0, 0, RelativeUnit.Relative),
                         EndPoint =
                             new RelativePoint(0, 1, RelativeUnit.Relative),
                         GradientStops = [
                             new GradientStop(
                                 Color.FromArgb(0, 0x00, 0x2B, 0x52), 0.6),
                             new GradientStop(
                                 Color.FromArgb(71, 0x00, 0x2B, 0x52), 1),
                         ],
                     },
                     new RadialGradientBrush {
                         Center = new RelativePoint(0.35, 0.12,
                             RelativeUnit.Relative),
                         GradientOrigin = new RelativePoint(0.35, 0.12,
                             RelativeUnit.Relative),
                         RadiusX = RelativeScalar.Parse("85%"),
                         RadiusY = RelativeScalar.Parse("85%"),
                         GradientStops = [
                             new GradientStop(Color.FromArgb(97, 255, 255, 255),
                                 0),
                             new GradientStop(Color.FromArgb(15, 255, 255, 255),
                                 0.5),
                             new GradientStop(Color.FromArgb(0, 255, 255, 255),
                                 1),
                         ],
                     },
                     new LinearGradientBrush {
                         StartPoint =
                             new RelativePoint(0, 0, RelativeUnit.Relative),
                         EndPoint =
                             new RelativePoint(0, 1, RelativeUnit.Relative),
                         GradientStops = [
                             new GradientStop(Color.FromArgb(51, 255, 255, 255),
                                 0),
                             new GradientStop(Color.FromArgb(0, 255, 255, 255),
                                 0.4),
                         ],
                     },
                 }) {
            var path = Layer(Body, brush);
            path.RenderTransform = shrink;
            path.RenderTransformOrigin = RelativePoint.TopLeft;
            canvas.Children.Add(path);
        }

        var shapes = new Canvas {
            Width = LogoData.Width + LogoData.X,
            Height = LogoData.Height + LogoData.Y,
            Effect = new DropShadowEffect {
                OffsetX = 0,
                OffsetY = 9,
                BlurRadius = 16,
                Color = Color.Parse("#00284D"),
                Opacity = 0.4,
            },
        };
        shapes.Children.Add(Layer(Roof, Brushes.White));
        shapes.Children.Add(Layer(Mountains, Brushes.White));
        canvas.Children.Add(shapes);
        Child = canvas;
    }

    private static Avalonia.Controls.Shapes.Path Layer(Geometry shape,
        IBrush fill)
    {
        return new Avalonia.Controls.Shapes.Path {
            Data = shape,
            Fill = fill
        };
    }

    private static LinearGradientBrush Linear(Color a, double ao, Color b,
        double bo, Color c,
        double co)
    {
        return new LinearGradientBrush {
            StartPoint = new RelativePoint(0, 0, RelativeUnit.Relative),
            EndPoint = new RelativePoint(0, 1, RelativeUnit.Relative),
            GradientStops = [
                new GradientStop(
                    Color.FromArgb((byte)(ao * 255), a.R, a.G, a.B), 0),
                new GradientStop(
                    Color.FromArgb((byte)(bo * 255), b.R, b.G, b.B), 0.5),
                new GradientStop(
                    Color.FromArgb((byte)(co * 255), c.R, c.G, c.B), 1),
            ],
        };
    }
}
