using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// A message bubble (<c>Bubble</c>): large corners that are tight where the bubble touches a neighbour of the same sender, mine in the accent
/// colour on the right, the others on the left; the time and the state of a sent message sit inside at the bottom right, on the last line of the text.
/// </summary>
public sealed class Bubble : Border {
    public Bubble(
        ColorTokens colors,
        string text,
        string time,
        bool own,
        string? senderName = null,
        string? senderId = null,
        bool stuckAbove = false,
        bool stuckBelow = false,
        bool sending = false,
        bool failed = false,
        string? editedLabel = null,
        bool accent = true
    )
    {
        const double r = Radius.Bubble;
        const double t = Radius.BubbleTight;
        CornerRadius = own
            ? new CornerRadius(r, stuckAbove ? t : r, stuckBelow ? t : r, r)
            : new CornerRadius(stuckAbove ? t : r, r, r, stuckBelow ? t : r);
        var mine = own && accent;
        Background = new SolidColorBrush(mine ? colors.BubbleOut : colors.BubbleIn);
        Padding = new Thickness(12, 7, 12, 6);
        var fg = new SolidColorBrush(mine ? colors.BubbleOutText : colors.BubbleInText);
        var meta = failed ? colors.Danger : mine ? colors.BubbleOutMeta : colors.TextSecondary;

        var metaText = (editedLabel is null ? "" : editedLabel + " ") + time;
        // The room the time and the state take on the last line of the text, so that the text wraps before it, as in the React Native bubble.
        var timeRoom = Math.Ceiling(metaText.Length * 7.4) + (own ? 24 : 0) + 8;

        var body = new SelectableTextBlock {
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = fg,
            TextWrapping = TextWrapping.Wrap,
        };
        body.Inlines!.Add(new Run(text));
        body.Inlines.Add(new InlineUIContainer(new Border {
            Width = timeRoom,
            Height = 1
        }));

        var stack = new StackPanel();
        if (senderName is not null && !own) {
            stack.Children.Add(new TextBlock {
                Text = senderName,
                FontSize = 14,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = new SolidColorBrush(Avatar.PeerColor(senderId ?? senderName)),
                Margin = new Thickness(0, 0, 0, 2),
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
        }

        stack.Children.Add(body);

        var metaRow = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, -2, -1),
        };
        metaRow.Children.Add(new TextBlock {
            Text = metaText,
            FontSize = 14,
            FontFamily = Fonts.System,
            Foreground = new SolidColorBrush(meta),
            VerticalAlignment = VerticalAlignment.Center,
        });
        if (own) {
            metaRow.Children.Add(new Icon {
                Glyph = failed ? "alert" : sending ? "clock" : "check",
                Size = 18,
                StrokeWidth = 2,
                Color = new SolidColorBrush(meta),
                VerticalAlignment = VerticalAlignment.Center,
            });
        }

        var root = new Grid();
        root.Children.Add(stack);
        root.Children.Add(metaRow);
        Child = root;
    }
}
