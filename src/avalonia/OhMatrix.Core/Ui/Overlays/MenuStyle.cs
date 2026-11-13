using Avalonia.Media;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>
/// The look of every menu, as the context menu of a message sets it (<c>MessageMenu</c>): the surface and the ink of a bubble from the other
/// person, a shadow that falls under it, four round corners, rows of 36 and a tint under the pointer. A menu whose corner is at the pointer
/// keeps that corner tight, as a bubble has its tail; that is the only difference between the menus.
/// </summary>
public static class MenuStyle {
    /// <summary>The width of a menu that is not given one.</summary>
    public const double Width = 240;

    /// <summary>The height of a row.</summary>
    public const double Row = 36;

    /// <summary>The radius of the corners of a menu.</summary>
    public const double Corner = 18;

    /// <summary>The surface of the menu and of the reactions in its bar.</summary>
    public static Color Surface(ColorTokens colors) => colors.BubbleIn;

    /// <summary>The ink of a row: the danger colour for a row that deletes, and the text of a bubble otherwise.</summary>
    public static Color Ink(ColorTokens colors, bool danger) =>
        danger ? colors.Danger : colors.BubbleInText;

    /// <summary>The tint under the pointer: a little light on a dark theme, a little dark on a light one.</summary>
    public static Color Hover(ColorTokens colors) =>
        IsDark(colors)
            ? Color.FromArgb(26, 255, 255, 255)
            : Color.FromArgb(15, 0, 0, 0);

    /// <summary>The shadow of the menu: a deeper one on a dark theme, which is lit less.</summary>
    public static BoxShadows Shadow(ColorTokens colors)
    {
        return IsDark(colors)
            ? new BoxShadows(new BoxShadow {
                OffsetY = 6,
                Blur = 22,
                Color = Color.FromArgb(140, 0, 0, 0)
            })
            : new BoxShadows(new BoxShadow {
                OffsetY = 4,
                Blur = 18,
                Color = Color.FromArgb(60, 0, 0, 0)
            });
    }

    private static bool IsDark(ColorTokens colors) => colors.Bg.R < 128;
}
