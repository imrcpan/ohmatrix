using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
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
        Model.FileAttachment? file = null,
        Action<Image>? openImage = null,
        string? formatted = null,
        Action<string>? openLink = null,
        bool read = false,
        string? readLabel = null
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
            Background = Brushes.Transparent,
            TextWrapping = TextWrapping.Wrap,
        };
        var runs = formatted is null
            ? RichText.PlainRuns(text)
            : RichText.ParseFormatted(formatted);
        var linkColor = new SolidColorBrush(mine ? colors.BubbleOutText : colors.Accent);
        var mentionBack = new SolidColorBrush(colors.MentionBg);
        var spans = new List<(int Start, int End, TextRun Run)>();
        var revealed = false;

        void Fill()
        {
            body.Inlines!.Clear();
            spans.Clear();
            var at = 0;
            foreach (var run in runs) {
                if (run.Br) {
                    body.Inlines.Add(new LineBreak());
                    at += 1;
                    continue;
                }

                var shown = (run.Prefix ?? "")
                            + (run.Spoiler && !revealed ? Hidden(run.Text) : run.Text);
                if (shown.Length == 0)
                    continue;
                var piece = new Run(shown);
                if (run.Bold || run.UserId is not null)
                    piece.FontWeight = run.UserId is not null && !run.Bold
                        ? FontWeight.SemiBold
                        : FontWeight.Bold;
                if (run.Italic)
                    piece.FontStyle = FontStyle.Italic;
                if (run.Code)
                    piece.FontFamily = new FontFamily("Cascadia Mono, DejaVu Sans Mono, monospace");
                var lines = new TextDecorationCollection();
                if (run.Underline || (run.Href is not null && run.UserId is null))
                    lines.Add(new TextDecoration {
                        Location = TextDecorationLocation.Underline
                    });
                if (run.Strike)
                    lines.Add(new TextDecoration {
                        Location = TextDecorationLocation.Strikethrough
                    });
                if (lines.Count > 0)
                    piece.TextDecorations = lines;
                if (run.UserId is not null) {
                    piece.Foreground = linkColor;
                    piece.Background = mentionBack;
                } else if (run.Href is not null)
                    piece.Foreground = linkColor;

                body.Inlines.Add(piece);
                spans.Add((at, at + shown.Length, run));
                at += shown.Length;
            }

            body.Inlines.Add(new InlineUIContainer(new Border {
                Width = timeRoom,
                Height = 1
            }));
        }

        Fill();
        var hasSpoiler = runs.Any(r => r.Spoiler);
        body.AddHandler(Avalonia.Input.InputElement.PointerReleasedEvent, (_, e) => {
            if (e.InitialPressMouseButton != Avalonia.Input.MouseButton.Left)
                return;
            if (body.SelectionStart != body.SelectionEnd)
                return;
            var index = body.TextLayout.HitTestPoint(e.GetPosition(body)).TextPosition;
            foreach (var (start, end, run) in spans) {
                if (index < start || index >= end)
                    continue;
                if (run.Spoiler && !revealed) {
                    revealed = true;
                    Fill();
                } else if (run.Href is { } href)
                    (openLink ?? (h => OpenInBrowser(body, h)))(href);

                break;
            }
        }, handledEventsToo: true);
        if (hasSpoiler)
            body.Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);

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
            if (openImage is not null) {
                picture.Cursor = new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);
                picture.PointerPressed += (_, e) => {
                    if (e.GetCurrentPoint(picture).Properties.IsLeftButtonPressed) {
                        e.Handled = true;
                        openImage(picture);
                    }
                };
            }

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
            var seen = read && !failed && !sending;
            var mark = new Icon {
                Glyph = failed ? "alert" : sending ? "clock" : seen ? "checks" : "check",
                Size = seen ? 20 : 18,
                StrokeWidth = 2,
                Color = new SolidColorBrush(seen
                    ? (mine ? colors.BubbleOutText : colors.Accent)
                    : meta),
                VerticalAlignment = VerticalAlignment.Center,
            };
            if (seen && readLabel is not null)
                Avalonia.Automation.AutomationProperties.SetName(mark, readLabel);
            metaRow.Children.Add(mark);
        }

        var root = new Grid();
        root.Children.Add(stack);
        root.Children.Add(metaRow);
        Child = root;
    }

    private static string Hidden(string text)
    {
        return new string(text.Select(c => c == '\n' ? c : '•').ToArray());
    }

    private static void OpenInBrowser(Visual from, string href)
    {
        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https"))
            return;
        if (TopLevel.GetTopLevel(from)?.Launcher is { } launcher)
            _ = launcher.LaunchUriAsync(uri);
    }
}
