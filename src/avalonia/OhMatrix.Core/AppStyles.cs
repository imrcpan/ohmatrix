using Avalonia;
using Avalonia.Controls;
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

    // The scrollbar of the web and React Native apps (index.html): 8 wide, in
    // the layout and not over the content, no track and no arrows, a thumb
    // of a grey that shows on both themes and darkens on hover and drag.
    // Nothing scrolls sideways unless a control says so.
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
        var bar = new Style(x => x.OfType<ScrollBar>());
        bar.Setters.Add(new Setter(ScrollBar.AllowAutoHideProperty, false));
        app.Styles.Add(bar);
        var viewer = new Style(x => x.OfType<ScrollViewer>());
        viewer.Setters.Add(new Setter(ScrollViewer.AllowAutoHideProperty,
            false));
        viewer.Setters.Add(new Setter(
            ScrollViewer.HorizontalScrollBarVisibilityProperty,
            ScrollBarVisibility.Disabled));
        app.Styles.Add(viewer);
    }
}
