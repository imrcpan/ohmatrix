using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>An icon of <see cref="IconData"/>, drawn as the React Native <c>Icon</c> draws it: a path of a 24 grid, round caps and joins.</summary>
public sealed class Icon : Control {
    private const double Grid = 24;

    public static readonly StyledProperty<string> GlyphProperty =
        AvaloniaProperty.Register<Icon, string>(nameof(Glyph), "chat");

    public static readonly StyledProperty<double> SizeProperty =
        AvaloniaProperty.Register<Icon, double>(nameof(Size), 22);

    public static readonly StyledProperty<IBrush?> ColorProperty =
        AvaloniaProperty.Register<Icon, IBrush?>(nameof(Color));

    public static readonly StyledProperty<double?> StrokeWidthProperty =
        AvaloniaProperty.Register<Icon, double?>(nameof(StrokeWidth));

    static Icon()
    {
        AffectsRender<Icon>(GlyphProperty, SizeProperty, ColorProperty,
            StrokeWidthProperty);
        AffectsMeasure<Icon>(SizeProperty);
    }

    public string Glyph {
        get => GetValue(GlyphProperty);
        set => SetValue(GlyphProperty, value);
    }

    public double Size {
        get => GetValue(SizeProperty);
        set => SetValue(SizeProperty, value);
    }

    public IBrush? Color {
        get => GetValue(ColorProperty);
        set => SetValue(ColorProperty, value);
    }

    /// <summary>The line weight; null takes the one of the icon (2 unless <see cref="IconData.Weight"/> says otherwise).</summary>
    public double? StrokeWidth {
        get => GetValue(StrokeWidthProperty);
        set => SetValue(StrokeWidthProperty, value);
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        return new Size(Size, Size);
    }

    public override void Render(DrawingContext context)
    {
        if (Color is null || !IconData.Paths.TryGetValue(Glyph, out var data))
            return;
        var fluent = IconData.Fluent.Contains(Glyph);
        var solid = IconData.Solid.Contains(Glyph);
        var width = fluent ? IconData.FluentWeight.GetValueOrDefault(Glyph, 0.9)
            : solid ? 1.6
            : StrokeWidth ?? IconData.Weight.GetValueOrDefault(Glyph, 2);
        var pen = width > 0
            ? new Pen(Color, width, lineCap: PenLineCap.Round,
                lineJoin: PenLineJoin.Round)
            : null;
        var geometry = Geometry.Parse(data);
        var scale = Size / Grid;
        using (context.PushTransform(Matrix.CreateScale(scale, scale))) {
            context.DrawGeometry(fluent || solid ? Color : null, pen, geometry);
        }
    }
}
