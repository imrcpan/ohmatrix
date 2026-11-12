using Avalonia;
using Avalonia.Controls;
using Avalonia.Animation;
using Avalonia.Controls.Primitives;
using Avalonia.Media;
using Avalonia.Styling;
using Avalonia.Themes.Fluent;

namespace OhMatrix.Core;

public static class AppStyles {
    /// <summary>
    /// Gives the app the templates of the controls (a TextBox has none without them). The look is not the one of Fluent: the colours, sizes and
    /// corners come from <see cref="Theming.ColorTokens"/> and <see cref="Ui.Radius"/>, set on each control. The theme variant stays light, since the
    /// colours do not come from it.
    /// </summary>
    public static void Apply(Application app)
    {
        app.Styles.Add(new FluentTheme());
        app.RequestedThemeVariant = ThemeVariant.Light;
        ThinScrollBars(app);
    }

    // The thumb of the web and React Native apps (index.html): thin, no
    // track and no arrows, a grey that shows on both themes and darkens on
    // hover and drag. Nothing scrolls sideways unless a control says so.
    private const double FullThumb = 6;
    private const double ThinThumb = 3;

    private static void ThinScrollBars(Application app)
    {
        app.Resources["ScrollBarSize"] = FullThumb;
        // Until the pointer is on the bar Fluent draws the thumb squeezed
        // (this scale); here it is 3 wide against the 6 of the full thumb.
        app.Resources["VerticalSmallScrollThumbScaleTransform"] =
            new ScaleTransform(ThinThumb / FullThumb, 1);
        app.Resources["HorizontalSmallScrollThumbScaleTransform"] =
            new ScaleTransform(1, ThinThumb / FullThumb);
        app.Resources["ScrollBarThumbBackgroundColor"] =
            Color.FromArgb(0x66, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarPanningThumbBackgroundColor"] =
            Color.FromArgb(0x66, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarThumbFill"] =
            new SolidColorBrush(Color.FromArgb(0x66, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPointerOver"] =
            new SolidColorBrush(Color.FromArgb(0x99, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPressed"] =
            new SolidColorBrush(Color.FromArgb(0xE6, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarTrackFill"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackFillPointerOver"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackStroke"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackStrokePointerOver"] = Brushes.Transparent;
        // Hidden at rest and over the content when it shows (it takes no
        // width of its own): it appears while the pointer is over what it
        // scrolls.
        var viewer = new Style(x => x.OfType<ScrollViewer>());
        viewer.Setters.Add(new Setter(ScrollViewer.AllowAutoHideProperty,
            true));
        viewer.Setters.Add(new Setter(
            ScrollViewer.HorizontalScrollBarVisibilityProperty,
            ScrollBarVisibility.Disabled));
        app.Styles.Add(viewer);
        var hidden = new Style(x => x.OfType<ScrollViewer>().Template()
            .OfType<ScrollBar>());
        hidden.Setters.Add(new Setter(Visual.OpacityProperty, 0.0));
        hidden.Setters.Add(new Setter(Animatable.TransitionsProperty,
            new Transitions {
                new DoubleTransition {
                    Property = Visual.OpacityProperty,
                    Duration = TimeSpan.FromMilliseconds(150),
                }
            }));
        app.Styles.Add(hidden);
        var shown = new Style(x => x.OfType<ScrollViewer>()
            .Class(":pointerover").Template().OfType<ScrollBar>());
        shown.Setters.Add(new Setter(Visual.OpacityProperty, 1.0));
        app.Styles.Add(shown);
        // The thumb is always the full width of the bar (Fluent draws it as
        // a hairline until the pointer is on the bar), with a half circle
        // at each end.
        var thumb = new Style(x => x.OfType<ScrollBar>().Template()
            .OfType<Thumb>());
        thumb.Setters.Add(new Setter(Visual.RenderTransformProperty, null));
        thumb.Setters.Add(new Setter(TemplatedControl.CornerRadiusProperty,
            new CornerRadius(3)));
        app.Styles.Add(thumb);
        var round = new Style(x => x.OfType<ScrollBar>().Template()
            .OfType<Thumb>().Template().OfType<Border>());
        round.Setters.Add(new Setter(Border.CornerRadiusProperty,
            new CornerRadius(3)));
        round.Setters.Add(new Setter(Visual.RenderTransformProperty, null));
        app.Styles.Add(round);
    }
}
