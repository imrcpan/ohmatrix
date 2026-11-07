using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>The switch (<c>Toggle</c>): a low, wide track that takes the accent colour when on, and a round white knob that slides across.</summary>
public sealed class Toggle : Border {
    private const double W = 50;
    private const double H = 28;
    private const double Pad = 2;

    private readonly Border knob = new() {
        Width = H - Pad * 2,
        Height = H - Pad * 2,
        CornerRadius = new CornerRadius((H - Pad * 2) / 2),
        Background = Brushes.White,
        VerticalAlignment = VerticalAlignment.Center,
        BoxShadow = new BoxShadows(new BoxShadow {
            OffsetY = 1,
            Blur = 3,
            Color = Color.FromArgb(56, 0, 0, 0)
        }),
    };

    private bool isOn;

    public Toggle()
    {
        Width = W;
        Height = H;
        CornerRadius = new CornerRadius(H / 2);
        Cursor = new Cursor(StandardCursorType.Hand);
        Child = knob;
        knob.HorizontalAlignment = HorizontalAlignment.Left;
        PointerPressed += (_, e) => {
            e.Handled = true;
            Changed?.Invoke(!isOn);
        };
        ThemeScope.ColorsProperty.Changed.AddClassHandler<Toggle>((t, _) =>
            t.Apply());
        Apply();
    }

    /// <summary>The person pressed it; the new value is passed, and it shows once <see cref="IsOn"/> is set.</summary>
    public event Action<bool>? Changed;

    public bool IsOn {
        get => isOn;
        set {
            isOn = value;
            Apply();
        }
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Apply();
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = isOn
            ? new SolidColorBrush(c.Accent)
            : new SolidColorBrush(Color.FromArgb(61, 120, 120, 128));
        knob.Margin = new Thickness(isOn ? W - H + Pad : Pad, 0, 0, 0);
    }
}
