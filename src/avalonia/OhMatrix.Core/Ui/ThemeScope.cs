using Avalonia;
using Avalonia.Controls;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// Where a control gets the colours from: <see cref="Colors"/>, an inherited property, so that setting it on the window gives every control below
/// the tokens of the theme (as <c>useTheme()</c> does for the React Native components). A control that draws with it redraws when it changes.
/// </summary>
public static class ThemeScope {
    public static readonly AttachedProperty<ColorTokens> ColorsProperty =
        AvaloniaProperty.RegisterAttached<Control, ColorTokens>(
            "Colors", typeof(ThemeScope), Themes.Resolve("light", null).Colors,
            inherits: true
        );

    public static ColorTokens GetColors(Control control)
    {
        return control.GetValue(ColorsProperty);
    }

    public static void SetColors(Control control, ColorTokens value)
    {
        control.SetValue(ColorsProperty, value);
    }
}
