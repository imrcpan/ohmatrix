using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The base of the buttons: a pressable area that knows whether the pointer is over it or down on it, and redraws its colours from the theme.
/// A subclass says how it looks in <see cref="Refresh"/>.
/// </summary>
public abstract class PressableButton : Border {
    private bool hovered;
    private bool pressed;

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static PressableButton()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<PressableButton>((b,
            _) => b.Refresh());
    }

    protected PressableButton()
    {
        Cursor = new Cursor(StandardCursorType.Hand);
        Focusable = true;
    }

    public event EventHandler? Click;

    public bool Disabled {
        get;
        set {
            field = value;
            IsHitTestVisible = !value;
            Refresh();
        }
    }

    /// <summary>Does what a press and release on the button do.</summary>
    public void RaiseClick()
    {
        if (!Disabled && IsHitTestVisible)
            Click?.Invoke(this, EventArgs.Empty);
    }

    protected bool Hovered => hovered;
    protected bool Pressed => pressed;

    protected ColorTokens Colors => ThemeScope.GetColors(this);

    protected abstract void Refresh();

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Refresh();
    }

    protected override void OnPointerEntered(PointerEventArgs e)
    {
        hovered = true;
        Refresh();
    }

    protected override void OnPointerExited(PointerEventArgs e)
    {
        hovered = false;
        Refresh();
    }

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        if (!e.GetCurrentPoint(this).Properties.IsLeftButtonPressed)
            return;
        pressed = true;
        e.Pointer.Capture(this);
        Refresh();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        if (!pressed)
            return;
        pressed = false;
        e.Pointer.Capture(null);
        Refresh();
        if (new Rect(Bounds.Size).Contains(e.GetPosition(this)))
            Click?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.Key is Key.Enter or Key.Space) {
            Click?.Invoke(this, EventArgs.Empty);
            e.Handled = true;
        }
    }
}

/// <summary>The filled button of the screens (<c>PrimaryButton</c>): 50 high, grey when it cannot be pressed, dimmed with a ring while it works.</summary>
public sealed class PrimaryButton : PressableButton {
    /// <summary>In a dialog it is a capsule, as the buttons of the cards: bold 14 in a 14 corner.</summary>
    public bool Capsule {
        get;
        set {
            field = value;
            Shape();
            Refresh();
        }
    }

    /// <summary>Red: the confirmation of a warning.</summary>
    public bool Danger {
        get;
        set {
            field = value;
            Refresh();
        }
    }

    private void Shape()
    {
        Height = Capsule ? double.NaN : 50;
        CornerRadius = Capsule
            ? new CornerRadius(14)
            : new CornerRadius(Radius.Control + 2);
        Padding = Capsule ? new Thickness(16, 6) : new Thickness(0);
        label.FontSize = Capsule ? 14 : 17;
    }

    private readonly TextBlock label = new() {
        FontSize = 17,
        FontWeight = Fonts.Bold,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Spinner spinner = new() {
        Size = 22,
        IsVisible = false
    };

    public PrimaryButton()
    {
        Height = 50;
        CornerRadius = new CornerRadius(Radius.Control + 2);
        var content = new Grid();
        content.Children.Add(label);
        content.Children.Add(spinner);
        Child = content;
    }

    public string Title {
        get => label.Text ?? "";
        set => label.Text = value;
    }

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
        Background = new SolidColorBrush(grey ? c.Separator
            : Danger ? c.Danger : c.Accent);
        label.Foreground =
            new SolidColorBrush(grey ? c.TextSecondary : c.OnAccent);
        label.IsVisible = !Loading;
        spinner.IsVisible = Loading;
        spinner.Color = new SolidColorBrush(c.OnAccent);
        Opacity = Loading ? 0.5 : grey ? 1 : Pressed ? 0.8 : 1;
    }
}

/// <summary>The flat button with an accent label (<c>TextButton</c>): 40 high, a tint under the pointer.</summary>
public sealed class TextButton : PressableButton {
    /// <summary>In a dialog it is a capsule with a tint, as the Cancel of the cards.</summary>
    public bool Capsule {
        get;
        set {
            field = value;
            Shape();
            Refresh();
        }
    }

    private void Shape()
    {
        Height = Capsule ? double.NaN : 40;
        CornerRadius = Capsule
            ? new CornerRadius(14)
            : new CornerRadius(Radius.Control);
        Padding = Capsule ? new Thickness(16, 6) : new Thickness(0);
        label.FontSize = Capsule ? 14 : 16;
        label.FontWeight = Capsule ? Fonts.Bold : Fonts.Normal;
    }

    private readonly TextBlock label = new() {
        FontSize = 16,
        FontWeight = Fonts.Normal,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    public TextButton()
    {
        Height = 40;
        CornerRadius = new CornerRadius(Radius.Control);
        Child = label;
    }

    public string Title {
        get => label.Text ?? "";
        set => label.Text = value;
    }

    /// <summary>Drawn in the colour of danger instead of the accent.</summary>
    public bool Danger {
        get;
        set {
            field = value;
            Refresh();
        }
    }

    protected override void Refresh()
    {
        var c = Colors;
        label.Foreground = new SolidColorBrush(Danger ? c.Danger : c.Accent);
        Background = Pressed ? new SolidColorBrush(c.Separator)
            : Hovered ? new SolidColorBrush(c.Hover)
            : Capsule ? new SolidColorBrush(c.Hover)
            : Brushes.Transparent;
    }
}
