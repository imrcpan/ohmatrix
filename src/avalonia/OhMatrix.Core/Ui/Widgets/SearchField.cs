using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>The rounded search field (<c>SearchField</c>): the secondary fill, no border, a magnifier and the placeholder; 36 high.</summary>
public sealed class SearchField : Border {
    private readonly Icon magnifier = new() {
        Glyph = "search",
        Size = 16,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly TextBox box = new() {
        FontSize = 16,
        BorderThickness = new Thickness(0),
        Padding = new Thickness(0),
        Background = Brushes.Transparent,
        VerticalContentAlignment = VerticalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
        MinHeight = 0,
    };

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static SearchField()
    {
        ThemeScope.ColorsProperty.Changed.AddClassHandler<SearchField>((f, _) =>
            f.Apply());
    }

    public SearchField()
    {
        Height = 36;
        CornerRadius = new CornerRadius(Radius.Control);
        Padding = new Thickness(10, 0);
        var row = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*")
        };
        magnifier.Margin = new Thickness(0, 0, 6, 0);
        Grid.SetColumn(box, 1);
        row.Children.Add(magnifier);
        row.Children.Add(box);
        Child = row;
        box.PropertyChanged += (_, e) => {
            if (e.Property == TextBox.TextProperty)
                TextChanged?.Invoke(this, EventArgs.Empty);
        };
    }

    public event EventHandler? TextChanged;

    public string Text {
        get => box.Text ?? "";
        set => box.Text = value;
    }

    public string Placeholder {
        get => box.PlaceholderText ?? "";
        set {
            box.PlaceholderText = value;
            Avalonia.Automation.AutomationProperties.SetName(box, value);
        }
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Apply();
    }

    /// <summary>On the card of a dialog the box takes the hover tint, so that it is not the colour of the card it is on.</summary>
    public bool OnCard {
        get;
        set {
            field = value;
            Apply();
        }
    }

    private void Apply()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(OnCard ? c.Hover : c.BgSecondary);
        magnifier.Color = new SolidColorBrush(c.TextSecondary);
        box.Foreground = new SolidColorBrush(c.Text);
        box.CaretBrush = new SolidColorBrush(c.Text);
        box.SelectionBrush = new SolidColorBrush(c.Accent, 0.4);
        box.Resources["TextControlPlaceholderForeground"] =
            new SolidColorBrush(c.TextSecondary);
        box.Resources["TextControlPlaceholderForegroundFocused"] =
            new SolidColorBrush(c.TextSecondary);
        box.Resources["TextControlBackgroundFocused"] = Brushes.Transparent;
        box.Resources["TextControlBackgroundPointerOver"] = Brushes.Transparent;
        box.Resources["TextControlBorderBrushFocused"] = Brushes.Transparent;
        box.Resources["TextControlBorderBrushPointerOver"] =
            Brushes.Transparent;
    }
}
