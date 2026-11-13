using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The capsule button of the cards (the Join and Copy of Explore): a 14 px corner, 16 by 6 inside, a bold 14 label. The filled one is the accent
/// of the theme, the other sits in the tint of the hover; grey when it cannot be pressed.
/// </summary>
public sealed class CapsuleButton : PressableButton {
    private readonly TextBlock label = new() {
        FontSize = 14,
        FontWeight = Fonts.Bold,
        VerticalAlignment = VerticalAlignment.Center,
    };

    public CapsuleButton(bool filled)
    {
        Filled = filled;
        Padding = new Thickness(16, 6);
        CornerRadius = new CornerRadius(14);
        Child = label;
    }

    /// <summary>The accent one (the confirmation); the other is in the tint.</summary>
    public bool Filled { get; }

    /// <summary>Red: the confirmation of a warning.</summary>
    public bool Danger {
        get;
        set {
            field = value;
            Refresh();
        }
    }

    public string Title {
        get => label.Text ?? "";
        set => label.Text = value;
    }

    /// <summary>Dimmed while it works; it cannot be pressed then.</summary>
    public bool Loading {
        get;
        set {
            field = value;
            IsHitTestVisible = !value && !Disabled;
            Refresh();
        }
    }

    protected override void Refresh()
    {
        var c = Colors;
        var grey = Disabled && !Loading;
        if (grey) {
            Background = new SolidColorBrush(c.Separator);
            label.Foreground = new SolidColorBrush(c.TextSecondary);
        } else if (Filled) {
            Background = new SolidColorBrush(Danger ? c.Danger : c.Accent);
            label.Foreground = new SolidColorBrush(c.OnAccent);
        } else {
            Background = new SolidColorBrush(c.Hover);
            label.Foreground = new SolidColorBrush(c.Text);
        }

        Opacity = Loading ? 0.5 : Pressed ? 0.8 : 1;
    }
}
