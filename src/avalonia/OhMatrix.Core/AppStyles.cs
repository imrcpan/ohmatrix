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

    // The thumb of the web and React Native apps (index.html): 8 wide, no
    // track and no arrows, a grey that shows on both themes and darkens on
    // hover and drag. Nothing scrolls sideways unless a control says so.
    private static void ThinScrollBars(Application app)
    {
        app.Resources["ScrollBarSize"] = 8.0;
        app.Resources["ScrollBarThumbBackgroundColor"] =
            Color.FromArgb(0x66, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarPanningThumbBackgroundColor"] =
            Color.FromArgb(0x66, 0x80, 0x80, 0x80);
        app.Resources["ScrollBarThumbFill"] =
            new SolidColorBrush(Color.FromArgb(0x66, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPointerOver"] =
            new SolidColorBrush(Color.FromArgb(0xA6, 0x80, 0x80, 0x80));
        app.Resources["ScrollBarThumbFillPressed"] =
            new SolidColorBrush(Color.FromArgb(0xCC, 0x80, 0x80, 0x80));
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
    }
}
