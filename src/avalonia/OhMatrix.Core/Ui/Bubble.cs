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
    /// <summary>The quote of the message this one answers, when it has one; pressing it goes to that message.</summary>
    public Control? Quote { get; private set; }

    private readonly SolidColorBrush fill = new();
    private readonly SolidColorBrush foreground = new();
    private readonly SolidColorBrush metadata = new();
    private readonly SolidColorBrush secondary = new();
    private readonly SolidColorBrush linkForeground = new();
    private readonly SolidColorBrush mentionBackground = new();
    private readonly SolidColorBrush fileInk = new();
    private readonly SolidColorBrush imageFill = new();
    private readonly SolidColorBrush previewFill = new();
    private readonly List<TextBlock> labels = new();
    private readonly SelectableTextBlock body;
    private readonly StackPanel stack;
    private readonly StackPanel metaRow;
    private readonly TextBlock metaLabel;
    private readonly IReadOnlyList<TextRun> cachedRuns;

    private readonly Border timeSpace = new() {
        Height = 1
    };

    private readonly InlineUIContainer timeInline;
    private TextBlock? sender;
    private Icon? mark;
    private readonly AudioCard? audio;

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
        string? readLabel = null,
        Action<Model.FileAttachment>? openFile = null,
        Func<string, Task<Model.LinkPreview?>>? preview = null,
        Func<Model.FileAttachment, Task<string?>>? fetch = null
    )
    {
        const double r = Radius.Bubble;
        var mine = own && accent;
        SetColors(colors, mine, failed);
        Background = fill;
        Padding = new Thickness(12, 7, 12, 6);
        var fg = foreground;
        var meta = metadata.Color;

        var hasText = text.Length > 0 || (image is null && file is null);
        body = new SelectableTextBlock {
            FontSize = 16,
            FontFamily = Fonts.System,
            Foreground = fg,
            Background = Brushes.Transparent,
            TextWrapping = TextWrapping.Wrap,
        };
        cachedRuns = formatted is null
            ? RichText.PlainRuns(text)
            : RichText.ParseFormatted(formatted);
        var linkColor = linkForeground;
        var mentionBack = mentionBackground;
        timeInline = new InlineUIContainer(timeSpace);
        var spans = new List<(int Start, int End, TextRun Run)>();
        var revealed = false;

        void Fill()
        {
            body.Inlines!.Clear();
            spans.Clear();
            var at = 0;
            foreach (var run in cachedRuns) {
                if (run.Br) {
                    body.Inlines.Add(new LineBreak());
                    at += 1;
                    continue;
                }

                var shown = (run.Prefix ?? "")
                            + (run.Spoiler && !revealed
                                ? Hidden(run.Text)
                                : run.Text);
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
                    piece.FontFamily =
                        new FontFamily(
                            "Cascadia Mono, DejaVu Sans Mono, monospace");
                var lines = new TextDecorationCollection();
                if (run.Underline ||
                    (run.Href is not null && run.UserId is null))
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

            body.Inlines.Add(timeInline);
        }

        Fill();
        var hasSpoiler = cachedRuns.Any(r => r.Spoiler);
        body.AddHandler(Avalonia.Input.InputElement.PointerReleasedEvent,
            (_, e) => {
                if (e.InitialPressMouseButton !=
                    Avalonia.Input.MouseButton.Left)
                    return;
                if (body.SelectionStart != body.SelectionEnd)
                    return;
                var index = body.TextLayout.HitTestPoint(e.GetPosition(body))
                    .TextPosition;
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
            body.Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand);

        stack = new StackPanel();

        if (reply is not null) {
            // The message this one answers: an accent bar, the name of its writer and the start of what was written.
            var quote = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*"),
                Margin = new Thickness(0, 0, 0, 4),
            };
            var bar = new Border {
                Width = 2,
                CornerRadius = new CornerRadius(1),
                Background = linkForeground,
                Margin = new Thickness(0, 0, 8, 0),
            };
            var lines = new StackPanel();
            if (reply.SenderName.Length > 0) {
                lines.Children.Add(Label(new TextBlock {
                    Text = reply.SenderName,
                    FontSize = 14,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = linkForeground,
                    TextTrimming = TextTrimming.CharacterEllipsis,
                }));
            }

            lines.Children.Add(Label(new TextBlock {
                Text = reply.Preview,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = secondary,
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxLines = 2,
            }));
            Grid.SetColumn(lines, 1);
            quote.Children.Add(bar);
            quote.Children.Add(lines);
            quote.Background = Brushes.Transparent;
            Quote = quote;
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
                picture.Cursor =
                    new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType
                        .Hand);
                picture.PointerPressed += (_, e) => {
                    if (e.GetCurrentPoint(picture).Properties
                        .IsLeftButtonPressed) {
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
                Background = imageFill,
                Margin = new Thickness(-6, -3, -6, hasText ? 4 : 14),
                Child = picture,
            });
            Avalonia.Automation.AutomationProperties.SetName(picture,
                image.FileName);
        }

        if (file is { Kind: Model.FileKind.Audio } clip && fetch is not null &&
            openFile is not null
            && clip.Source.Length > 0) {
            // An audio message plays in the card itself.
            audio = new AudioCard(clip, colors, mine, fg, meta, fetch,
                () => openFile(clip));
            audio.Margin = new Thickness(0, 2, 0, hasText ? 4 : 14);
            stack.Children.Add(audio);
        } else if (file is not null) {
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
                Background = linkForeground,
                Margin = new Thickness(0, 0, 12, 0),
                Child = new Icon {
                    Glyph = file.Kind switch {
                        Model.FileKind.Audio => "music",
                        Model.FileKind.Video => "video",
                        _ => "file",
                    },
                    Size = 22,
                    Color = fileInk,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    VerticalAlignment = VerticalAlignment.Center,
                },
            };
            var words = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center
            };
            words.Children.Add(Label(new TextBlock {
                Text = file.Name,
                FontSize = 16,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = fg,
                TextTrimming = TextTrimming.CharacterEllipsis,
            }));
            var size = Format.Bytes(file.Size);
            if (file.Duration is { } length)
                size = (size.Length > 0 ? size + " · " : "") +
                       Format.Duration(length);
            if (size.Length > 0) {
                words.Children.Add(Label(new TextBlock {
                    Text = size,
                    FontSize = 14,
                    FontFamily = Fonts.System,
                    Foreground = metadata,
                }));
            }

            Grid.SetColumn(words, 1);
            card.Children.Add(disc);
            card.Children.Add(words);
            if (openFile is not null && file.Source.Length > 0) {
                card.Background = Brushes.Transparent;
                card.Cursor =
                    new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType
                        .Hand);
                card.PointerPressed += (_, e) => {
                    e.Handled = true;
                    openFile(file);
                };
            }

            stack.Children.Add(card);
        }

        if (hasText)
            stack.Children.Add(body);
        if (preview is not null && hasText
                                && cachedRuns.FirstOrDefault(r =>
                                        r.Href is { } h &&
                                        r.UserId is null
                                        && (h.StartsWith("http://") ||
                                            h.StartsWith("https://")))
                                    ?.Href is { } link) {
            var slot = new Border();
            stack.Children.Add(slot);
            _ = FillPreview(slot, link, preview, pictures, openLink);
        }

        metaRow = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(0, 0, -2, -1),
        };
        metaLabel = Label(new TextBlock {
            FontSize = 14,
            Foreground = this.metadata,
            VerticalAlignment = VerticalAlignment.Center,
        });
        metaRow.Children.Add(metaLabel);

        var root = new Grid();
        root.Children.Add(stack);
        root.Children.Add(metaRow);
        Child = root;
        UpdatePresentation(colors, time, own, senderName, senderId, stuckAbove,
            stuckBelow, sending, failed, editedLabel, accent, read, readLabel);
    }

    /// <summary>Updates presentation without rebuilding content.</summary>
    public void UpdatePresentation(
        ColorTokens colors,
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
        bool read = false,
        string? readLabel = null
    )
    {
        var mine = own && accent;
        SetColors(colors, mine, failed);
        const double r = Radius.Bubble;
        const double t = Radius.BubbleTight;
        CornerRadius = own
            ? new CornerRadius(r, stuckAbove ? t : r, stuckBelow ? t : r, r)
            : new CornerRadius(stuckAbove ? t : r, r, r, stuckBelow ? t : r);
        body.FontFamily = Fonts.System;
        foreach (var label in labels)
            label.FontFamily = Fonts.System;
        if (senderName is not null && !own) {
            if (sender is null) {
                sender = Label(new TextBlock {
                    FontSize = 14,
                    FontWeight = FontWeight.SemiBold,
                    Margin = new Thickness(0, 0, 0, 2),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                });
                stack.Children.Insert(0, sender);
            }

            sender.IsVisible = true;
            sender.Text = senderName;
            var color = Avatar.PeerColor(senderId ?? senderName);
            if (sender.Foreground is SolidColorBrush brush)
                brush.Color = color;
            else
                sender.Foreground = new SolidColorBrush(color);
        } else if (sender is not null)
            sender.IsVisible = false;

        var text = (editedLabel is null ? "" : editedLabel + " ") + time;
        metaLabel.Text = text;
        // Reserve the same final-line space as when the bubble was made.
        timeSpace.Width = Math.Ceiling(text.Length * 7.4) + (own ? 24 : 0) + 8;
        if (own && mark is null) {
            mark = new Icon {
                StrokeWidth = 2,
                VerticalAlignment = VerticalAlignment.Center,
            };
            metaRow.Children.Add(mark);
        }

        if (mark is not null) {
            var seen = own && read && !sending && !failed;
            mark.IsVisible = own;
            mark.Glyph = failed ? "alert"
                : sending ? "clock"
                : seen ? "checks" : "check";
            mark.Size = seen ? 20 : 18;
            mark.Color = seen ? linkForeground : metadata;
            Avalonia.Automation.AutomationProperties.SetName(mark,
                seen ? readLabel ?? "" : "");
            ToolTip.SetTip(mark, seen ? readLabel : null);
        }

        audio?.UpdatePresentation(colors, mine, foreground, metadata.Color);
    }

    private void SetColors(ColorTokens colors, bool mine, bool failed)
    {
        fill.Color = mine ? colors.BubbleOut : colors.BubbleIn;
        foreground.Color = mine ? colors.BubbleOutText : colors.BubbleInText;
        secondary.Color = mine ? colors.BubbleOutMeta : colors.TextSecondary;
        metadata.Color = failed ? colors.Danger : secondary.Color;
        linkForeground.Color = mine ? colors.BubbleOutText : colors.Accent;
        mentionBackground.Color = colors.MentionBg;
        fileInk.Color = mine ? colors.BubbleOut : colors.OnAccent;
        imageFill.Color =
            ThemeColor.Mix(colors.BubbleIn, colors.Separator, 0.5);
        previewFill.Color = mine
            ? Color.FromArgb(36, 255, 255, 255)
            : colors.BgSecondary;
    }

    private TextBlock Label(TextBlock label)
    {
        label.FontFamily = Fonts.System;
        labels.Add(label);
        return label;
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

    /// <summary>Puts the card of a link in <paramref name="slot"/> when the server has a preview for it.</summary>
    private async Task FillPreview(
        Border slot,
        string link,
        Func<string, Task<Model.LinkPreview?>> preview,
        Pictures? pictures,
        Action<string>? openLink
    )
    {
        var found = await preview(link);
        if (found is null)
            return;
        var host = Uri.TryCreate(link, UriKind.Absolute, out var uri)
            ? uri.Host.Replace("www.", "")
            : link;
        var wide = found.ImageWidth is { } w && found.ImageHeight is { } h &&
                   w >= h * 1.6;
        var words = new StackPanel {
            Margin = new Thickness(wide ? 10 : 10, 8, 10, 8),
            VerticalAlignment = VerticalAlignment.Center,
        };
        words.Children.Add(Label(new TextBlock {
            Text = found.SiteName ?? host,
            FontSize = 13,
            FontFamily = Fonts.System,
            Foreground = secondary,
            TextTrimming = TextTrimming.CharacterEllipsis,
        }));
        if (found.Title is { } title) {
            words.Children.Add(Label(new TextBlock {
                Text = title,
                FontSize = 15,
                FontWeight = FontWeight.SemiBold,
                FontFamily = Fonts.System,
                Foreground = foreground,
                TextWrapping = TextWrapping.Wrap,
                MaxLines = 2,
                TextTrimming = TextTrimming.CharacterEllipsis,
            }));
        }

        if (found.Description is { } description) {
            words.Children.Add(Label(new TextBlock {
                Text = description,
                FontSize = 13,
                FontFamily = Fonts.System,
                Foreground = secondary,
                TextWrapping = TextWrapping.Wrap,
                MaxLines = 2,
                TextTrimming = TextTrimming.CharacterEllipsis,
            }));
        }

        var card = new StackPanel();
        Image? picture = null;
        if (found.Image is not null && pictures is not null) {
            picture = new Image {
                Stretch = Stretch.UniformToFill
            };
            if (wide) {
                picture.Height = 140;
                picture.Width = double.NaN;
                card.Children.Add(picture);
                card.Children.Add(words);
            } else {
                picture.Width = 56;
                picture.Height = 56;
                var row = new Grid {
                    ColumnDefinitions = new ColumnDefinitions("Auto,*")
                };
                row.Children.Add(picture);
                Grid.SetColumn(words, 1);
                row.Children.Add(words);
                card.Children.Add(row);
            }

            pictures.Attach(picture, found.Image, wide ? 560 : 112,
                wide ? 280 : 112);
        } else
            card.Children.Add(words);

        slot.Margin = new Thickness(0, 6, 0, 14);
        slot.CornerRadius = new CornerRadius(10);
        slot.ClipToBounds = true;
        slot.Background = previewFill;
        slot.Cursor =
            new Avalonia.Input.Cursor(Avalonia.Input.StandardCursorType.Hand);
        slot.MinWidth = 220;
        slot.Child = card;
        slot.PointerPressed += (_, e) => {
            e.Handled = true;
            (openLink ?? (h => OpenInBrowser(slot, h)))(link);
        };
        Avalonia.Automation.AutomationProperties.SetName(slot,
            found.Title ?? found.Description ?? host);
    }
}
