using Avalonia.Input.Platform;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Layout;
using Avalonia.Media;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Chat.Messages;

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
    private readonly SolidColorBrush imageFill = new();
    private readonly SolidColorBrush previewFill = new();
    private readonly List<TextBlock> labels = new();
    private readonly SelectableTextBlock body;
    private readonly StackPanel stack;

    private readonly StackPanel metaRow;

    // The picture of a picture-only bubble: the time sits on it, in a dark pill.
    private readonly Border? picturePill;
    private readonly TextBlock metaLabel;
    private readonly IReadOnlyList<TextRun> cachedRuns;

    // The room the time needs at the end of the last line: spaces that do not part from the last word (as in the web), as wide as the time row and the gap before it, and not seen.
    private readonly Run timeRun = new() {
        Foreground = Brushes.Transparent
    };

    private TextBlock? sender;
    private Icon? mark;
    private readonly AudioCard? audio;

    public Bubble(BubbleParams p) : this(
        p.Colors, p.Text, p.Time, p.Own, p.SenderName, p.SenderId,
        p.StuckAbove, p.StuckBelow, p.Sending, p.Failed, p.EditedLabel,
        p.Accent, p.Reply, p.Image, p.Pictures, p.File, p.OpenImage,
        p.Formatted, p.OpenLink, p.Read, p.ReadLabel, p.OpenFile, p.Preview,
        p.Fetch)
    {
    }

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
        var hasText = text.Length > 0 || (image == null && file == null);
        pictureOnly = image != null && text.Length == 0;
        var audioCard = file is { Kind: Model.FileKind.Audio } &&
                        fetch != null && openFile != null &&
                        file.Source.Length > 0;
        // A file on its own is a card: 232 wide, 64 high, the tile on the right.
        fileCard = file != null && !audioCard && !hasText && reply == null;
        plainFile = file != null && !audioCard;
        var mine = own && accent && !fileCard;
        SetColors(colors, mine, failed);
        Background = fill;
        Padding = pictureOnly ? new Thickness(0)
            : fileCard ? new Thickness(14, 12, 14, 12)
            : new Thickness(12, 7, 12, 6);
        var fg = foreground;
        var meta = metadata.Color;

        body = new SelectableTextBlock {
            FontSize = 16,
            LineHeight = 21,
            FontFamily = Fonts.System,
            Foreground = fg,
            Background = Brushes.Transparent,
            TextWrapping = TextWrapping.Wrap,
            // The text clips to its own box, and the foot of a letter such as g is below a line of 21: the box gets 3 more, taken back with the margin.
            // The text sits 1 higher than its box (the last line's foot is then level with the foot of the time and 12 above the bubble's), and the foot gets 1 more.
            Padding = new Thickness(0, 0, 0, 3),
            Margin = new Thickness(0, -1, 0, -2),
        };
        cachedRuns = formatted == null
            ? RichText.PlainRuns(text)
            : RichText.ParseFormatted(formatted);
        var linkColor = linkForeground;
        var mentionBack = mentionBackground;
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
                if (run.Bold || run.UserId != null)
                    piece.FontWeight = run.UserId != null && !run.Bold
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
                    (run.Href != null && run.UserId == null))
                    lines.Add(new TextDecoration {
                        Location = TextDecorationLocation.Underline
                    });
                if (run.Strike)
                    lines.Add(new TextDecoration {
                        Location = TextDecorationLocation.Strikethrough
                    });
                if (lines.Count > 0)
                    piece.TextDecorations = lines;
                if (run.UserId != null) {
                    piece.Foreground = linkColor;
                    piece.Background = mentionBack;
                } else if (run.Href != null)
                    piece.Foreground = linkColor;

                body.Inlines.Add(piece);
                spans.Add((at, at + shown.Length, run));
                at += shown.Length;
            }

            body.Inlines.Add(timeRun);
        }

        Fill();
        // A selection that is copied leaves out the spaces kept for the time.
        body.AddHandler(Avalonia.Input.InputElement.KeyDownEvent, (_, e) => {
            if (e.Key != Avalonia.Input.Key.C ||
                (e.KeyModifiers & (Avalonia.Input.KeyModifiers.Control |
                                   Avalonia.Input.KeyModifiers.Meta)) == 0)
                return;
            e.Handled = true;
            var selected = (body.SelectedText ?? "").TrimEnd('\u00A0');
            if (selected.Length > 0)
                _ = TopLevel.GetTopLevel(body)?.Clipboard
                    ?.SetTextAsync(selected);
        }, Avalonia.Interactivity.RoutingStrategies.Tunnel);
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
                    } else if (run.Href != null)
                        (openLink ?? (h => OpenInBrowser(body, h)))(run.Href);

                    break;
                }
            }, handledEventsToo: true);
        if (hasSpoiler)
            body.Cursor =
                new Avalonia.Input.Cursor(
                    Avalonia.Input.StandardCursorType.Hand);

        stack = new StackPanel();

        if (reply != null) {
            // The message this one answers: an accent bar, the name of its writer and the start of what was written.
            // The bar and the name take the colour of the writer; on an accent
            // bubble the bar is white and the name is the bubble's text.
            var writer = Avatar.PeerColor(
                reply.SenderId.Length > 0 ? reply.SenderId : reply.SenderName);
            var quote = new Grid {
                ColumnDefinitions = new ColumnDefinitions("Auto,*"),
                // At the very top of a bubble the bar would sit in the rounded
                // corner: it starts a little lower.
                Margin = pictureOnly
                    ? new Thickness(8, 8, 8, 4)
                    : senderName != null && !own
                        ? new Thickness(0, 0, 0, 4)
                        : new Thickness(0, 4.5, 0, 4),
            };
            var bar = new Border {
                Width = 3,
                CornerRadius = new CornerRadius(3, 0, 0, 3),
                Background = mine
                    ? new SolidColorBrush(Color.FromArgb(204, 255, 255, 255))
                    : new SolidColorBrush(writer),
                Margin = new Thickness(0, 0, 8, 0),
            };
            var lines = new StackPanel();
            if (reply.SenderName.Length > 0) {
                lines.Children.Add(Label(Overflow(new TextBlock {
                    Text = reply.SenderName,
                    FontSize = 14,
                    LineHeight = 18,
                    FontWeight = FontWeight.SemiBold,
                    FontFamily = Fonts.System,
                    Foreground = mine
                        ? foreground
                        : new SolidColorBrush(writer),
                    TextTrimming = TextTrimming.CharacterEllipsis,
                })));
            }

            lines.Children.Add(Label(Overflow(new TextBlock {
                Text = reply.Preview,
                FontSize = 14,
                FontFamily = Fonts.System,
                Foreground = secondary,
                TextWrapping = TextWrapping.Wrap,
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxLines = 2,
            })));
            Grid.SetColumn(lines, 1);
            quote.Children.Add(bar);
            quote.Children.Add(lines);
            quote.Background = Brushes.Transparent;
            Quote = quote;
            stack.Children.Add(quote);
        }

        if (image != null) {
            var (w, h) = MediaSize.Fit(image.Width, image.Height);
            var picture = new Image {
                Width = w,
                Height = h,
                Stretch = Stretch.UniformToFill,
            };
            pictures?.Attach(picture, image.Source, w, h);
            if (openImage != null) {
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

            // The picture bleeds to the edges of the bubble. Alone it is clipped
            // to the bubble's corners; with text it is clipped to its top
            // corners, and only when nothing is above it.
            var width = pictureOnly ? w : w + 24;
            picture.Width = width;
            picture.Height = h;
            var clip = pictureOnly
                ? Corners(own, stuckAbove, stuckBelow)
                : senderName == null && reply == null
                    ? new CornerRadius(r, r, 0, 0)
                    : new CornerRadius(0);
            var frame = new Border {
                Width = width,
                Height = h,
                CornerRadius = clip,
                ClipToBounds = true,
                Background = imageFill,
                Margin = pictureOnly
                    ? new Thickness(0)
                    : new Thickness(-12, senderName == null ? -7 : 0, -12,
                        hasText ? 6 : 14),
                Child = picture,
            };
            Control shown = frame;
            if (pictureOnly) {
                picturePill = new Border {
                    CornerRadius = new CornerRadius(12),
                    Padding = new Thickness(9, 3),
                    Margin = new Thickness(8),
                    Background =
                        new SolidColorBrush(Color.FromArgb(115, 0, 0, 0)),
                    HorizontalAlignment = HorizontalAlignment.Right,
                    VerticalAlignment = VerticalAlignment.Bottom,
                };
                var layer = new Grid {
                    Width = w,
                    Height = h,
                };
                layer.Children.Add(frame);
                layer.Children.Add(picturePill);
                shown = layer;
            }

            stack.Children.Add(shown);
            Avalonia.Automation.AutomationProperties.SetName(picture,
                image.FileName);
        }

        if (audioCard) {
            var clip = file!;
            var open = openFile!;
            // An audio message plays in the card itself.
            audio = new AudioCard(clip, colors, mine, fg, meta, fetch!,
                () => open(clip));
            audio.Margin = new Thickness(0, 2, 0, hasText ? 4 : 14);
            stack.Children.Add(audio);
        } else if (file != null) {
            // A file: its icon on the accent, the name and the size.
            var card = new Grid {
                ColumnDefinitions = new ColumnDefinitions("*,Auto"),
                Margin = fileCard
                    ? new Thickness(0)
                    : new Thickness(0, 2, 0, hasText ? 4 : 14),
                Width = fileCard ? 232 : double.NaN,
                Height = fileCard ? 64 : double.NaN,
                MinWidth = fileCard ? 0 : 220,
            };
            // The name has two lines of room (cut with an ellipsis), the size
            // sits at the foot, and the tile is at the right.
            var name = Label(Overflow(new TextBlock {
                Text = file.Name,
                FontSize = 15,
                LineHeight = 20,
                FontWeight = FontWeight.Medium,
                FontFamily = Fonts.System,
                Foreground = fg,
                TextWrapping = TextWrapping.Wrap,
                MaxLines = 2,
                TextTrimming = TextTrimming.CharacterEllipsis,
            }));
            // Not clipped: the name has two lines of room, and what overflows
            // the box is still drawn.
            var nameBox = new Border {
                Height = 40,
                Child = name,
            };
            var size = Format.Bytes(file.Size);
            var length = file.Duration;
            if (length != null)
                size = (size.Length > 0 ? size + " · " : "") +
                       Format.Duration(length.Value);
            var sizeLine = Label(Overflow(new TextBlock {
                Text = size,
                FontSize = 12,
                LineHeight = 16,
                FontFamily = Fonts.System,
                Foreground = metadata,
                VerticalAlignment = VerticalAlignment.Bottom,
            }));
            Grid.SetRow(sizeLine, 1);
            var words = new Grid {
                RowDefinitions = new RowDefinitions("40,*"),
            };
            words.Children.Add(nameBox);
            words.Children.Add(sizeLine);
            var tile = new FileTile(file.Name) {
                Margin = new Thickness(14, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Top,
            };
            Grid.SetColumn(tile, 1);
            card.Children.Add(words);
            card.Children.Add(tile);
            if (openFile != null && file.Source.Length > 0) {
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
        string? previewLink = null;
        if (preview != null && hasText) {
            previewLink = cachedRuns.FirstOrDefault(r =>
                r.Href != null && r.UserId == null &&
                (r.Href.StartsWith("http://") ||
                 r.Href.StartsWith("https://")))?.Href;
        }

        if (preview != null && previewLink != null) {
            var slot = new Border();
            stack.Children.Add(slot);
            _ = FillPreview(slot, previewLink, preview, pictures, openLink);
        }

        // The time and the state sit at the end of the last line of the text,
        // as in the React Native app; with no text they sit on the picture, or
        // under the card at the right.
        metaRow = new StackPanel {
            Orientation = Orientation.Horizontal,
            Spacing = 6,
        };
        metaLabel = Label(new TextBlock {
            FontSize = 14,
            Foreground = this.metadata,
            VerticalAlignment = VerticalAlignment.Center,
        });
        metaRow.Children.Add(metaLabel);

        // The time is drawn at the bottom right of the bubble, and the text
        // keeps an empty box at the end of its last line where it falls.
        if (pictureOnly) {
            picturePill!.Child = metaRow;
            Child = stack;
        } else {
            metaRow.HorizontalAlignment = HorizontalAlignment.Right;
            metaRow.VerticalAlignment = VerticalAlignment.Bottom;
            // Its foot is 6 above the bubble's, whatever the padding is.
            metaRow.Margin = new Thickness(0, 0, 0, 6 - Padding.Bottom);
            var root = new Grid();
            root.Children.Add(stack);
            root.Children.Add(metaRow);
            Child = root;
        }

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
        var mine = own && accent && !fileCard;
        SetColors(colors, mine, failed);
        CornerRadius = Corners(own, stuckAbove, stuckBelow);
        body.FontFamily = Fonts.System;
        foreach (var label in labels)
            label.FontFamily = Fonts.System;
        if (senderName != null && !own && !plainFile) {
            if (sender == null) {
                sender = Label(new TextBlock {
                    FontSize = 14,
                    FontWeight = FontWeight.SemiBold,
                    // On a picture alone the name has a band of its own above it.
                    Margin = pictureOnly
                        ? new Thickness(12, 7, 12, 2)
                        : new Thickness(0, 0, 0, 2),
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
        } else if (sender != null)
            sender.IsVisible = false;

        var text = (editedLabel == null ? "" : editedLabel + " ") + time;
        metaLabel.Text = text;
        if (own && mark == null) {
            mark = new Icon {
                StrokeWidth = 2,
                VerticalAlignment = VerticalAlignment.Center,
            };
            metaRow.Children.Add(mark);
        }

        if (mark != null) {
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

        // The box left for the time at the end of the text is as wide as the
        // time row, and the gap before it.
        MeasureTime();
        audio?.UpdatePresentation(colors, mine, foreground, metadata.Color);
    }

    private void MeasureTime()
    {
        metaRow.Measure(Size.Infinity);
        // The gap before the time: 20, and 4 more beside the state of an own message.
        var need = metaRow.DesiredSize.Width +
                   (mark is { IsVisible: true } ? 24 : 20);
        // Spaces alone have no width in a layout: measured after a letter.
        var face = new Typeface(body.FontFamily);
        var bare = new Avalonia.Media.TextFormatting.TextLayout("|", face,
            body.FontSize, null);
        var padded = new Avalonia.Media.TextFormatting.TextLayout(
            "|" + new string('\u00A0', 20), face, body.FontSize, null);
        var one = Math.Max(1, (padded.WidthIncludingTrailingWhitespace -
                               bare.WidthIncludingTrailingWhitespace) / 20);
        timeRun.Text = new string('\u00A0', (int)Math.Ceiling(need / one));
    }

    // A picture with no text: the bubble is the picture (no padding) and the time is on it.
    private bool pictureOnly;

    // A file on its own is a card of the neutral colour for both sides, with no name of the sender above it.
    private bool fileCard;
    private bool plainFile;

    // The corners of a bubble: the side that touches a neighbour of the same
    // run is tight.
    private static CornerRadius Corners(bool own, bool above, bool below)
    {
        const double r = Radius.Bubble;
        const double t = Radius.BubbleTight;
        return own
            ? new CornerRadius(r, above ? t : r, below ? t : r, r)
            : new CornerRadius(above ? t : r, r, r, below ? t : r);
    }

    private void SetColors(ColorTokens colors, bool mine, bool failed)
    {
        fill.Color = mine ? colors.BubbleOut : colors.BubbleIn;
        foreground.Color = mine ? colors.BubbleOutText : colors.BubbleInText;
        secondary.Color = mine ? colors.BubbleOutMeta : colors.TextSecondary;
        metadata.Color = failed ? colors.Danger
            : pictureOnly ? Colors.White
            : secondary.Color;
        linkForeground.Color = mine ? colors.BubbleOutText : colors.Accent;
        mentionBackground.Color = colors.MentionBg;
        imageFill.Color =
            ThemeColor.Mix(colors.BubbleIn, colors.Separator, 0.5);
        previewFill.Color = mine
            ? Color.FromArgb(36, 255, 255, 255)
            : colors.BgSecondary;
    }

    // A line box that is shorter than the font's own cuts the foot of the
    // letters (g, y, p): the box gets 3 more below, taken back with the margin,
    // so the text may overflow it and the layout is not changed.
    private static TextBlock Overflow(TextBlock label)
    {
        label.Padding = new Thickness(0, 0, 0, 3);
        label.Margin = new Thickness(label.Margin.Left, label.Margin.Top,
            label.Margin.Right, label.Margin.Bottom - 3);
        return label;
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
        var launcher = TopLevel.GetTopLevel(from)?.Launcher;
        if (launcher != null)
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
        if (found == null)
            return;
        var host = Uri.TryCreate(link, UriKind.Absolute, out var uri)
            ? uri.Host.Replace("www.", "")
            : link;
        var wide = found.ImageWidth != null && found.ImageHeight != null &&
                   found.ImageWidth.Value >= found.ImageHeight.Value * 1.6;
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
        var title = found.Title;
        if (title != null) {
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

        var description = found.Description;
        if (description != null) {
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
        if (found.Image != null && pictures != null) {
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
