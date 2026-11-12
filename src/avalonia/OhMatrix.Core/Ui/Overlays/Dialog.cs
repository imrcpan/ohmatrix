using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;

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
        Close();
    }

    private OverlayLayer? layer;

    private readonly Grid shade = new() {
        Focusable = true
    };

    private readonly Border card = new() {
        CornerRadius = new CornerRadius(16),
        Padding = new Thickness(20),
        MaxWidth = MaxWidth,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly TextBlock messageText = new() {
        FontSize = 15,
        LineHeight = 20,
        TextAlignment = TextAlignment.Center,
        TextWrapping = TextWrapping.Wrap,
    };

    private readonly StackPanel stack = new() {
        Spacing = 14
    };

    public Dialog()
    {
        card.Child = stack;
        shade.Children.Add(card);
        shade.PointerPressed += (_, e) => {
            if (Modal)
                return;
            if (e.Source is Visual v && !card.IsVisualAncestorOf(v) &&
                !ReferenceEquals(v, card)) {
                Close();
                OnClose?.Invoke();
            }
        };
        shade.KeyDown += (_, e) => {
            if (e.Key != Key.Escape)
                return;
            Close();
            OnClose?.Invoke();
        };
    }

    /// <summary>A press on the dim area does not close it.</summary>
    public bool Modal { get; set; }

    /// <summary>Called when it is closed by Esc or by a press outside; not when <see cref="Close"/> is called by the code.</summary>
    public Action? OnClose { get; set; }

    public bool IsOpen => shade.Parent != null;

    public Control Card => card;

    /// <summary>Opens the dialog in <paramref name="window"/>, with <paramref name="content"/> under the title and the message.</summary>
    public void Show(
        TopLevel window,
        ColorTokens colors,
        string title,
        string? message = null,
        params Control[] content
    )
    {
        Close();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        shade.Background = new SolidColorBrush(colors.Overlay);
        shade.Margin = new Thickness(0);
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        card.Background = new SolidColorBrush(colors.Bg);
        card.Margin = new Thickness(Pad);
        // width: 100% with a maximum, as the card of the React Native dialog
        card.Width = Math.Min(MaxWidth, window.ClientSize.Width - 2 * Pad);
        stack.Children.Clear();
        if (title.Length > 0)
            stack.Children.Add(new TextBlock {
                Text = title,
                FontSize = 19,
                FontWeight = Fonts.Bold,
                Foreground = new SolidColorBrush(colors.Text),
                TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap,
            });
        messageText.Foreground = new SolidColorBrush(colors.TextSecondary);
        messageText.Text = message;
        if (!string.IsNullOrEmpty(message))
            stack.Children.Add(messageText);

        foreach (var c in content)
            stack.Children.Add(c);
        layer.Children.Add(shade);
        shade.Focus();
    }

    /// <summary>Changes the message of the open dialog (a countdown) without building it again.</summary>
    public void SetMessage(string message)
    {
        messageText.Text = message;
    }

    public void Close()
    {
        layer?.Children.Remove(shade);
    }
}
