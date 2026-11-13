using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using OhMatrix.Core.Ui.Appearance;
using Xunit;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// The emoji are drawn in colour. Where the platform picks the font for a glyph that no font of the text has, it can pick one that draws the
/// emoji as outlines (fontconfig answers Symbola, and the quick reactions of a message were lines with no colour), so the colour fonts are asked
/// first, for the blocks of the emoji only.
/// </summary>
public class EmojiFontTests {
    private static readonly string[] ColourFonts = [
        "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"
    ];

    // How many pixels of a text are not grey: black text on white has none,
    // an emoji in colour has many.
    private static int Coloured(string text, double size)
    {
        var window = new Window {
            Content = new Border {
                Background = Brushes.White,
                Child = new TextBlock {
                    Text = text,
                    FontSize = size,
                    Foreground = Brushes.Black
                }
            },
            Width = 300,
            Height = 100,
        };
        // The edges of text are drawn in grey: with the colours of the
        // sub-pixels of the screen they would count as colour too.
        TextOptions.SetTextRenderingMode(window, TextRenderingMode.Antialias);
        window.Show();
        window.UpdateLayout();
        using var buffer = window.CaptureRenderedFrame()!.Lock();
        var coloured = 0;
        unsafe {
            var p = (byte*)buffer.Address;
            for (var y = 0; y < buffer.Size.Height; y++) {
                for (var x = 0; x < buffer.Size.Width; x++) {
                    var px = p + y * buffer.RowBytes + x * 4;
                    if (Math.Max(px[0], Math.Max(px[1], px[2])) -
                        Math.Min(px[0], Math.Min(px[1], px[2])) >= 48)
                        coloured++;
                }
            }
        }

        return coloured;
    }

    [AvaloniaFact]
    public void The_colour_fonts_are_asked_for_the_emoji_and_for_nothing_else()
    {
        var fallbacks = Fonts.ManagerOptions.FontFallbacks!;
        Assert.Equal(ColourFonts, fallbacks.Select(f => f.FontFamily.Name));
        foreach (var fallback in fallbacks) {
            var range = fallback.UnicodeRange;
            // A thumb, a face, a heart, a check mark, a flag's letter, a skin
            // tone, the joiner, the variation selector and the keycap.
            foreach (var emoji in new[] {
                         0x1F44D, 0x1F602, 0x2764, 0x2705, 0x1F1E8, 0x1F3FD,
                         0x200D, 0xFE0F, 0x20E3,
                     })
                Assert.True(range.IsInRange(emoji), $"U+{emoji:X4}");
            // Letters, digits, the signs that start a keycap, Latin-1, Greek,
            // Cyrillic and ideographs are for the fonts of the text.
            foreach (var other in new[] {
                         'A', 'z', '5', '#', '*', 'é', 'Ω', 'Ж', '中', 'あ',
                     })
                Assert.False(range.IsInRange(other), $"U+{(int)other:X4}");
        }
    }

    [AvaloniaFact]
    public void An_emoji_is_drawn_in_colour_and_the_letters_beside_it_are_not()
    {
        var installed = Fonts.Installed();
        Assert.SkipUnless(ColourFonts.Any(installed.Contains),
            "no colour emoji font is installed");
        // The text is given no font, so it is drawn in the interface's, as
        // the quick reactions and the picker are.
        Assert.True(Coloured("\U0001F44D", 48) > 200,
            "a thumb with no colour");
        Assert.True(Coloured("Hello \U0001F602 world 123", 32) > 200,
            "a face with no colour");
        Assert.Equal(0, Coloured("Hello world 123", 32));
    }
}
