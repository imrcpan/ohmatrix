using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The notice bar with an action that stands above a list (<c>Banner</c>): the text on the secondary surface, and the action as a pill in the
/// accent colour at its right.
/// </summary>
public sealed class Banner : Border {
    private readonly TextBlock text = new() {
        FontSize = 14,
        LineHeight = 18,
        TextWrapping = TextWrapping.Wrap,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly ActionPill action = new();

    // Registered once for the type: a handler made in the constructor
    // stays in the property's observers for good and runs once for each
    // control that was ever made.
    static Banner()
    {
        ThemeScope.ColorsProperty.Changed
            .AddClassHandler<Banner>((b, _) => b.Paint());
    }

    public Banner()
    {
        Margin = new Thickness(12, 0, 12, 4);
        Padding = new Thickness(14, 10, 10, 10);
        CornerRadius = new CornerRadius(12);
        var line = new Grid {
            ColumnDefinitions = new ColumnDefinitions("*,Auto")
        };
        action.Margin = new Thickness(10, 0, 0, 0);
        Grid.SetColumn(action, 1);
        line.Children.Add(text);
        line.Children.Add(action);
        Child = line;
        action.Click += (_, _) => Pressed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>The action was pressed.</summary>
    public event EventHandler? Pressed;

    /// <summary>The words of the notice and of its action.</summary>
    public void Set(string message, string label)
    {
        text.Text = message;
        action.Label = label;
        Paint();
    }

    protected override void OnAttachedToVisualTree(
        VisualTreeAttachmentEventArgs e)
    {
        base.OnAttachedToVisualTree(e);
        Paint();
    }

    private void Paint()
    {
        var c = ThemeScope.GetColors(this);
        Background = new SolidColorBrush(c.BgSecondary);
        text.Foreground = new SolidColorBrush(c.Text);
        text.FontFamily = Fonts.System;
        action.Paint();
    }

    /// <summary>The pill: the accent colour, a little dimmed while it is pressed.</summary>
    private sealed class ActionPill : PressableButton {
        private readonly TextBlock label = new() {
            FontSize = 14,
            FontWeight = FontWeight.SemiBold,
            VerticalAlignment = VerticalAlignment.Center,
        };

        public ActionPill()
        {
            CornerRadius = new CornerRadius(14);
            // As high as in the React Native app (31), whatever the line
            // of the font: there it is 19, with 6 above and below.
            Height = 31;
            Padding = new Thickness(14, 0);
            VerticalAlignment = VerticalAlignment.Center;
            Child = label;
        }

        public string Label {
            get => label.Text ?? "";
            set => label.Text = value;
        }

        public void Paint()
        {
            Refresh();
        }

        protected override void Refresh()
        {
            var c = Colors;
            Background = new SolidColorBrush(c.Accent);
            label.Foreground = new SolidColorBrush(c.OnAccent);
            label.FontFamily = Fonts.System;
            Opacity = Pressed ? 0.8 : 1;
        }
    }
}
