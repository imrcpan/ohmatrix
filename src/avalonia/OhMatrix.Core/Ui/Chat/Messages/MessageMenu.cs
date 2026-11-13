using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Overlays;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Core.Ui.Chat.Messages;

/// <summary>
/// The context menu of a message (<c>MessageMenu</c>): a pill of quick reactions and a list of actions that pop up at the pointer, in the colours of
/// the other person's bubble, without borders. A transparent layer only catches the click-away. It opens right and down, left and up when it would
/// not fit; the corner at the pointer stays tight, like a bubble's tail.
/// </summary>
public sealed class MessageMenu : IOverlay {
    private const double EmojiSize = 36;
    private const double Gap = 4;
    private const double Margin = 8;

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

    private readonly Canvas shade = new() {
        Background = Brushes.Transparent
    };

    private readonly StackPanel column = new() {
        Spacing = Gap
    };

    private readonly List<Control> rows = [];
    private readonly List<Control> emojiButtons = [];

    // The bar of reactions and the list of actions each pop as the reference
    // page's menu does (MenuPop), from the corner at the pointer. The reactions
    // in the bar pop one after the other on their own springs.
    private readonly List<MenuPop> pops = [];
    private readonly List<Presence> popping = [];
    private bool closing;

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

    /// <summary>It is shown and not on its way out: a menu that is fading away has been closed.</summary>
    public bool IsOpen => shade.Parent != null && !closing;

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
        Detach();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        var hover = MenuStyle.Hover(colors);
        var shadow = MenuStyle.Shadow(colors);
        var surface = new SolidColorBrush(MenuStyle.Surface(colors));
        var ink = new SolidColorBrush(MenuStyle.Ink(colors, false));
        column.Children.Clear();
        rows.Clear();
        emojiButtons.Clear();
        var surfaces =
            new List<(Control Surface, IReadOnlyList<Control> Items)>();

        var barWidth = emojis.Count * EmojiSize + 8;
        var width = Math.Max(MenuStyle.Width, barWidth);
        var height = (emojis.Count > 0 ? EmojiSize + 8 + Gap : 0) +
                     actions.Count * MenuStyle.Row + 8;
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
            surfaces.Add((pill, []));
        }

        if (actions.Count > 0) {
            // The rows are inset as those of a menu are, so that the pill of the
            // one under the pointer does not touch the edge.
            var list = new StackPanel {
                Margin = new Thickness(2)
            };
            foreach (var item in actions) {
                var color = MenuStyle.Ink(colors, item.Danger);
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
                    Foreground = new SolidColorBrush(color),
                    VerticalAlignment = VerticalAlignment.Center,
                });
                var row = new Border {
                    Height = MenuStyle.Row,
                    CornerRadius = new CornerRadius(MenuStyle.Corner),
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

            // The outer border draws the shadow, which falls outside it; the
            // inner one clips the rows to the rounded corners. Clipping the
            // one that has the shadow would cut the shadow off.
            var corners = Tight(new CornerRadius(18));
            var listSurface = new Border {
                Width = MenuStyle.Width,
                CornerRadius = corners,
                Background = surface,
                BoxShadow = shadow,
                HorizontalAlignment =
                    toLeft
                        ? HorizontalAlignment.Right
                        : HorizontalAlignment.Left,
                Child = new Border {
                    CornerRadius = corners,
                    ClipToBounds = true,
                    Child = list,
                },
            };
            column.Children.Add(listSurface);
            surfaces.Add((listSurface, rows));
        }

        Canvas.SetLeft(column, left);
        Canvas.SetTop(column, top);
        shade.Width = size.Width;
        shade.Height = size.Height;
        shade.IsHitTestVisible = true;
        layer.Children.Add(shade);
        // Each surface grows from the corner at the pointer, the one that
        // stays tight.
        var corner = new RelativePoint(toLeft ? 1 : 0, above ? 1 : 0,
            RelativeUnit.Relative);
        foreach (var (control, items) in surfaces) {
            var pop = new MenuPop(control);
            pops.Add(pop);
            pop.Open(items, corner);
        }

        for (var i = 0; i < emojiButtons.Count; i++) {
            var pop = Presences.Pop(emojiButtons[i]);
            popping.Add(pop);
            pop.Enter(TimeSpan.FromMilliseconds(60 + 24 * Math.Min(i, 6)));
        }

        shade.Focus();
    }

    /// <summary>Closes it: the bar and the list shrink back and fade, and what is under it can be pressed at once.</summary>
    public void Close()
    {
        if (shade.Parent == null || closing)
            return;
        shade.IsHitTestVisible = false;
        if (pops.Count == 0) {
            Remove();
            return;
        }

        closing = true;
        var waiting = pops.Count;
        foreach (var pop in pops)
            pop.Close(() => {
                if (--waiting > 0)
                    return;
                closing = false;
                Remove();
            });
    }

    // Takes it away without a motion: for a menu that is shown again at once
    // and for a page that is thrown away.
    private void Detach()
    {
        foreach (var pop in pops)
            pop.Stop();
        pops.Clear();
        foreach (var pop in popping)
            pop.Cancel();
        popping.Clear();
        closing = false;
        Remove();
    }

    private void Remove()
    {
        layer?.Children.Remove(shade);
    }
}
