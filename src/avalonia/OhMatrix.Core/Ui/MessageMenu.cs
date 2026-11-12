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

namespace OhMatrix.Core.Ui;

/// <summary>
/// The context menu of a message (<c>MessageMenu</c>): a pill of quick reactions and a list of actions that pop up at the pointer, in the colours of
/// the other person's bubble, without borders. A transparent layer only catches the click-away. It opens right and down, left and up when it would
/// not fit; the corner at the pointer stays tight, like a bubble's tail.
/// </summary>
public sealed class MessageMenu : IOverlay {
    private const double MenuWidth = 240;
    private const double EmojiSize = 36;
    private const double Row = 36;
    private const double Gap = 4;
    private const double Margin = 8;

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

    private readonly Canvas shade = new() {
        Background = Brushes.Transparent
    };

    private readonly StackPanel column = new() {
        Spacing = Gap
    };

    private readonly List<Control> rows = [];
    private readonly List<Control> emojiButtons = [];

    public MessageMenu()
    {
        shade.Children.Add(column);
        shade.PointerPressed += (_, e) => {
            if (e.Source is Visual v && !column.IsVisualAncestorOf(v))
                Close();
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
        };
    }

    public bool IsOpen => shade.Parent != null;

    /// <summary>The action rows as laid out now.</summary>
    public IReadOnlyList<Control> Rows => rows;

    /// <summary>The reaction buttons as laid out now.</summary>
    public IReadOnlyList<Control> Emojis => emojiButtons;

    /// <summary>Opens at <paramref name="at"/> (a point of <paramref name="window"/>).</summary>
    public void Show(TopLevel window, ColorTokens colors, Point at,
        IReadOnlyList<string> emojis,
        IReadOnlyCollection<string> active, Action<string> onEmoji,
        IReadOnlyList<MenuItem> actions)
    {
        Close();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        var dark = colors.Bg.R < 128;
        var hover = dark
            ? Color.FromArgb(26, 255, 255, 255)
            : Color.FromArgb(15, 0, 0, 0);
        var shadow = dark
            ? new BoxShadows(new BoxShadow {
                OffsetY = 6,
                Blur = 22,
                Color = Color.FromArgb(140, 0, 0, 0)
            })
            : new BoxShadows(new BoxShadow {
                OffsetY = 4,
                Blur = 18,
                Color = Color.FromArgb(60, 0, 0, 0)
            });
        var surface = new SolidColorBrush(colors.BubbleIn);
        var ink = new SolidColorBrush(colors.BubbleInText);
        column.Children.Clear();
        rows.Clear();
        emojiButtons.Clear();

        var barWidth = emojis.Count * EmojiSize + 8;
        var width = Math.Max(MenuWidth, barWidth);
        var height = (emojis.Count > 0 ? EmojiSize + 8 + Gap : 0) +
                     actions.Count * Row + 8;
        var size = window.ClientSize;
        // Opens at the pointer, towards the free side: right/down by default, left/up when it would not fit.
        var toLeft = at.X + width > size.Width - Margin;
        var above = at.Y + height > size.Height - Margin &&
                    at.Y - height >= Margin;
        var left = Math.Max(Margin, toLeft ? at.X - width : at.X);
        var top = Math.Max(Margin,
            Math.Min(above ? at.Y - height : at.Y,
                size.Height - height - Margin));
        column.Width = width;
        column.HorizontalAlignment = HorizontalAlignment.Left;

        // The corner at the pointer stays tight.
        CornerRadius Tight(CornerRadius round) => above
            ? toLeft
                ? new CornerRadius(round.TopLeft, round.TopRight, 5,
                    round.BottomLeft)
                : new CornerRadius(round.TopLeft, round.TopRight,
                    round.BottomRight, 5)
            : toLeft
                ? new CornerRadius(round.TopLeft, 5, round.BottomRight,
                    round.BottomLeft)
                : new CornerRadius(5, round.TopRight, round.BottomRight,
                    round.BottomLeft);

        if (emojis.Count > 0) {
            var bar = new StackPanel {
                Orientation = Orientation.Horizontal
            };
            foreach (var emoji in emojis) {
                var button = new Border {
                    Width = EmojiSize,
                    Height = EmojiSize,
                    CornerRadius = new CornerRadius(EmojiSize / 2),
                    Background = active.Contains(emoji)
                        ? new SolidColorBrush(hover)
                        : Brushes.Transparent,
                    Cursor = new Cursor(StandardCursorType.Hand),
                    Child = new TextBlock {
                        Text = emoji,
                        FontSize = 22,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        VerticalAlignment = VerticalAlignment.Center,
                    },
                };
                var e = emoji;
                button.PointerEntered += (_, _) =>
                    button.Background = new SolidColorBrush(hover);
                button.PointerExited += (_, _) => button.Background =
                    active.Contains(e)
                        ? new SolidColorBrush(hover)
                        : Brushes.Transparent;
                button.PointerReleased += (_, ev) => {
                    ev.Handled = true;
                    Close();
                    onEmoji(e);
                };
                Avalonia.Automation.AutomationProperties.SetName(button,
                    $"React {emoji}");
                emojiButtons.Add(button);
                bar.Children.Add(button);
            }

            var pill = new Border {
                Padding = new Thickness(4),
                CornerRadius = actions.Count == 0
                    ? Tight(new CornerRadius(EmojiSize / 2 + 4))
                    : new CornerRadius(EmojiSize / 2 + 4),
                Background = surface,
                BoxShadow = shadow,
                HorizontalAlignment = toLeft
                    ? HorizontalAlignment.Right
                    : HorizontalAlignment.Left,
                Child = bar,
            };
            column.Children.Add(pill);
        }

        if (actions.Count > 0) {
            var list = new StackPanel {
                Margin = new Thickness(0, 2)
            };
            foreach (var item in actions) {
                var color = item.Danger ? colors.Danger : colors.BubbleInText;
                var line = new StackPanel {
                    Orientation = Orientation.Horizontal,
                    Spacing = 12,
                    VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(14, 0),
                };
                if (item.Icon != null)
                    line.Children.Add(new Icon {
                        Glyph = item.Icon,
                        Size = 18,
                        Color = new SolidColorBrush(color),
                        VerticalAlignment = VerticalAlignment.Center,
                    });
                line.Children.Add(new TextBlock {
                    Text = item.Label,
                    FontSize = 15,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(color),
                    VerticalAlignment = VerticalAlignment.Center,
                });
                var row = new Border {
                    Height = Row,
                    Background = Brushes.Transparent,
                    Cursor = new Cursor(StandardCursorType.Hand),
                    Child = line,
                };
                row.PointerEntered += (_, _) =>
                    row.Background = new SolidColorBrush(hover);
                row.PointerExited += (_, _) =>
                    row.Background = Brushes.Transparent;
                var press = item.OnPress;
                row.PointerReleased += (_, ev) => {
                    ev.Handled = true;
                    Close();
                    press();
                };
                Avalonia.Automation.AutomationProperties.SetName(row,
                    item.Label);
                rows.Add(row);
                list.Children.Add(row);
            }

            column.Children.Add(new Border {
                Width = MenuWidth,
                CornerRadius = Tight(new CornerRadius(18)),
                ClipToBounds = true,
                Background = surface,
                BoxShadow = shadow,
                HorizontalAlignment =
                    toLeft
                        ? HorizontalAlignment.Right
                        : HorizontalAlignment.Left,
                Child = list,
            });
        }

        Canvas.SetLeft(column, left);
        Canvas.SetTop(column, top);
        shade.Width = size.Width;
        shade.Height = size.Height;
        layer.Children.Add(shade);
        shade.Focus();
    }

    public void Close()
    {
        layer?.Children.Remove(shade);
    }
}
