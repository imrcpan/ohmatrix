using System.Text;
using Avalonia.Controls;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;
using OhMatrix.Core.Ui;
using Xunit;

namespace OhMatrix.Tests.Ui;

public class EllipsisTextTests {
    private static (Window Window, EllipsisText Text) Open(string text,
        double width)
    {
        var label = new EllipsisText {
            Text = text,
            FontSize = 16,
            FontFamily = Fonts.System,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
        };
        var window = new Window {
            Content = new Grid {
                Width = width,
                Children = {
                    label
                }
            },
            Width = 600,
            Height = 100,
        };
        window.Show();
        window.UpdateLayout();
        return (window, label);
    }

    private static double Width(string text)
    {
        return new TextLayout(text,
            new Typeface(Fonts.System, FontStyle.Normal, FontWeight.Normal),
            16, null).WidthIncludingTrailingWhitespace;
    }

    [AvaloniaFact]
    public void Text_that_fits_is_shown_as_it_is()
    {
        var (window, label) = Open("Bob DM", 300);
        try {
            Assert.Equal("Bob DM", label.Shown);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Text_that_does_not_fit_ends_in_three_dots_that_fit()
    {
        var text = "Side Lab: the quick brown fox jumps over the lazy dog";
        var (window, label) = Open(text, 180);
        try {
            var shown = label.Shown;
            Assert.EndsWith("...", shown);
            Assert.DoesNotContain('…', shown);
            Assert.StartsWith(shown[..^3], text);
            Assert.True(Width(shown) <= 180);
            // The most that fits: one more character would not.
            var more = text[..(shown.Length - 3 + 1)].TrimEnd() + "...";
            Assert.True(more == shown || Width(more) > 180);
            Assert.True(label.Bounds.Width <= 180);
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void The_cut_never_leaves_white_space_before_the_dots()
    {
        var text = "aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll";
        foreach (var width in new[] {
                     60.0, 83, 101, 127, 150, 171
                 }) {
            var (window, label) = Open(text, width);
            try {
                Assert.DoesNotContain(" ...", label.Shown);
            } finally {
                window.Close();
            }
        }
    }

    [AvaloniaFact]
    public void A_picture_made_of_two_units_is_not_split()
    {
        var (window, label) = Open(string.Concat(Enumerable.Repeat("😀", 30)),
            100);
        try {
            Assert.EndsWith("...", label.Shown);
            Assert.DoesNotContain(Rune.ReplacementChar,
                label.Shown.EnumerateRunes());
        } finally {
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_wider_place_shows_more_of_the_text_again()
    {
        var text = "The preview of this room is a long line of text";
        var (window, label) = Open(text, 120);
        try {
            var narrow = label.Shown;
            ((Grid)label.Parent!).Width = 600;
            window.UpdateLayout();
            Assert.Equal(text, label.Shown);
            Assert.NotEqual(narrow, label.Shown);
        } finally {
            window.Close();
        }
    }
}
