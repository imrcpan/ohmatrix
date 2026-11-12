using Avalonia;
using Avalonia.Automation;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Chat.Messages;
using OhMatrix.Core.Ui.Media;
using OhMatrix.Core.Ui.Widgets;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class BubbleUpdateTests {
    private static ColorTokens Colors(string name = "light") =>
        Themes.Get(name)!.Colors;

    private static Window Open(Bubble bubble)
    {
        bubble.MaxWidth = 360;
        var window = new Window {
            Width = 460,
            Height = 640,
            Content = new StackPanel {
                Margin = new Thickness(16),
                Children = {
                    bubble
                },
            },
        };
        ThemeScope.SetColors(window, Colors());
        window.Show();
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
        return window;
    }

    private static SelectableTextBlock Body(Bubble bubble) =>
        bubble.GetVisualDescendants().OfType<SelectableTextBlock>().Single();

    private static TextBlock Text(Control control, string text) =>
        control.GetVisualDescendants().OfType<TextBlock>()
            .Single(t => t.Text == text);

    private static Color ColorOf(IBrush? brush) =>
        Assert.IsAssignableFrom<ISolidColorBrush>(brush).Color;

    private static void SameInlines(Inline[] before, SelectableTextBlock body)
    {
        Assert.Equal(before.Length, body.Inlines!.Count);
        for (var i = 0; i < before.Length; i++)
            Assert.Same(before[i], body.Inlines[i]);
    }

    private static void Press(Control control)
    {
        control.RaiseEvent(new PointerPressedEventArgs(control,
            new Pointer(0, PointerType.Mouse, true), control,
            new Point(5, 5), 0, new PointerPointProperties(
                RawInputModifiers.LeftMouseButton,
                PointerUpdateKind.LeftButtonPressed), KeyModifiers.None));
    }

    [AvaloniaFact]
    public void Presentation_keeps_runs_selection_quote_and_time_space()
    {
        var bubble = new Bubble(Colors(), "body", "12:30", false,
            senderName: "Ann", senderId: "@ann:example.com",
            reply: new ReplyQuote("Bob", "Quoted text", "$reply"),
            formatted: "<b>bold</b> <a href='https://e.com'>link</a> " +
                       "<a href='https://matrix.to/#/@ann:example.com'>Ann</a>");
        var window = Open(bubble);
        try {
            var root = bubble.Child;
            var body = Body(bubble);
            var inlines = body.Inlines!.ToArray();
            // The room for the time at the end of the text: spaces that do not
            // part from the last word, and are not seen.
            var reserve = inlines.OfType<Run>().Last();
            Assert.NotEmpty(reserve.Text!);
            Assert.All(reserve.Text!, c => Assert.Equal('\u00A0', c));
            var sender = Text(bubble, "Ann");
            var quote = bubble.Quote;
            var quoted = Text(bubble, "Quoted text");
            var time = Text(bubble, "12:30");
            body.SelectionStart = 0;
            body.SelectionEnd = 4;
            Fonts.Use("monospace");
            var colors = Colors("dark");
            bubble.MaxWidth = 220;
            bubble.UpdatePresentation(colors, "13:45", false,
                senderName: "Ann renamed", senderId: "@new:example.com",
                stuckAbove: true, stuckBelow: true, editedLabel: "edited");
            window.UpdateLayout();
            Assert.Same(root, bubble.Child);
            Assert.Same(body, Body(bubble));
            SameInlines(inlines, body);
            Assert.Equal(0, body.SelectionStart);
            Assert.Equal(4, body.SelectionEnd);
            Assert.Equal(Fonts.System, body.FontFamily);
            Assert.Equal(colors.BubbleInText, ColorOf(body.Foreground));
            Assert.Equal(colors.BubbleIn, ColorOf(bubble.Background));
            Assert.Equal(new CornerRadius(Radius.BubbleTight, Radius.Bubble,
                Radius.Bubble, Radius.BubbleTight), bubble.CornerRadius);
            Assert.Same(sender, Text(bubble, "Ann renamed"));
            Assert.Equal(Avatar.PeerColor("@new:example.com"),
                ColorOf(sender.Foreground));
            Assert.Equal(Fonts.System, sender.FontFamily);
            Assert.Same(quote, bubble.Quote);
            Assert.Same(quoted, Text(bubble, "Quoted text"));
            Assert.Equal(colors.TextSecondary, ColorOf(quoted.Foreground));
            Assert.Equal(Fonts.System, quoted.FontFamily);
            // The name of the writer of the quote is in their colour.
            Assert.Equal(Avatar.PeerColor("Bob"),
                ColorOf(Text(bubble, "Bob").Foreground));
            var link = inlines.OfType<Run>().Single(r => r.Text == "link");
            Assert.Equal(colors.Accent, ColorOf(link.Foreground));
            var mention = inlines.OfType<Run>().Single(r => r.Text == "Ann");
            Assert.Equal(colors.MentionBg, ColorOf(mention.Background));
            Assert.Same(time, Text(bubble, "edited 13:45"));
            Assert.NotEmpty(reserve.Text!);
            Assert.All(reserve.Text!, c => Assert.Equal('\u00A0', c));
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Read_send_failure_and_ownership_update_existing_metadata()
    {
        var bubble = new Bubble(Colors(), "body", "12:30", true,
            sending: true);
        var window = Open(bubble);
        try {
            var body = Body(bubble);
            var inlines = body.Inlines!.ToArray();
            var mark = bubble.GetVisualDescendants().OfType<Icon>().Single();
            var time = Text(bubble, "12:30");
            var reserve = inlines.OfType<Run>().Last();
            Assert.Equal("clock", mark.Glyph);
            var colors = Colors("dark");
            bubble.UpdatePresentation(colors, "12:31", true,
                stuckAbove: true, stuckBelow: true, accent: false, read: true,
                readLabel: "Read by Ann");
            Assert.Same(mark,
                bubble.GetVisualDescendants().OfType<Icon>().Single());
            Assert.Equal("checks", mark.Glyph);
            Assert.Equal(20, mark.Size);
            Assert.Equal(2, mark.StrokeWidth);
            Assert.Equal(colors.Accent, ColorOf(mark.Color));
            Assert.Equal("Read by Ann", ToolTip.GetTip(mark));
            Assert.Equal("Read by Ann", AutomationProperties.GetName(mark));
            Assert.Equal(colors.BubbleIn, ColorOf(bubble.Background));
            Assert.Equal(new CornerRadius(Radius.Bubble, Radius.BubbleTight,
                Radius.BubbleTight, Radius.Bubble), bubble.CornerRadius);
            Assert.Same(time, Text(bubble, "12:31"));
            var withState = reserve.Text!.Length;
            bubble.UpdatePresentation(colors, "12:32", true, failed: true,
                read: true, readLabel: "Read by Bob");
            Assert.Equal("alert", mark.Glyph);
            Assert.Equal(18, mark.Size);
            Assert.Equal(colors.Danger, ColorOf(mark.Color));
            Assert.Equal(colors.Danger, ColorOf(time.Foreground));
            Assert.Null(ToolTip.GetTip(mark));
            Assert.Equal("", AutomationProperties.GetName(mark));
            bubble.UpdatePresentation(colors, "12:33", true, sending: true);
            Assert.Equal("clock", mark.Glyph);
            bubble.UpdatePresentation(colors, "12:34", true);
            Assert.Equal("check", mark.Glyph);
            bubble.UpdatePresentation(colors, "12:35", false,
                senderName: "Sender");
            Assert.False(mark.IsVisible);
            Assert.True(Text(bubble, "Sender").IsVisible);
            // Without the state of a sent message the time needs less room.
            Assert.True(reserve.Text!.Length < withState);
            bubble.UpdatePresentation(colors, "12:36", true,
                senderName: "Sender");
            Assert.False(Text(bubble, "Sender").IsVisible);
            SameInlines(inlines, body);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Revealed_spoilers_survive_resize_theme_and_font_updates()
    {
        var bubble = new Bubble(Colors(), "x", "12:30", false,
            formatted: "a <span data-mx-spoiler>secret</span>");
        var window = Open(bubble);
        try {
            var body = Body(bubble);
            var at = body.TextLayout.HitTestTextPosition(3);
            var point = body.TranslatePoint(new Point(at.X + 2, at.Y + 4),
                window)!.Value;
            window.MouseDown(point, MouseButton.Left);
            window.MouseUp(point, MouseButton.Left);
            Assert.Contains(body.Inlines!.OfType<Run>(),
                r => r.Text == "secret");
            var inlines = body.Inlines!.ToArray();
            body.SelectionStart = 2;
            body.SelectionEnd = 8;
            Fonts.Use("monospace");
            bubble.MaxWidth = 180;
            bubble.UpdatePresentation(Colors("dark"), "13:00", false,
                editedLabel: "edited");
            window.UpdateLayout();
            SameInlines(inlines, body);
            Assert.Contains(body.Inlines!.OfType<Run>(),
                r => r.Text == "secret");
            Assert.Equal(2, body.SelectionStart);
            Assert.Equal(8, body.SelectionEnd);
            Assert.Equal(Fonts.System, body.FontFamily);
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Images_and_file_cards_keep_controls_sources_and_callbacks()
    {
        var file = new FileAttachment("file.txt", 1024, "mxc://s/file");
        var openedFiles = new List<FileAttachment>();
        var openedImages = new List<Image>();
        var bubble = new Bubble(Colors(), "caption", "12:30", true,
            image: new ImageAttachment("mxc://s/image", 80, 60, "image.png"),
            pictures: new Pictures(null), file: file,
            openImage: openedImages.Add, openFile: openedFiles.Add);
        var window = Open(bubble);
        try {
            var picture =
                bubble.GetVisualDescendants().OfType<Image>().Single();
            using var bitmap = new RenderTargetBitmap(new PixelSize(8, 8));
            picture.Source = bitmap;
            var name = Text(bubble, "file.txt");
            // The name is in a box of two lines, in the grid of the card that
            // has the tile of the file's kind beside it.
            var card = Assert.IsType<Grid>(bubble.GetVisualDescendants()
                .OfType<FileTile>().Single().GetVisualParent());
            var tile = card.GetVisualDescendants().OfType<FileTile>().Single();
            var tree = card.GetVisualDescendants().ToArray();
            var colors = Colors("dark");
            Fonts.Use("monospace");
            bubble.MaxWidth = 280;
            bubble.UpdatePresentation(colors, "12:31", true);
            window.UpdateLayout();
            Assert.Same(picture,
                bubble.GetVisualDescendants().OfType<Image>().Single());
            Assert.Same(bitmap, picture.Source);
            Assert.Same(name, Text(bubble, "file.txt"));
            Assert.Equal(tree, card.GetVisualDescendants().ToArray());
            Assert.Equal(Fonts.System, name.FontFamily);
            Assert.Equal(colors.BubbleOutText, ColorOf(name.Foreground));
            Assert.Same(tile,
                card.GetVisualDescendants().OfType<FileTile>().Single());
            Press(picture);
            Press(card);
            Assert.Equal(new[] {
                picture
            }, openedImages);
            Assert.Equal(new[] {
                file
            }, openedFiles);
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Audio_presentation_preserves_controls_without_fetching()
    {
        var fetched = 0;
        var opened = 0;
        var file = new FileAttachment("note.wav", 2000, "mxc://s/audio",
            "audio/wav", FileKind.Audio, TimeSpan.FromSeconds(10));
        var bubble = new Bubble(Colors(), "", "12:30", true, file: file,
            openFile: _ => opened++, fetch: _ => {
                fetched++;
                return Task.FromResult<string?>(null);
            });
        var window = Open(bubble);
        try {
            var audio = bubble.GetVisualDescendants().OfType<AudioCard>()
                .Single();
            var tree = audio.GetVisualDescendants().ToArray();
            var name = Text(audio, "note.wav");
            var glyph = audio.GetVisualDescendants().OfType<Icon>().Single();
            var colors = Colors("dark");
            Fonts.Use("monospace");
            bubble.MaxWidth = 280;
            bubble.UpdatePresentation(colors, "13:00", false);
            window.UpdateLayout();
            Assert.Same(audio,
                bubble.GetVisualDescendants().OfType<AudioCard>().Single());
            Assert.Equal(tree, audio.GetVisualDescendants().ToArray());
            Assert.Equal("play", audio.Glyph);
            Assert.Equal(0, audio.Position);
            Assert.Equal(0, fetched);
            Assert.Equal(0, opened);
            Assert.Equal(colors.OnAccent, ColorOf(glyph.Color));
            Assert.Equal(colors.Accent,
                ColorOf(Assert.IsType<Border>(glyph.GetVisualParent())
                    .Background));
            Assert.Equal(colors.BubbleInText, ColorOf(name.Foreground));
            Assert.All(audio.GetVisualDescendants().OfType<TextBlock>(),
                text => Assert.Equal(Fonts.System, text.FontFamily));
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }

    [AvaloniaFact]
    public async Task
        Late_previews_use_current_theme_and_keep_the_loaded_image()
    {
        var requested = 0;
        var found = new TaskCompletionSource<LinkPreview?>();
        var bubble = new Bubble(Colors(), "https://example.com/a", "12:30",
            true, pictures: new Pictures(null), preview: _ => {
                requested++;
                return found.Task;
            });
        var window = Open(bubble);
        try {
            var dark = Colors("dark");
            bubble.UpdatePresentation(dark, "12:31", true);
            found.SetResult(new LinkPreview("https://example.com/a", "Title",
                "Description", "Site", "mxc://s/preview", 200, 100));
            await Task.Yield();
            Dispatcher.UIThread.RunJobs();
            window.UpdateLayout();
            var title = Text(bubble, "Title");
            Assert.Equal(dark.BubbleOutText, ColorOf(title.Foreground));
            var card = bubble.GetVisualDescendants().OfType<Border>()
                .Single(b => AutomationProperties.GetName(b) == "Title");
            var picture = card.GetVisualDescendants().OfType<Image>().Single();
            using var bitmap = new RenderTargetBitmap(new PixelSize(8, 8));
            picture.Source = bitmap;
            var tree = card.GetVisualDescendants().ToArray();
            Fonts.Use("monospace");
            var light = Colors();
            bubble.MaxWidth = 280;
            bubble.UpdatePresentation(light, "12:32", false);
            window.UpdateLayout();
            Assert.Same(title, Text(bubble, "Title"));
            Assert.Equal(tree, card.GetVisualDescendants().ToArray());
            Assert.Same(bitmap, picture.Source);
            Assert.Equal(light.BubbleInText, ColorOf(title.Foreground));
            Assert.Equal(light.BgSecondary, ColorOf(card.Background));
            Assert.All(card.GetVisualDescendants().OfType<TextBlock>(),
                text => Assert.Equal(Fonts.System, text.FontFamily));
            Assert.Equal(1, requested);
        } finally {
            Fonts.Use(null);
            window.Close();
        }
    }
}
