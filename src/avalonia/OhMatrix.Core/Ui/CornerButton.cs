using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The borderless button that opens a menu (language and zoom of the sign-in screen): 36 high, an optional icon, the name in the secondary colour and
/// a small arrow, with a tint under the pointer.
/// </summary>
public sealed class CornerButton : PressableButton {
    private readonly Icon lead = new() {
        Size = 18,
        IsVisible = false
    };

    private readonly TextBlock label = new() {
        FontSize = 15,
        FontFamily = Fonts.System,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Icon arrow = new() {
        Glyph = "chevronDown",
        Size = 16
    };

    public CornerButton()
    {
        Height = 36;
        Padding = new Thickness(10, 0);
        CornerRadius = new CornerRadius(10);
        var row = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 4
        };
        lead.VerticalAlignment = VerticalAlignment.Center;
        arrow.VerticalAlignment = VerticalAlignment.Center;
        row.Children.Add(lead);
        row.Children.Add(label);
        row.Children.Add(arrow);
        Child = row;
    }

    /// <summary>The icon before the name; null for none.</summary>
    public string? Glyph {
        get => lead.IsVisible ? lead.Glyph : null;
        set {
            lead.IsVisible = value != null;
            if (value != null)
                lead.Glyph = value;
            ((StackPanel)Child!).Spacing = value == null ? 4 : 6;
        }
    }

    public string Text {
        get => label.Text ?? "";
        set {
            label.Text = value;
            Avalonia.Automation.AutomationProperties.SetName(this, value);
        }
    }

    /// <summary>What a screen reader says instead of the text (the text is a value, such as 100%).</summary>
    public string Description {
        set => Avalonia.Automation.AutomationProperties.SetName(this, value);
    }

    protected override void Refresh()
    {
        var c = Colors;
        lead.Color = new SolidColorBrush(c.TextSecondary);
        label.Foreground = new SolidColorBrush(c.TextSecondary);
        arrow.Color = new SolidColorBrush(c.TextTertiary);
        Background = Pressed ? new SolidColorBrush(c.Separator)
            : Hovered ? new SolidColorBrush(c.Hover)
            : Brushes.Transparent;
    }
}
