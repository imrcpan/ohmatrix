using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;

namespace OhMatrix.Core.Ui.Widgets;

/// <summary>
/// The notice bar with an action that stands above a list (<c>Banner</c>): the text on the secondary surface, and under it, at the right, the
/// action as a pill in the accent colour and a pill in the tint that dismisses the notice.
/// </summary>
public sealed class Banner : Border {
    private readonly TextBlock text = new() {
        FontSize = 14,
        LineHeight = 18,
        TextWrapping = TextWrapping.Wrap,
        // The text clips to its own box, and the foot of a letter such as g is
        // below a line of 18: the box gets 3 more, taken back with the margin.
        Padding = new Thickness(0, 0, 0, 3),
        Margin = new Thickness(0, 0, 0, -3),
    };

    private readonly ActionPill action = new();

    private readonly ActionPill dismiss = new() {
        Tinted = true
    };

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
        // The pills are on a line of their own, at the right.
        var pills = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 8,
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 10, 0, 0),
            Children = {
                action,
                dismiss
            },
        };
        Child = new StackPanel {
            Children = {
                text,
                pills
            }
        };
        action.Click += (_, _) => Pressed?.Invoke(this, EventArgs.Empty);
        dismiss.Click += (_, _) => Dismissed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>The notice was dismissed.</summary>
    public event EventHandler? Dismissed;

    /// <summary>The action was pressed.</summary>
    public event EventHandler? Pressed;

    /// <summary>The words of the notice and of its action.</summary>
    public void Set(string message, string label, string dismissLabel)
    {
        text.Text = message;
        action.Label = label;
        dismiss.Label = dismissLabel;
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
        action.Paint();
        dismiss.Paint();
    }

    /// <summary>The pill: the accent colour (or the tint, for the one that dismisses), a little dimmed while it is pressed.</summary>
    private sealed class ActionPill : PressableButton {
        private readonly TextBlock label = new() {
            FontSize = 14,
            FontWeight = Fonts.Bold,
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

        /// <summary>The tint of the hover with the text colour, not the accent.</summary>
        public bool Tinted { get; init; }

        public void Paint()
        {
            Refresh();
        }

        protected override void Refresh()
        {
            var c = Colors;
            Background = new SolidColorBrush(Tinted ? c.Hover : c.Accent);
            label.Foreground =
                new SolidColorBrush(Tinted ? c.Text : c.OnAccent);
            Opacity = Pressed ? 0.8 : 1;
        }
    }
}
