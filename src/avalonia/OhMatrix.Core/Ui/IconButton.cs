using Avalonia.Layout;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>A round button with an icon (<c>IconButton</c>): 36 by default, a tint under the pointer, the accent colour unless another is given.</summary>
public sealed class IconButton : PressableButton {
    private readonly Icon icon = new() {
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    public IconButton(string glyph, string label, double size = 22,
        double box = 36)
    {
        icon.Glyph = glyph;
        icon.Size = size;
        Width = box;
        Height = box;
        CornerRadius = new Avalonia.CornerRadius(box / 2);
        Child = icon;
        Avalonia.Automation.AutomationProperties.SetName(this, label);
    }

    /// <summary>The icon shown; a play button that becomes a pause button changes it.</summary>
    public string Glyph {
        get => icon.Glyph;
        set => icon.Glyph = value;
    }

    /// <summary>The colour of the icon; null is the accent.</summary>
    public Color? Tint {
        get;
        set {
            field = value;
            Refresh();
        }
    }

    protected override void Refresh()
    {
        var c = Colors;
        icon.Color = new SolidColorBrush(Tint ?? c.Accent);
        Background = Pressed ? new SolidColorBrush(c.Separator)
            : Hovered ? new SolidColorBrush(c.Hover)
            : Brushes.Transparent;
    }
}
