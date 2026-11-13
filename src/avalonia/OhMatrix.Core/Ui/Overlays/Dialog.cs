using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.LogicalTree;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Overlays;

/// <summary>
/// A centred card over a dimmed backdrop (<c>Dialog</c> of the React Native app): 400 wide at most, 16 corners, 20 padding, a 19/700 title, an optional
/// 15/20 message and the content under them, 14 apart. Esc and a press on the dim area close it, unless it is <see cref="Modal"/>: then it needs an answer.
/// </summary>
public sealed class Dialog : IOverlay {
    private const double MaxWidth = 400;
    private const double Pad = 24;

    // Set when the page that owns it is thrown away: an answer that comes
    // late must not open it again over the page that is shown now.
    private bool retired;

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        retired = true;
        Detach();
    }

    private OverlayLayer? layer;

    private readonly Grid shade = new() {
        Focusable = true
    };

    private readonly Border card = new() {
        CornerRadius = new CornerRadius(16),
        Padding = new Thickness(16),
        MaxWidth = MaxWidth,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    // The message is set under the title at the left, in the full text colour
    // and the size of the body, lined up with the icon.
    private readonly TextBlock messageText = new() {
        FontSize = 16,
        LineHeight = 21,
        TextAlignment = TextAlignment.Left,
        TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(8, 0, 0, 0),
    };

    private readonly StackPanel stack = new() {
        Spacing = 14
    };

    // The card grows from the middle, as the dialogs of the reference page do,
    // and the window dims behind it.
    private readonly DialogMotion motion;

    public Dialog()
    {
        motion = new DialogMotion(card);
        card.Child = stack;
        shade.Children.Add(card);
        shade.PointerPressed += (_, e) => {
            if (Modal || motion.Closing)
                return;
            if (e.Source is Visual v && !card.IsVisualAncestorOf(v) &&
                !ReferenceEquals(v, card)) {
                Close();
                OnClose?.Invoke();
            }
        };
        shade.KeyDown += (_, e) => {
            if (e.Key != Key.Escape || motion.Closing)
                return;
            Close();
            OnClose?.Invoke();
        };
    }

    /// <summary>A press on the dim area does not close it.</summary>
    public bool Modal { get; set; }

    /// <summary>Called when it is closed by Esc or by a press outside; not when <see cref="Close"/> is called by the code.</summary>
    public Action? OnClose { get; set; }

    /// <summary>It is shown and not on its way out: a dialog that is fading away has been closed.</summary>
    public bool IsOpen => shade.Parent != null && !motion.Closing;

    public Control Card => card;

    /// <summary>The icon at the left of the title (a glyph of the icons); the info glyph when none is chosen.</summary>
    public string Glyph { get; set; } = "info";

    /// <summary>A warning: the title has the red warning mark, and the confirmation is red.</summary>
    public bool Warning { get; set; }


    /// <summary>Opens the dialog in <paramref name="window"/>, with <paramref name="content"/> under the title and the message.</summary>
    public void Show(
        TopLevel window,
        ColorTokens colors,
        string title,
        string? message = null,
        params Control[] content
    )
    {
        Detach();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        var dim = new SolidColorBrush(colors.Overlay);
        shade.Background = dim;
        motion.Backdrop = dim;
        shade.Margin = new Thickness(0);
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        // The card of a room in Explore: the secondary surface.
        // On the light theme the card is white, with no tint of the theme; on
        // the dark one it is the secondary surface.
        var light = colors.Bg.R + colors.Bg.G + colors.Bg.B > 3 * 128;
        card.Background = new SolidColorBrush(light
            ? Colors.White
            : colors.BgSecondary);
        card.Margin = new Thickness(Pad);
        // width: 100% with a maximum, as the card of the React Native dialog
        card.Width = Math.Min(MaxWidth, window.ClientSize.Width - 2 * Pad);
        // Every button of a dialog is a capsule; the confirmation of a warning is red.
        foreach (var control in content)
        foreach (var part in control.GetSelfAndLogicalDescendants()) {
            if (part is PrimaryButton primary) {
                primary.Capsule = true;
                if (Warning)
                    primary.Danger = true;
            } else if (part is TextButton text)
                text.Capsule = true;
        }

        stack.Children.Clear();
        // The icon of the dialog at the left of its title, in the text colour
        // (white on the dark theme), set in from the edge of the card.
        var header = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*"),
            ColumnSpacing = 12,
            Margin = new Thickness(8, 0, 0, 0),
        };
        header.Children.Add(new Icon {
            Glyph = Warning ? "warning" : Glyph,
            Size = 22,
            Color = new SolidColorBrush(Warning ? colors.Danger : colors.Text),
            VerticalAlignment = VerticalAlignment.Center,
        });
        var heading = new TextBlock {
            Text = title,
            FontSize = 19,
            FontWeight = Fonts.Bold,
            Foreground = new SolidColorBrush(colors.Text),
            TextAlignment = TextAlignment.Left,
            TextWrapping = TextWrapping.Wrap,
        };
        Grid.SetColumn(heading, 1);
        header.Children.Add(heading);
        stack.Children.Add(header);
        messageText.Foreground = new SolidColorBrush(colors.Text);
        messageText.Text = message;
        if (!string.IsNullOrEmpty(message))
            stack.Children.Add(messageText);

        foreach (var c in content)
            stack.Children.Add(c);
        shade.IsHitTestVisible = true;
        layer.Children.Add(shade);
        motion.Open();
        shade.Focus();
    }

    /// <summary>Changes the message of the open dialog (a countdown) without building it again.</summary>
    public void SetMessage(string message)
    {
        messageText.Text = message;
    }

    /// <summary>Closes it: it fades away, and what is under it can be pressed at once.</summary>
    public void Close()
    {
        if (shade.Parent == null || motion.Closing)
            return;
        shade.IsHitTestVisible = false;
        motion.Close(Remove);
    }

    // Takes it away without a motion: for what is shown again at once and
    // for a page that is thrown away.
    private void Detach()
    {
        motion.Stop();
        Remove();
    }

    private void Remove()
    {
        layer?.Children.Remove(shade);
    }
}
