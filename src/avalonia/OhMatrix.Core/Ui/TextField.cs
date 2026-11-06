using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The labelled text box of the forms (<c>TextField</c> with an icon): 44 high on the secondary surface, the icon at its left, the label as its
/// placeholder, and a ring in the accent colour while it has the focus. With <see cref="Reveal"/> it is a password box with a button at its right end
/// that shows what is typed and hides it again.
/// </summary>
public sealed class TextField : Border {
    private readonly TextBox box = new() {
        FontSize = 16,
        FontFamily = Fonts.System,
        BorderThickness = new Thickness(0),
        Padding = new Thickness(0),
        Background = Brushes.Transparent,
        VerticalContentAlignment = VerticalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
        MinHeight = 0,
    };

    private readonly Icon icon = new() {
        Size = 18
    };

    private readonly Icon eye = new() {
        Size = 20
    };

    private readonly Border reveal = new() {
        Width = 32,
        Height = 44,
        Margin = new Thickness(0, 0, -8, 0),
        Background = Brushes.Transparent,
        Cursor = new Cursor(StandardCursorType.Hand),
        IsVisible = false,
    };

    private bool shown;
    private string[]? revealLabels;

    public TextField()
    {
        Height = 44;
        CornerRadius = new CornerRadius(Radius.Control);
        BorderThickness = new Thickness(2);
        Padding = new Thickness(12, 0);
        reveal.Child = eye;
        eye.HorizontalAlignment = HorizontalAlignment.Center;
        eye.VerticalAlignment = VerticalAlignment.Center;
        reveal.PointerPressed += (_, e) => {
            shown = !shown;
            Apply();
            e.Handled = true;
        };
        // icon | text | reveal, 8 apart.
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto")
        };
        icon.Margin = new Thickness(0, 0, 8, 0);
        icon.VerticalAlignment = VerticalAlignment.Center;
        Grid.SetColumn(box, 1);
        Grid.SetColumn(reveal, 2);
        row.Children.Add(icon);
        row.Children.Add(box);
        row.Children.Add(reveal);
        Child = row;
        box.GotFocus += (_, _) => Apply();
        box.LostFocus += (_, _) => Apply();
        // The property, not the TextChanged event of the box: that one is raised later, and not at all for a text set by the code in a test.
        box.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty)
                TextChanged?.Invoke(this, EventArgs.Empty);
        };
        box.KeyDown += (_, e) => {
            if (e.Key == Key.Enter)
                Submit?.Invoke(this, EventArgs.Empty);
        };
        ThemeScope.ColorsProperty.Changed.AddClassHandler<TextField>((f, _) => f.Apply());
    }

    public event EventHandler? TextChanged;

    /// <summary>Enter was pressed in the box.</summary>
    public event EventHandler? Submit;

    /// <summary>The label: the placeholder of the box and what a screen reader says.</summary>
    public string Label {
        get => box.PlaceholderText ?? "";
        set {
            box.PlaceholderText = value;
            Avalonia.Automation.AutomationProperties.SetName(box, value);
        }
    }

    public string Glyph {
        get => icon.Glyph;
        set => icon.Glyph = value;
    }

    public string Text {
        get => box.Text ?? "";
        set => box.Text = value;
    }

    /// <summary>Makes it a password box with a button that shows the text; the two labels are for a screen reader (show, hide).</summary>
    public (string Show, string Hide)? Reveal {
        set {
            revealLabels = value is null ? null : [value.Value.Show, value.Value.Hide];
            reveal.IsVisible = value is not null;
            shown = false;
            Apply();
        }
    }

    /// <summary>Does what Enter does in the box.</summary>
    public void RaiseSubmit()
    {
        Submit?.Invoke(this, EventArgs.Empty);
    }

    public bool FocusBox()
    {
        return box.Focus();
    }

    protected override void OnAttachedToVisualTree(VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Apply();
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.BgSecondary);
        BorderBrush = box.IsFocused ? new SolidColorBrush(c.Accent) : Brushes.Transparent;
        box.Foreground = new SolidColorBrush(c.Text);
        box.CaretBrush = new SolidColorBrush(c.Text);
        box.SelectionBrush = new SolidColorBrush(c.Accent, 0.4);
        // The watermark is drawn with the foreground of the placeholder; the template reads it from the resources of the box.
        box.Resources["TextControlPlaceholderForeground"] = new SolidColorBrush(c.TextSecondary);
        box.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(c.TextSecondary);
        // The ring is the one of the field itself: the box inside draws none of its own when it has the focus.
        box.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        box.Resources["TextControlBackgroundPointerOver"] = Brushes.Transparent;
        box.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        box.Resources["TextControlBorderBrushPointerOver"] = Brushes.Transparent;
        icon.Color = new SolidColorBrush(c.TextSecondary);
        eye.Color = new SolidColorBrush(c.TextSecondary);
        eye.Glyph = shown ? "eye" : "eyeOff";
        box.PasswordChar = revealLabels is not null && !shown ? '●' : '\0';
        if (revealLabels is not null)
            Avalonia.Automation.AutomationProperties.SetName(reveal,
                shown ? revealLabels[1] : revealLabels[0]);
    }
}
