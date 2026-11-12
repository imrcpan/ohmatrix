using Avalonia;
using Avalonia.Controls;
using Avalonia.Animation;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Styling;
using Avalonia.Themes.Fluent;

namespace OhMatrix.Core;

using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Widgets;

public static class AppStyles {
    /// <summary>
    /// Gives the app the templates of the controls (a TextBox has none without them). The look is not the one of Fluent: the colours, sizes and
    /// corners come from <see cref="Theming.ColorTokens"/> and <see cref="Ui.Appearance.Radius"/>, set on each control. The theme variant stays light, since the
    /// colours do not come from it.
    /// </summary>
    public static void Apply(Application app)
    {
        app.Styles.Add(new FluentTheme());
        app.RequestedThemeVariant = ThemeVariant.Light;
        ThinScrollBars(app);
        FullPlaceholders();
        // Every text is drawn by letters, in the font of its script, and
        // the font the windows hand down is the interface's.
        ScriptTextFormatter.Install();
        Fonts.Defaults(app);
    }

    private static bool placeholders;

    // The template of Fluent draws the placeholder of a text box at half its
    // colour; the colour is already the one meant (the secondary text), as in
    // the React Native app, so it is drawn whole.
    private static void FullPlaceholders()
    {
        if (placeholders)
            return;
        placeholders = true;
        TemplatedControl.TemplateAppliedEvent
            .AddClassHandler<TextBox>((_, e) => {
                if (e.NameScope.Find("PART_Placeholder") is Visual part)
                    part.Opacity = 1;
            });
    }

    // The bar is 4 wide, with 4 of space on its left and 2 on its right as
    // its margin. The click area is the 10 of the three together (see
    // ScrollStrip).
    private const double ThumbWidth = 4;

    private static void ThinScrollBars(Application app)
    {
        // Fluent takes the thumb's width from this size.
        app.Resources["ScrollBarSize"] = ThumbWidth;
        app.Resources["VerticalSmallScrollThumbScaleTransform"] =
            new ScaleTransform(1, 1);
        app.Resources["HorizontalSmallScrollThumbScaleTransform"] =
            new ScaleTransform(1, 1);
        app.Resources["ScrollBarThumbBackgroundColor"] =
            Color.FromArgb(0xE6, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarPanningThumbBackgroundColor"] =
            Color.FromArgb(0xE6, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarThumbFill"] =
            new SolidColorBrush(Color.FromArgb(0xE6, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPointerOver"] =
            new SolidColorBrush(Color.FromArgb(0xE6, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPressed"] =
            new SolidColorBrush(Color.FromArgb(0xE6, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarTrackFill"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackFillPointerOver"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackStroke"] = Brushes.Transparent;
        app.Resources["ScrollBarTrackStrokePointerOver"] = Brushes.Transparent;
        var viewer = new Style(x => x.OfType<ScrollViewer>());
        viewer.Setters.Add(new Setter(ScrollViewer.AllowAutoHideProperty,
            false));
        viewer.Setters.Add(new Setter(
            ScrollViewer.HorizontalScrollBarVisibilityProperty,
            ScrollBarVisibility.Disabled));
        app.Styles.Add(viewer);
        // The bar: 4 wide, with the space beside it as its margin.
        var bars = new Style(x => x.OfType<ScrollBar>());
        bars.Setters.Add(new Setter(Layoutable.WidthProperty, ThumbWidth));
        bars.Setters.Add(new Setter(Layoutable.MinWidthProperty, ThumbWidth));
        // The bar floats over the content and takes no room of its own: its
        // column is 4 wide less a margin of -6, which is nothing, and the
        // bar is drawn 6 in from the edge, with 2 left beyond it.
        bars.Setters.Add(new Setter(Layoutable.MarginProperty,
            new Thickness(-6, 0, 0, 0)));
        app.Styles.Add(bars);
        // The thumb is hidden at rest; ScrollStrip shows it while the pointer
        // is over the viewer or a press from the strip is held.
        var thumb = new Style(x => x.OfType<ScrollBar>().Template()
            .OfType<Thumb>());
        thumb.Setters.Add(new Setter(Visual.OpacityProperty, 0.0));
        thumb.Setters.Add(new Setter(Visual.RenderTransformProperty, null));
        thumb.Setters.Add(new Setter(TemplatedControl.CornerRadiusProperty,
            new CornerRadius(ThumbWidth / 2)));
        thumb.Setters.Add(new Setter(Animatable.TransitionsProperty,
            new Transitions {
                new DoubleTransition {
                    Property = Visual.OpacityProperty,
                    Duration = TimeSpan.FromMilliseconds(150),
                }
            }));
        app.Styles.Add(thumb);
        var round = new Style(x => x.OfType<ScrollBar>().Template()
            .OfType<Thumb>().Template().OfType<Border>());
        round.Setters.Add(new Setter(Border.CornerRadiusProperty,
            new CornerRadius(ThumbWidth / 2)));
        round.Setters.Add(new Setter(Visual.RenderTransformProperty, null));
        app.Styles.Add(round);
        ScrollStrip.Install();
    }
}
