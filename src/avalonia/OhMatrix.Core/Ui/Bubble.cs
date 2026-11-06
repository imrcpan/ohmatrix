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
        bool accent = true,
        Model.ReplyQuote? reply = null,
        Model.ImageAttachment? image = null,
        Pictures? pictures = null,
        Model.FileAttachment? file = null
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

        var hasText = text.Length > 0 || (image is null && file is null);
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

        if (reply is not null) {
            // The message this one answers: an accent bar, the name of its writer and the start of what was written.
            var quote = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*"),
                Margin = new Thickness(0, 0, 0, 4),
            };
            var bar = new Border {
                Width = 2,
                CornerRadius = new CornerRadius(1),
                Background = new SolidColorBrush(mine ? colors.BubbleOutText : colors.Accent),
                Margin = new Thickness(0, 0, 8, 0),
            };
            var lines = new StackPanel();
            if (reply.SenderName.Length > 0) {
                lines.Children.Add(new TextBlock {
                    Text = reply.SenderName,
                    FontSize = 14,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(mine ? colors.BubbleOutText : colors.Accent),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                });
            }

            lines.Children.Add(new TextBlock {
                Text = reply.Preview,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground =
                    new SolidColorBrush(mine ? colors.BubbleOutMeta : colors.TextSecondary),
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxLines = 2,
            });
            Grid.SetColumn(lines, 1);
            quote.Children.Add(bar);
            quote.Children.Add(lines);
            stack.Children.Add(quote);
        }

        if (image is not null) {
            var (w, h) = MediaSize.Fit(image.Width, image.Height);
            var picture = new Image {
                Width = w,
                Height = h,
                Stretch = Stretch.UniformToFill,
            };
            pictures?.Attach(picture, image.Source, w, h);
            stack.Children.Add(new Border {
                Width = w,
                Height = h,
                CornerRadius = new CornerRadius(Math.Max(0, r - 6)),
                ClipToBounds = true,
                Background =
                    new SolidColorBrush(ThemeColor.Mix(colors.BubbleIn, colors.Separator, 0.5)),
                Margin = new Thickness(-6, -3, -6, hasText ? 4 : 14),
                Child = picture,
            });
            Avalonia.Automation.AutomationProperties.SetName(picture, image.FileName);
        }

        if (file is not null) {
            // A file: its icon on the accent, the name and the size.
            var card = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*"),
                Margin = new Thickness(0, 2, 0, hasText ? 4 : 14),
                MinWidth = 200,
            };
            var disc = new Border {
                Width = 40,
                Height = 40,
                CornerRadius = new CornerRadius(20),
                Background = new SolidColorBrush(mine ? colors.BubbleOutText : colors.Accent),
                Margin = new Thickness(0, 0, 12, 0),
                Child = new Icon {
                    Glyph = "file",
                    Size = 22,
                    Color = new SolidColorBrush(mine ? colors.BubbleOut : colors.OnAccent),
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            var words = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center
            };
            words.Children.Add(new TextBlock {
                Text = file.Name,
                FontSize = 16,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = fg,
                TextTrimming = TextTrimming.CharacterEllipsis,
            });
            var size = Format.Bytes(file.Size);
            if (size.Length > 0) {
                words.Children.Add(new TextBlock {
                    Text = size,
                    FontSize = 14,
                    FontFamily = Fonts.System,
                    Foreground = new SolidColorBrush(meta),
                });
            }

            Grid.SetColumn(words, 1);
            card.Children.Add(disc);
            card.Children.Add(words);
            stack.Children.Add(card);
        }

        if (hasText)
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
