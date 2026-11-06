using Avalonia;
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
    }
}
