using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class RichBubbleTests {
    private static (Window, Bubble) Make(
        string text,
        string? html,
        Action<string>? open = null,
        Func<string, Task<LinkPreview?>>? preview = null
    )
    {
        var colors = Themes.Get("light")!.Colors;
        var bubble = new Bubble(
            colors, text, "12:30", false, formatted: html, openLink: open,
            senderName: "Ann",
            preview: preview
        ) {
            MaxWidth = 360
        };
        var panel = new StackPanel {
            Margin = new Thickness(16),
            Children = {
                bubble
            }
        };
        var window = new Window {
            Width = 420,
            Height = 200,
            Content = panel
        };
        ThemeScope.SetColors(window, colors);
        window.Show();
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
        return (window, bubble);
    }

    [AvaloniaFact]
    public void Formatted_text_is_drawn_with_its_styles()
    {
        var (window, bubble) = Make(
            "x",
            "<b>bold</b> <i>it</i> <code>c</code> <a href=\"https://e.com\">link</a>");
        var body = bubble.GetVisualDescendants().OfType<SelectableTextBlock>()
            .Single();
        var runs = body.Inlines!.OfType<Run>().ToList();
        Assert.Equal(FontWeight.Bold,
            runs.First(r => r.Text == "bold").FontWeight);
        Assert.Equal(FontStyle.Italic,
            runs.First(r => r.Text == "it").FontStyle);
        Assert.NotNull(runs.First(r => r.Text == "c").FontFamily);
        Assert.NotNull(runs.First(r => r.Text == "link").TextDecorations);
        var shot = Environment.GetEnvironmentVariable("OHMATRIX_CHAT_SHEET");
        if (shot != null)
            window.CaptureRenderedFrame()
                ?.Save(shot.Replace(".png", "-rich.png"));
    }

    [AvaloniaFact]
    public void Bare_urls_open_when_pressed()
    {
        var opened = new List<string>();
        var (window, bubble) =
            Make("go https://example.com/a now", null, opened.Add);
        var body = bubble.GetVisualDescendants().OfType<SelectableTextBlock>()
            .Single();
        var at = body.TextLayout.HitTestTextPosition(6);
        var point = body.TranslatePoint(new Point(at.X + 2, at.Y + 4), window)!
            .Value;
        window.MouseDown(point, Avalonia.Input.MouseButton.Left);
        window.MouseUp(point, Avalonia.Input.MouseButton.Left);
        Assert.Equal(["https://example.com/a"], opened);
    }

    [AvaloniaFact]
    public void A_spoiler_is_hidden_until_pressed()
    {
        var (window, bubble) =
            Make("x", "a <span data-mx-spoiler>secret</span>");
        var body = bubble.GetVisualDescendants().OfType<SelectableTextBlock>()
            .Single();
        Assert.DoesNotContain(body.Inlines!.OfType<Run>(),
            r => r.Text == "secret");
        var at = body.TextLayout.HitTestTextPosition(3);
        var point = body.TranslatePoint(new Point(at.X + 2, at.Y + 4), window)!
            .Value;
        window.MouseDown(point, Avalonia.Input.MouseButton.Left);
        window.MouseUp(point, Avalonia.Input.MouseButton.Left);
        Assert.Contains(body.Inlines!.OfType<Run>(), r => r.Text == "secret");
    }

    [AvaloniaFact]
    public async Task
        A_link_gets_a_card_when_the_server_has_a_preview_and_opens_when_pressed()
    {
        var opened = new List<string>();
        var asked = new List<string>();
        var (window, bubble) = Make("see https://example.com/a", null,
            opened.Add, url => {
                asked.Add(url);
                return Task.FromResult<LinkPreview?>(new LinkPreview(url,
                    "Example title",
                    "A page about examples", "Example", null, null, null));
            });
        await Task.Delay(50);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.Equal(["https://example.com/a"], asked);
        var texts = bubble.GetVisualDescendants().OfType<TextBlock>()
            .Select(t => t.Text).ToList();
        Assert.Contains("Example title", texts);
        Assert.Contains("A page about examples", texts);
        var shot = Environment.GetEnvironmentVariable("OHMATRIX_CHAT_SHEET");
        if (shot != null)
            window.CaptureRenderedFrame()
                ?.Save(shot.Replace(".png", "-preview.png"));
        var card = bubble.GetVisualDescendants().OfType<Border>()
            .First(b =>
                Avalonia.Automation.AutomationProperties.GetName(b) ==
                "Example title");
        card.RaiseEvent(new Avalonia.Input.PointerPressedEventArgs(
            card,
            new Avalonia.Input.Pointer(0, Avalonia.Input.PointerType.Mouse,
                true), card,
            new Point(5, 5), 0,
            new Avalonia.Input.PointerPointProperties(
                Avalonia.Input.RawInputModifiers.LeftMouseButton,
                Avalonia.Input.PointerUpdateKind.LeftButtonPressed),
            Avalonia.Input.KeyModifiers.None));
        Assert.Equal(["https://example.com/a"], opened);
    }

    [AvaloniaFact]
    public async Task No_card_is_drawn_when_there_is_no_preview()
    {
        var (_, bubble) = Make("see https://example.com/a", null,
            preview: _ => Task.FromResult<LinkPreview?>(null));
        await Task.Delay(50);
        Avalonia.Threading.Dispatcher.UIThread.RunJobs();
        Assert.DoesNotContain(bubble.GetVisualDescendants().OfType<Border>(),
            b => b.Cursor != null && b.Child is StackPanel);
    }
}
