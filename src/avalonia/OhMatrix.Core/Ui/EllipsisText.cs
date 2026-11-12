using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;

namespace OhMatrix.Core.Ui;

/// <summary>
/// Single-line text that ends in three ASCII dots ("...") where it does not fit, not in the "…" of the platform (<c>EllipsisText</c> of the React Native
/// app). The cut is found by measuring: the longest start of the text that, with the dots, fits the width; the end of what is kept is trimmed of
/// white space first, and the text is cut between code points, so a picture such as an emoji is not split. Text that fits is shown as it is.
/// </summary>
public sealed class EllipsisText : Decorator {
    private const string Dots = "...";

    private readonly TextBlock label = new() {
        TextWrapping = TextWrapping.NoWrap,
        TextTrimming = null,
    };

    private string text = "";
    private bool fromStart;
    private string cutText = "";
    private double cutWidth = double.NaN;
    private string? cutFont;

    public EllipsisText()
    {
        Child = label;
    }

    /// <summary>The whole text; what is drawn is the part of it that fits.</summary>
    public string Text {
        get => text;
        set {
            if (text == value)
                return;
            text = value;
            // Whole until the next layout pass cuts it to the width.
            label.Text = value;
            InvalidateMeasure();
        }
    }

    /// <summary>
    /// Cut at the start instead of the end: the dots stand in front and the end of the text is kept, as in a path, where the name of the folder
    /// is the part that matters.
    /// </summary>
    public bool FromStart {
        get => fromStart;
        set {
            if (fromStart == value)
                return;
            fromStart = value;
            InvalidateMeasure();
        }
    }

    /// <summary>What is drawn now: the text, or its start with the dots.</summary>
    public string Shown => label.Text ?? "";

    public double FontSize {
        get => label.FontSize;
        set {
            label.FontSize = value;
            InvalidateMeasure();
        }
    }

    public FontWeight FontWeight {
        get => label.FontWeight;
        set {
            label.FontWeight = value;
            InvalidateMeasure();
        }
    }

    public FontFamily FontFamily {
        get => label.FontFamily;
        set {
            label.FontFamily = value;
            InvalidateMeasure();
        }
    }

    public double LineHeight {
        get => label.LineHeight;
        set => label.LineHeight = value;
    }

    public IBrush? Foreground {
        get => label.Foreground;
        set => label.Foreground = value;
    }

    protected override Size MeasureOverride(Size availableSize)
    {
        var shown = Fit(text, availableSize.Width);
        if (label.Text != shown)
            label.Text = shown;
        return base.MeasureOverride(availableSize);
    }

    private string Fit(string whole, double width)
    {
        var font = $"{FontFamily}|{FontWeight}|{FontSize}|{fromStart}";
        var room = double.IsInfinity(width) ? width : Math.Floor(width);
        if (cutText == whole && cutWidth.Equals(room) && cutFont == font)
            return cut;
        cutText = whole;
        cutWidth = room;
        cutFont = font;
        cut = Cut(whole, room);
        return cut;
    }

    private string cut = "";

    private string Cut(string whole, double room)
    {
        if (room <= 0 || double.IsInfinity(room) || Measure(whole) <= room)
            return whole;
        if (fromStart)
            return Tail(whole, room);
        // The ends of the first 0, 1, 2 ... code points.
        var ends = new List<int> {
            0
        };
        foreach (var rune in whole.EnumerateRunes())
            ends.Add(ends[^1] + rune.Utf16SequenceLength);
        var low = 0;
        var high = ends.Count - 2;
        while (low < high) {
            var middle = (low + high + 1) / 2;
            if (Measure(Start(whole, ends[middle])) <= room)
                low = middle;
            else
                high = middle - 1;
        }

        return Start(whole, ends[low]);
    }

    // The longest end of the text that, with the dots in front, fits. The
    // start of the kept part is trimmed of white space, as the end is above.
    private string Tail(string whole, double room)
    {
        var starts = new List<int>();
        var at = 0;
        foreach (var rune in whole.EnumerateRunes()) {
            starts.Add(at);
            at += rune.Utf16SequenceLength;
        }

        starts.Add(whole.Length);
        var count = starts.Count - 1;
        var low = 0;
        var high = count;
        while (low < high) {
            var middle = (low + high + 1) / 2;
            if (Measure(Dots + whole[starts[count - middle]..].TrimStart()) <=
                room)
                low = middle;
            else
                high = middle - 1;
        }

        return Dots + whole[starts[count - low]..].TrimStart();
    }

    private static string Start(string whole, int length)
    {
        return whole[..length].TrimEnd() + Dots;
    }

    private double Measure(string value)
    {
        var layout = new TextLayout(value,
            new Typeface(FontFamily, label.FontStyle, FontWeight), FontSize,
            null);
        return layout.WidthIncludingTrailingWhitespace;
    }
}
