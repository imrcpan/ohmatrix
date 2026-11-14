using System.Runtime.CompilerServices;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Presenters;
using Avalonia.Headless.XUnit;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;
using Avalonia.Threading;
using Avalonia.VisualTree;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Chat.Messages;
using OhMatrix.Core.Ui.Widgets;
using Xunit;
using Menu = OhMatrix.Core.Ui.Overlays.Menu;
using MenuItem = OhMatrix.Core.Ui.Overlays.MenuItem;

namespace OhMatrix.Tests.Ui;

/// <summary>
/// The fonts of the letters: a Latin letter is drawn in the English font and any other letter in the font of the other scripts, whatever the text
/// is and whoever draws it, and a change of the fonts reaches what is open at once. The pieces are tested on the text itself, the formatter on the
/// runs it hands over, and the drawing on the typefaces that really shape the letters.
/// </summary>
public class ScriptFontTests {
    // ---- the pieces of a text ----

    [Theory]
    [InlineData("", 0, true)]
    [InlineData("Hello", 5, true)]
    [InlineData("123", 3, true)]
    [InlineData("(Hi)", 4, true)]
    [InlineData("中文", 2, false)]
    [InlineData("Hello 中文", 6, true)]
    [InlineData("中文 Hello", 3, false)]
    // What is not a letter goes with the letter before it.
    [InlineData("中文 123, ok", 8, false)]
    [InlineData("ok 123, 中文", 8, true)]
    // At the start it goes with the first letter after it.
    [InlineData("123 中文", 6, false)]
    [InlineData("(中文)", 4, false)]
    // The scripts that are not Latin.
    [InlineData("Привет мир", 10, false)]
    [InlineData("Γειά σου", 8, false)]
    [InlineData("مرحبا", 5, false)]
    [InlineData("שלום", 4, false)]
    [InlineData("สวัสดี", 6, false)]
    [InlineData("안녕하세요", 5, false)]
    [InlineData("こんにちは", 5, false)]
    [InlineData("カタカナ", 4, false)]
    [InlineData("हिन्दी", 6, false)]
    // The letters that are Latin: accented, extended, phonetic, ligatures.
    [InlineData("éñü ß ł ø", 9, true)]
    [InlineData("Việt Nam", 8, true)]
    [InlineData("ǆ ɐ ǝ ﬁ", 7, true)]
    [InlineData("ª º", 3, true)]
    // The full-width letters belong to the East Asian fonts.
    [InlineData("Ａ", 1, false)]
    // A picture and a mark go with the letter before them.
    [InlineData("a😀中", 3, true)]
    [InlineData("é中", 2, true)]
    [InlineData("中́a", 2, false)]
    public void A_piece_runs_to_the_first_letter_of_the_other_kind(string text,
        int length, bool english)
    {
        var piece = Fonts.Piece(text);
        Assert.Equal((length, english), piece);
    }

    [Fact]
    public void The_pieces_of_a_text_are_the_text_and_alternate()
    {
        const string text =
            "Hello 世界 world ñ Привет 123 ok 😀 中文, done. Ελλάδα (x) 日本語!";
        var rest = text;
        bool? before = null;
        var pieces = new List<string>();
        while (rest.Length > 0) {
            var (length, english) = Fonts.Piece(rest);
            Assert.True(length > 0, $"no piece at [{rest}]");
            // Two pieces side by side are not of the same kind; else they
            // would have been one.
            Assert.NotEqual(before, english);
            before = english;
            pieces.Add(rest[..length]);
            rest = rest[length..];
        }

        Assert.Equal(text, string.Concat(pieces));
        Assert.Equal(
        [
            "Hello ", "世界 ", "world ñ ", "Привет 123 ", "ok 😀 ",
            "中文, ", "done. ", "Ελλάδα (", "x) ", "日本語!"
        ], pieces);
    }

    // ---- the fonts that are made of the preferences ----

    [Fact]
    public void The_fonts_follow_the_general_font_until_they_are_chosen()
    {
        try {
            Fonts.Use(new Preferences {
                Font = "General"
            });
            Assert.Equal("General", Fonts.English.FamilyNames[0]);
            Assert.Equal("General", Fonts.Other.FamilyNames[0]);

            Fonts.Use(new Preferences {
                Font = "General",
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            Assert.Equal(["Latin", "General"],
                Fonts.English.FamilyNames.Take(2));
            Assert.Equal(["Han", "General"], Fonts.Other.FamilyNames.Take(2));

            // An empty name is the system's own: no general font is behind it.
            Fonts.Use(new Preferences {
                Font = "General",
                OtherFont = ""
            });
            Assert.Equal("General", Fonts.English.FamilyNames[0]);
            Assert.DoesNotContain("General", Fonts.Other.FamilyNames);
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void
        The_family_of_the_interface_is_marked_and_new_when_the_fonts_change()
    {
        try {
            Fonts.Use(new Preferences());
            var first = Fonts.System;
            Assert.True(Fonts.IsUi(first));

            // The same preferences are the same family.
            Fonts.Use(new Preferences());
            Assert.Same(first, Fonts.System);

            Fonts.Use(new Preferences {
                OtherFont = "Han"
            });
            Assert.NotEqual(first, Fonts.System);
            // The family of before is still the interface's, so that a text
            // that holds it is drawn by letters when it is laid out again.
            Assert.True(Fonts.IsUi(first));
            Assert.True(Fonts.IsUi(Fonts.System));

            // The same two fonts the other way round are a change too, though
            // the names are the same.
            var one = new Preferences {
                EnglishFont = "A",
                OtherFont = "B"
            };
            Fonts.Use(one);
            var ab = Fonts.System;
            Fonts.Use(one with {
                EnglishFont = "B",
                OtherFont = "A"
            });
            Assert.NotEqual(ab, Fonts.System);
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void The_version_changes_with_each_font_and_weight_that_changes()
    {
        try {
            Fonts.Use(new Preferences());
            var version = Fonts.Version;
            Fonts.Use(new Preferences());
            Assert.Equal(version, Fonts.Version);
            Fonts.Use(new Preferences {
                Theme = "dark"
            });
            Assert.Equal(version, Fonts.Version);
            foreach (var change in new Func<Preferences, Preferences>[] {
                         p => p with {
                             Font = "A"
                         },
                         p => p with {
                             EnglishFont = "B"
                         },
                         p => p with {
                             OtherFont = "C"
                         },
                         p => p with {
                             MonoFont = "D"
                         },
                         p => p with {
                             LightWeight = 200
                         },
                         p => p with {
                             NormalWeight = 500
                         },
                         p => p with {
                             BoldWeight = 900
                         },
                     }) {
                Fonts.Use(new Preferences());
                version = Fonts.Version;
                Fonts.Use(change(new Preferences()));
                Assert.NotEqual(version, Fonts.Version);
            }
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void A_font_that_is_not_the_interfaces_is_not_cut_by_letters()
    {
        Assert.False(Fonts.IsUi(Fonts.Mono));
        Assert.False(Fonts.IsUi(new FontFamily("Serif")));
        Assert.False(Fonts.IsUi(FontFamily.Default));
        Assert.False(Fonts.IsUi(Fonts.English));
        Assert.False(Fonts.IsUi(Fonts.Other));
    }

    [Fact]
    public void Differs_tells_the_fonts_and_the_weights_from_the_rest()
    {
        var p = new Preferences();
        Assert.False(Fonts.Differs(p, p with {
            Theme = "dark"
        }));
        Assert.True(Fonts.Differs(p, p with {
            Font = "x"
        }));
        Assert.True(Fonts.Differs(p, p with {
            EnglishFont = "x"
        }));
        Assert.True(Fonts.Differs(p, p with {
            OtherFont = "x"
        }));
        Assert.True(Fonts.Differs(p, p with {
            MonoFont = "x"
        }));
        Assert.True(Fonts.Differs(p, p with {
            BoldWeight = 600
        }));
        Assert.True(Fonts.Differs(p, p with {
            NormalWeight = 500
        }));
        Assert.True(Fonts.Differs(p, p with {
            LightWeight = 200
        }));
    }

    // ---- what the formatter hands over ----

    // A formatter that only reads the runs it is given.
    private sealed class Recorder : TextFormatter {
        public readonly List<(string Text, string Family, double Size,
            FontWeight Weight, IBrush? Ink)> Runs =
            [];

        public override TextLine? FormatLine(ITextSource textSource,
            int firstTextSourceIndex, double paragraphWidth,
            TextParagraphProperties paragraphProperties,
            TextLineBreak? previousLineBreak = null)
        {
            var at = firstTextSourceIndex;
            var run = textSource.GetTextRun(at);
            while (run != null) {
                if (run is TextCharacters c)
                    Runs.Add((c.Text.ToString(),
                        c.Properties.Typeface.FontFamily.FamilyNames[0],
                        c.Properties.FontRenderingEmSize,
                        c.Properties.Typeface.Weight,
                        c.Properties.ForegroundBrush));
                else
                    Runs.Add(("<" + run.GetType().Name + ">", "", 0,
                        FontWeight.Normal, null));
                at += run.Length;
                run = textSource.GetTextRun(at);
            }

            return null;
        }
    }

    // A text of one run, as the text of a text block is.
    private sealed class Whole(string text, TextRunProperties properties)
        : ITextSource {
        public Avalonia.Media.TextFormatting.TextRun? GetTextRun(
            int textSourceIndex)
        {
            return textSourceIndex < text.Length
                ? new TextCharacters(text.AsMemory(textSourceIndex), properties)
                : null;
        }
    }

    private static List<(string Text, string Family)> Pieces(string text,
        FontFamily family, double size = 14,
        FontWeight weight = FontWeight.Normal, IBrush? ink = null)
    {
        var recorder = new Recorder();
        var formatter = new ScriptTextFormatter(recorder);
        var properties = new GenericTextRunProperties(
            new Typeface(family, FontStyle.Normal, weight), size, null, ink);
        formatter.FormatLine(new Whole(text, properties), 0, 100, null!);
        return recorder.Runs.Select(r => (r.Text, r.Family)).ToList();
    }

    [Fact]
    public void The_text_of_the_interface_is_handed_over_piece_by_piece()
    {
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            Assert.Equal(
                [("Hello ", "Latin"), ("中文 ", "Han"), ("world", "Latin")],
                Pieces("Hello 中文 world", Fonts.System));
            Assert.Equal([("Привет", "Han")],
                Pieces("Привет", Fonts.System));
            Assert.Equal([("only latin", "Latin")],
                Pieces("only latin", Fonts.System));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void
        The_other_font_comes_first_though_the_english_font_has_the_letter()
    {
        // Both of them could draw the Chinese; the other font is the one
        // chosen for it, so it is the one that draws it.
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Wide",
                OtherFont = "Han"
            });
            var pieces = Pieces("abc 汉字 def", Fonts.System);
            Assert.Equal("Wide", pieces[0].Family);
            Assert.Equal("Han", pieces[1].Family);
            Assert.Equal("Wide", pieces[2].Family);
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void The_general_font_stands_behind_both_when_they_are_not_chosen()
    {
        try {
            Fonts.Use(new Preferences {
                Font = "General",
                OtherFont = "Han"
            });
            var pieces = Pieces("abc 汉字 def", Fonts.System);
            Assert.Equal("General", pieces[0].Family);
            Assert.Equal("Han", pieces[1].Family);
            Assert.Equal(["Han", "General"],
                Fonts.Other.FamilyNames.Take(2));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void A_text_with_a_font_of_its_own_is_left_as_it_is()
    {
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            Assert.Equal([("Hello 中文", Fonts.Mono.FamilyNames[0])],
                Pieces("Hello 中文", Fonts.Mono));
            Assert.Equal([("Hello 中文", "Serif")],
                Pieces("Hello 中文", new FontFamily("Serif")));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void A_family_from_before_a_change_is_drawn_with_the_fonts_of_now()
    {
        try {
            Fonts.Use(new Preferences());
            var old = Fonts.System;
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            Assert.Equal([("Hi ", "Latin"), ("中", "Han")],
                Pieces("Hi 中", old));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void The_pieces_keep_the_size_the_weight_and_the_colour()
    {
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            var recorder = new Recorder();
            var formatter = new ScriptTextFormatter(recorder);
            var ink = new SolidColorBrush(Colors.Crimson);
            var properties = new GenericTextRunProperties(
                new Typeface(Fonts.System, FontStyle.Italic, FontWeight.Bold),
                21, null, ink);
            formatter.FormatLine(new Whole("a 中 b", properties), 0, 100,
                null!);
            Assert.Equal(3, recorder.Runs.Count);
            Assert.All(recorder.Runs, r => {
                Assert.Equal(21, r.Size);
                Assert.Equal(FontWeight.Bold, r.Weight);
                Assert.Same(ink, r.Ink);
            });
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void The_formatter_goes_on_from_where_the_text_is_asked_for()
    {
        // A line that starts in the middle of the text, as the second line
        // of a wrapped text does, is cut as the rest of the text is.
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            var recorder = new Recorder();
            var formatter = new ScriptTextFormatter(recorder);
            var properties = new GenericTextRunProperties(
                new Typeface(Fonts.System), 14);
            formatter.FormatLine(new Whole("abc 汉字 def", properties), 4, 100,
                null!);
            Assert.Equal([("汉字 ", "Han"), ("def", "Latin")],
                recorder.Runs.Select(r => (r.Text, r.Family)));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    // The weights the first run of a text is handed over in.
    private static FontWeight Drawn(string text, FontFamily family,
        FontWeight asked)
    {
        var recorder = new Recorder();
        var formatter = new ScriptTextFormatter(recorder);
        var properties = new GenericTextRunProperties(
            new Typeface(family, FontStyle.Normal, asked), 14);
        formatter.FormatLine(new Whole(text, properties), 0, 100, null!);
        return recorder.Runs[0].Weight;
    }

    [Fact]
    public void A_text_is_drawn_in_the_weight_chosen_for_the_kind_it_asks_for()
    {
        try {
            Fonts.Use(new Preferences {
                LightWeight = 200,
                NormalWeight = 500,
                BoldWeight = 800
            });
            // The interface's text, code and a text with a font of its own
            // are all drawn in the chosen weights.
            foreach (var family in new[] {
                         Fonts.System, Fonts.Mono, new FontFamily("Serif")
                     }) {
                foreach (var (asked, drawn) in new[] {
                             (100, 200), (300, 200), (350, 200), (351, 500),
                             (400, 500), (500, 500), (550, 500), (551, 800),
                             (600, 800), (700, 800), (900, 800)
                         }) {
                    Assert.Equal((FontWeight)drawn,
                        Drawn("Hello", family, (FontWeight)asked));
                }
            }

            Assert.Equal((FontWeight)200, Fonts.Drawn(Fonts.Light));
            Assert.Equal((FontWeight)500, Fonts.Drawn(Fonts.Normal));
            Assert.Equal((FontWeight)800, Fonts.Drawn(Fonts.Bold));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void Texts_are_drawn_in_the_usual_weights_until_others_are_chosen()
    {
        Fonts.Use(new Preferences());
        Assert.Equal(FontWeight.Light, Fonts.Drawn(Fonts.Light));
        Assert.Equal(FontWeight.Normal, Fonts.Drawn(Fonts.Normal));
        Assert.Equal(FontWeight.Bold, Fonts.Drawn(Fonts.Bold));
        // The weights in between go to the kind they are nearest to.
        Assert.Equal(FontWeight.Normal, Fonts.Drawn(FontWeight.Medium));
        Assert.Equal(FontWeight.Bold, Fonts.Drawn(FontWeight.SemiBold));
        Assert.Equal(FontWeight.Light, Fonts.Drawn(FontWeight.Thin));
        Assert.Equal(FontWeight.Bold, Fonts.Drawn(FontWeight.Black));
    }

    [Fact]
    public void A_piece_has_both_its_font_and_its_weight()
    {
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han",
                BoldWeight = 900
            });
            var recorder = new Recorder();
            var formatter = new ScriptTextFormatter(recorder);
            var properties = new GenericTextRunProperties(
                new Typeface(Fonts.System, FontStyle.Normal, FontWeight.Bold),
                14);
            formatter.FormatLine(new Whole("a 中 b", properties), 0, 100,
                null!);
            Assert.Equal(
                [
                    ("a ", "Latin", (FontWeight)900),
                    ("中 ", "Han", (FontWeight)900),
                    ("b", "Latin", (FontWeight)900)
                ],
                recorder.Runs.Select(r => (r.Text, r.Family, r.Weight)));
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    // ---- what it costs ----

    // A formatter that goes through all the runs of a text and keeps none.
    private sealed class Walk : TextFormatter {
        public override TextLine? FormatLine(ITextSource textSource,
            int firstTextSourceIndex, double paragraphWidth,
            TextParagraphProperties paragraphProperties,
            TextLineBreak? previousLineBreak = null)
        {
            var at = firstTextSourceIndex;
            var run = textSource.GetTextRun(at);
            while (run != null) {
                at += run.Length;
                run = textSource.GetTextRun(at);
            }

            return null;
        }
    }

    // A text of one run that counts how many times it is asked for it.
    private sealed class Counted(string text, TextRunProperties properties)
        : ITextSource {
        public int Asked;

        public Avalonia.Media.TextFormatting.TextRun? GetTextRun(
            int textSourceIndex)
        {
            Asked++;
            return textSourceIndex < text.Length
                ? new TextCharacters(text.AsMemory(textSourceIndex), properties)
                : null;
        }
    }

    // Bytes allocated by one call of work, over many calls, after the calls
    // that warm it up.
    private static long PerCall(Action work, int rounds = 500)
    {
        for (var i = 0; i < 50; i++)
            work();
        var before = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < rounds; i++)
            work();
        return (GC.GetAllocatedBytesForCurrentThread() - before) / rounds;
    }

    [Fact]
    public void Cutting_a_text_into_pieces_allocates_nothing()
    {
        var text = string.Concat(Enumerable.Repeat(
            "Hello 世界 world ñ Привет 123 ok 😀 中文, done. Ελλάδα ", 40));
        var bytes = PerCall(() => {
            var rest = text.AsSpan();
            while (rest.Length > 0) {
                var (length, _) = Fonts.Piece(rest);
                rest = rest[length..];
            }
        });
        Assert.Equal(0, bytes);
    }

    [Fact]
    public void Telling_the_family_and_the_weight_allocates_nothing()
    {
        var family = Fonts.System;
        var bytes = PerCall(() => {
            for (var i = 0; i < 100; i++) {
                Assert.True(Fonts.IsUi(family));
                _ = Fonts.Drawn(FontWeight.Bold);
            }
        });
        Assert.Equal(0, bytes);
    }

    [Fact]
    public void A_run_costs_a_few_objects_to_hand_over()
    {
        try {
            Fonts.Use(new Preferences {
                EnglishFont = "Latin",
                OtherFont = "Han"
            });
            var formatter = new ScriptTextFormatter(new Walk());

            long Cost(string text, FontFamily family)
            {
                var properties = new GenericTextRunProperties(
                    new Typeface(family), 14);
                var source = new Whole(text, properties);
                return PerCall(() =>
                    formatter.FormatLine(source, 0, 100, null!));
            }

            // The source's own run is 40 bytes; the line gets the wrapper
            // of the source, one run and one set of properties.
            Assert.InRange(Cost("Hello world", Fonts.System), 0, 224);
            Assert.InRange(Cost("你好世界", Fonts.System), 0, 224);
            // A text with a font of its own, in the weight it asks for: the
            // wrapper and the run.
            Assert.InRange(Cost("Hello world", Fonts.Mono), 0, 112);

            // A hundred pieces share the properties of the text they come
            // from: each one costs its run, and the run the source made.
            var many = string.Concat(Enumerable.Repeat("Hello 中文 ", 50));
            var pieces = 0;
            for (var rest = many.AsSpan();
                 rest.Length > 0;
                 rest = rest[Fonts.Piece(rest).Length..])
                pieces++;
            Assert.Equal(100, pieces);
            Assert.InRange(Cost(many, Fonts.System), 0, 224 + pieces * 128);
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    [Fact]
    public void A_text_is_asked_for_once_for_each_of_its_pieces()
    {
        // Not once for each piece and each piece before it: the work of
        // cutting a long text is as long as the text.
        var many = string.Concat(Enumerable.Repeat("Hello 中文 ", 2000));
        var properties = new GenericTextRunProperties(
            new Typeface(Fonts.System), 14);
        var source = new Counted(many, properties);
        new ScriptTextFormatter(new Walk()).FormatLine(source, 0, 100, null!);
        Assert.Equal(4000 + 1, source.Asked);
    }

    // ---- what is drawn, with the fonts of the machine ----

    private static bool Has(string font, int letter)
    {
        return FontManager.Current.TryGetGlyphTypeface(new Typeface(font),
                   out var glyphs) && glyphs.FamilyName == font &&
               glyphs.CharacterToGlyphMap.TryGetGlyph(letter, out _);
    }

    // The installed fonts that draw both the Latin and the Chinese letters,
    // and those that draw only the Latin ones.
    internal static (List<string> Wide, List<string> Narrow) Installed() =>
        installed.Value;

    private static readonly Lazy<(List<string>, List<string>)> installed =
        new(Find);

    private static (List<string> Wide, List<string> Narrow) Find()
    {
        var all = Fonts.Installed()
            .Where(n => !n.Contains(',') && Has(n, 'A') && Has(n, 'z'))
            .ToList();
        return (all.Where(n => Has(n, '中') && Has(n, '字')).ToList(),
            all.Where(n => !Has(n, '中') && !n.Contains("Emoji")).ToList());
    }

    // The name of the typeface that draws the font, as the letters are
    // said to be drawn by it.
    internal static string Drawn(string font)
    {
        Assert.True(FontManager.Current.TryGetGlyphTypeface(
            new Typeface(font), out var glyphs));
        return glyphs.FamilyName;
    }

    // Each letter of a laid out text with the typeface that draws it.
    internal static List<(char Letter, string Font)> Letters(
        TextLayout layout)
    {
        var letters = new List<(char, string)>();
        foreach (var line in layout.TextLines) {
            foreach (var run in line.TextRuns.OfType<ShapedTextRun>()) {
                foreach (var letter in run.Text.ToString())
                    if (!char.IsWhiteSpace(letter))
                        letters.Add((letter, run.GlyphRun.GlyphTypeface
                            .FamilyName));
            }
        }

        return letters;
    }

    private static Window Open(Control content)
    {
        var window = new Window {
            Content = content,
            Width = 500,
            Height = 300
        };
        ThemeScope.SetColors(window, Themes.Get("light")!.Colors);
        window.Show();
        Dispatcher.UIThread.RunJobs();
        window.UpdateLayout();
        return window;
    }

    private static void AssertDrawn(TextLayout layout, string latin,
        string han, string latinLetters = "Helloworld",
        string hanLetters = "中文汉字")
    {
        var letters = Letters(layout);
        Assert.NotEmpty(letters);
        foreach (var (letter, font) in letters) {
            if (latinLetters.Contains(letter))
                Assert.True(Drawn(latin) == font,
                    $"[{letter}] is drawn in {font}, not in {latin}");
            else if (hanLetters.Contains(letter))
                Assert.True(Drawn(han) == font,
                    $"[{letter}] is drawn in {font}, not in {han}");
        }
    }

    private static (string One, string Other) TwoWide()
    {
        var (wide, _) = Installed();
        if (wide.Count < 2)
            Assert.Skip("Two fonts that draw Latin and Chinese are needed.");
        return (wide[0], wide[1]);
    }

    [AvaloniaFact]
    public void A_text_that_is_given_no_font_is_drawn_letter_by_letter()
    {
        var (one, two) = TwoWide();
        var block = new TextBlock {
            Text = "Hello 中文 world",
            FontSize = 18
        };
        var window = Open(block);
        try {
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two
            });
            window.UpdateLayout();
            // Both fonts could draw all of it; each letter has the font that
            // is chosen for its script.
            AssertDrawn(block.TextLayout, one, two);
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void
        The_other_font_is_the_first_choice_for_a_letter_that_is_not_latin()
    {
        var (one, two) = TwoWide();
        var block = new TextBlock {
            Text = "中文 Hello 汉字 world",
            FontSize = 18
        };
        var window = Open(block);
        try {
            // Swapped: the one that came first draws the Chinese now.
            Fonts.Use(new Preferences {
                EnglishFont = two,
                OtherFont = one
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, two, one);
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, one, two);
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void The_general_font_draws_both_until_the_others_are_chosen()
    {
        var (one, two) = TwoWide();
        var block = new TextBlock {
            Text = "Hello 中文",
            FontSize = 18
        };
        var window = Open(block);
        try {
            Fonts.Use(new Preferences {
                Font = one
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, one, one);
            // The other font is chosen: the Chinese is drawn in it, and the
            // Latin stays with the general font.
            Fonts.Use(new Preferences {
                Font = one,
                OtherFont = two
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, one, two);
            // The English font is chosen too.
            Fonts.Use(new Preferences {
                Font = one,
                EnglishFont = two,
                OtherFont = one
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, two, one);
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_font_that_cannot_draw_a_letter_gives_it_to_the_one_that_can()
    {
        var (wide, narrow) = Installed();
        if (wide.Count < 1 || narrow.Count < 1)
            Assert.Skip("A font without Chinese letters is needed.");
        var block = new TextBlock {
            Text = "Hello 中文",
            FontSize = 18
        };
        var window = Open(block);
        try {
            // The other font is one that has no Chinese: the Chinese is
            // still drawn, by the general font and the system behind it.
            Fonts.Use(new Preferences {
                Font = wide[0],
                OtherFont = narrow[0]
            });
            window.UpdateLayout();
            var letters = Letters(block.TextLayout);
            // The Chinese is drawn by the general font, which is behind the
            // other font, and the Latin letters by the English font, which
            // is the general font too.
            Assert.All(letters, l => Assert.Equal(Drawn(wide[0]), l.Font));
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_change_of_the_fonts_reaches_every_text_that_is_open()
    {
        var (one, two) = TwoWide();
        var text = "Hello 中文 world";
        var plain = new TextBlock {
            Text = text
        };
        var button = new Button {
            Content = text
        };
        var ellipsis = new EllipsisText {
            Text = text,
            FontSize = 16,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left
        };
        var box = new TextBox {
            Text = text
        };
        var nested = new Border {
            Child = new StackPanel {
                Children = {
                    new Border {
                        Child = new TextBlock {
                            Text = text
                        }
                    }
                }
            }
        };
        var grid = new StackPanel {
            Children = {
                plain,
                button,
                ellipsis,
                box,
                nested
            }
        };
        var window = Open(grid);
        try {
            foreach (var (english, other) in new[] {
                         (one, two), (two, one), (one, one)
                     }) {
                Fonts.Use(new Preferences {
                    EnglishFont = english,
                    OtherFont = other
                });
                window.UpdateLayout();
                var all = grid.GetVisualDescendants().OfType<TextBlock>()
                    .Where(t => t.Text == text).ToList();
                Assert.True(all.Count >= 4,
                    $"{all.Count} texts have it, for {english}/{other}");
                foreach (var t in all)
                    AssertDrawn(t.TextLayout, english, other);
                var presenter = box.GetVisualDescendants()
                    .OfType<TextPresenter>().Single();
                AssertDrawn(presenter.TextLayout, english, other);
            }
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_menu_and_a_tip_are_drawn_by_letters_too()
    {
        var (one, two) = TwoWide();
        var anchor = new Border {
            Width = 100,
            Height = 30,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left,
            VerticalAlignment = Avalonia.Layout.VerticalAlignment.Top
        };
        var window = Open(anchor);
        var menu = new Menu();
        try {
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two
            });
            menu.Show(anchor, window, [
                new MenuItem("Hello 中文 world", () => {
                })
            ]);
            window.UpdateLayout();
            var label = menu.Surface.GetVisualDescendants()
                .OfType<TextBlock>().Single(t => t.Text == "Hello 中文 world");
            AssertDrawn(label.TextLayout, one, two);

            // The menu is open when the fonts change.
            Fonts.Use(new Preferences {
                EnglishFont = two,
                OtherFont = one
            });
            window.UpdateLayout();
            AssertDrawn(label.TextLayout, two, one);
        } finally {
            menu.Close();
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void The_text_of_a_bubble_is_drawn_by_letters_and_follows_a_change()
    {
        var (one, two) = TwoWide();
        var bubble = new Bubble(Themes.Get("light")!.Colors,
            "Hello 中文 world, 你好 and more", "12:30", false);
        bubble.MaxWidth = 360;
        var window = Open(new StackPanel {
            Children = {
                bubble
            }
        });
        try {
            var body = bubble.GetVisualDescendants()
                .OfType<SelectableTextBlock>().Single();
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two
            });
            window.UpdateLayout();
            AssertDrawn(body.TextLayout, one, two, "Helloworldandmore",
                "中文你好");
            Fonts.Use(new Preferences {
                EnglishFont = two,
                OtherFont = one
            });
            window.UpdateLayout();
            AssertDrawn(body.TextLayout, two, one, "Helloworldandmore",
                "中文你好");
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    // Two installed fonts that draw the Latin letters, for the monospaced
    // font.
    private static (string One, string Two) TwoLatin()
    {
        var (wide, narrow) = Installed();
        var all = wide.Concat(narrow).ToList();
        if (all.Count < 2)
            Assert.Skip("Two fonts that draw Latin letters are needed.");
        return (all[0], all[1]);
    }

    [AvaloniaFact]
    public void Code_follows_the_mono_font_and_not_the_others()
    {
        var (one, two) = TwoLatin();
        var (wideOne, wideTwo) = TwoWide();
        var code = new TextBlock {
            Text = "Hello world",
            FontSize = 18
        };
        Fonts.Code(code);
        var window = Open(code);
        try {
            Fonts.Use(new Preferences());
            window.UpdateLayout();
            var before = Letters(code.TextLayout);
            // The English and the other fonts are not the font of code.
            Fonts.Use(new Preferences {
                Font = wideOne,
                EnglishFont = wideOne,
                OtherFont = wideTwo
            });
            window.UpdateLayout();
            Assert.Equal(before, Letters(code.TextLayout));
            // The mono font is, and it is followed as it is chosen again,
            // with no one telling the text.
            foreach (var font in new[] {
                         one, two, one
                     }) {
                Fonts.Use(new Preferences {
                    MonoFont = font
                });
                window.UpdateLayout();
                Assert.All(Letters(code.TextLayout),
                    l => Assert.Equal(Drawn(font), l.Font));
            }

            Fonts.Use(new Preferences());
            window.UpdateLayout();
            Assert.Equal(before, Letters(code.TextLayout));
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void Code_is_not_cut_by_letters_whatever_the_fonts_are()
    {
        var (one, two) = TwoWide();
        var code = new TextBlock {
            Text = "Hello 中文",
            FontSize = 18
        };
        Fonts.Code(code);
        var window = Open(code);
        try {
            Fonts.Use(new Preferences {
                MonoFont = one,
                EnglishFont = two,
                OtherFont = two
            });
            window.UpdateLayout();
            // Both of the mono font's letters are in the one font, which has
            // them; the other fonts did not take any of them.
            Assert.All(Letters(code.TextLayout),
                l => Assert.Equal(Drawn(one), l.Font));
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void
        Code_in_a_bubble_follows_the_mono_font_without_being_made_again()
    {
        var (one, two) = TwoLatin();
        var bubble = new Bubble(Themes.Get("light")!.Colors,
            "Hello xyzq world", "12:30", false,
            formatted: "Hello <code>xyzq</code> world");
        bubble.MaxWidth = 360;
        var window = Open(new StackPanel {
            Children = {
                bubble
            }
        });
        try {
            var body = bubble.GetVisualDescendants()
                .OfType<SelectableTextBlock>().Single();
            var inlines = body.Inlines!.ToArray();
            Assert.Contains(inlines, i => i is Avalonia.Controls.Documents.Run {
                Text: "xyzq"
            });
            foreach (var font in new[] {
                         one, two, one
                     }) {
                Fonts.Use(new Preferences {
                    MonoFont = font
                });
                window.UpdateLayout();
                var code = Letters(body.TextLayout)
                    .Where(l => "xyzq".Contains(l.Letter)).ToList();
                Assert.Equal(4, code.Count);
                Assert.All(code, l => Assert.Equal(Drawn(font), l.Font));
                // The same runs are in the text: it was told nothing.
                Assert.Equal(inlines, body.Inlines!.ToArray());
            }
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void
        A_text_that_holds_an_old_family_is_drawn_with_the_new_fonts_when_laid_out()
    {
        var (one, two) = TwoWide();
        var old = Fonts.System;
        var block = new TextBlock {
            Text = "Hello 中文",
            FontFamily = old,
            FontSize = 18
        };
        var window = Open(block);
        try {
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two
            });
            // Nothing told the text, which keeps the family it was given;
            // it is drawn by the fonts of now at its next layout.
            block.Text = "Hello 中文 ";
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, one, two);
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void The_default_font_of_the_app_is_the_family_of_the_interface()
    {
        try {
            Fonts.Use(new Preferences {
                OtherFont = "Han"
            });
            Assert.Same(Fonts.System,
                Application.Current!.Resources[
                    "ContentControlThemeFontFamily"]);
            var block = new TextBlock {
                Text = "x"
            };
            var window = Open(block);
            try {
                Assert.Same(Fonts.System, block.FontFamily);
                Fonts.Use(new Preferences {
                    OtherFont = "Wide"
                });
                window.UpdateLayout();
                Assert.Same(Fonts.System, block.FontFamily);
            } finally {
                window.Close();
            }
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    // The weight a laid out text draws the first run that has the piece in.
    internal static FontWeight WeightOf(TextLayout layout, string piece)
    {
        return layout.TextLines
            .SelectMany(l => l.TextRuns.OfType<ShapedTextRun>())
            .First(r => r.Text.ToString().Contains(piece)).Properties
            .Typeface.Weight;
    }

    [AvaloniaFact]
    public void Texts_are_drawn_in_the_chosen_weights_and_follow_a_change()
    {
        var light = new TextBlock {
            Text = "lightword",
            FontWeight = Fonts.Light
        };
        var normal = new TextBlock {
            Text = "normalword",
            FontWeight = Fonts.Normal
        };
        var bold = new TextBlock {
            Text = "boldword",
            FontWeight = Fonts.Bold
        };
        var plain = new TextBlock {
            Text = "plainword"
        };
        var ellipsis = new EllipsisText {
            Text = "ellipsisword",
            FontWeight = Fonts.Bold,
            FontSize = 16,
            HorizontalAlignment = Avalonia.Layout.HorizontalAlignment.Left
        };
        var button = new Button {
            Content = "buttonword"
        };
        var code = new TextBlock {
            Text = "codeword",
            FontWeight = Fonts.Bold
        };
        Fonts.Code(code);
        var bubble = new Bubble(Themes.Get("light")!.Colors,
            "plain strongword", "12:30", false,
            formatted: "plain <b>strongword</b>");
        bubble.MaxWidth = 360;
        var window = Open(new StackPanel {
            Children = {
                light,
                normal,
                bold,
                plain,
                ellipsis,
                button,
                code,
                bubble
            }
        });
        try {
            var body = bubble.GetVisualDescendants()
                .OfType<SelectableTextBlock>().Single();
            var label = ellipsis.GetVisualDescendants().OfType<TextBlock>()
                .Single();
            var pressed = button.GetVisualDescendants().OfType<TextBlock>()
                .Single(t => t.Text == "buttonword");
            foreach (var (l, n, b) in new[] {
                         (200, 500, 800), (100, 400, 900), (300, 400, 700),
                         (250, 450, 650)
                     }) {
                Fonts.Use(new Preferences {
                    LightWeight = l,
                    NormalWeight = n,
                    BoldWeight = b
                });
                window.UpdateLayout();
                var weights = new (string, TextLayout, int)[] {
                    ("lightword", light.TextLayout, l),
                    ("normalword", normal.TextLayout, n),
                    ("boldword", bold.TextLayout, b),
                    ("plainword", plain.TextLayout, n),
                    ("ellipsisword", label.TextLayout, b),
                    ("buttonword", pressed.TextLayout, n),
                    ("codeword", code.TextLayout, b),
                    ("strongword", body.TextLayout, b),
                    ("plain", body.TextLayout, n),
                };
                foreach (var (piece, layout, weight) in weights)
                    Assert.True((FontWeight)weight == WeightOf(layout, piece),
                        $"[{piece}] is drawn in {WeightOf(layout, piece)}, not {weight} for {l}/{n}/{b}");
            }
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [AvaloniaFact]
    public void A_weight_is_not_a_change_of_the_letters_fonts()
    {
        var (one, two) = TwoWide();
        var block = new TextBlock {
            Text = "Hello 中文",
            FontSize = 18,
            FontWeight = Fonts.Bold
        };
        var window = Open(block);
        try {
            Fonts.Use(new Preferences {
                EnglishFont = one,
                OtherFont = two,
                BoldWeight = 900
            });
            window.UpdateLayout();
            AssertDrawn(block.TextLayout, one, two);
            Assert.Equal((FontWeight)900, WeightOf(block.TextLayout, "Hello"));
            Assert.Equal((FontWeight)900, WeightOf(block.TextLayout, "中文"));
        } finally {
            Fonts.Use(new Preferences());
            window.Close();
        }
    }

    [System.Runtime.CompilerServices.MethodImpl(
        System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static WeakReference[] Shown(Window window, StackPanel panel)
    {
        var blocks = new List<TextBlock>();
        for (var i = 0; i < 20; i++) {
            var block = new TextBlock {
                Text = "code " + i
            };
            Fonts.Code(block);
            blocks.Add(block);
            panel.Children.Add(block);
        }

        window.UpdateLayout();
        return blocks.Select(b => new WeakReference(b)).ToArray();
    }

    [AvaloniaFact]
    public void Code_is_not_kept_by_the_font_when_its_window_is_gone()
    {
        // The window may hold on to a text that was taken out of it for a
        // while; what must not is the font, which lives as long as the app.
        var panel = new StackPanel();
        var window = Open(panel);
        try {
            var weak = Shown(window, panel);
            Fonts.Use(new Preferences {
                MonoFont = "Some"
            });
            window.UpdateLayout();
            panel.Children.Clear();
            window.Close();
            window.Content = null;
            for (var i = 0; i < 5; i++) {
                GC.Collect();
                GC.WaitForPendingFinalizers();
                Dispatcher.UIThread.RunJobs();
            }

            Assert.All(weak, w => Assert.False(w.IsAlive));
            // A change of the font after they are gone is no trouble.
            Fonts.Use(new Preferences {
                MonoFont = "Other"
            });
        } finally {
            Fonts.Use(new Preferences());
        }
    }

    // ---- nothing is told a font ----

    private static string Source([CallerFilePath] string here = "")
    {
        var path = Path.GetFullPath(Path.Combine(
            Path.GetDirectoryName(here)!, "..", "..", "OhMatrix.Core"));
        if (!Directory.Exists(path))
            Assert.Skip("The sources are not where they were built.");
        return path;
    }

    // A weight that is a number or a name: texts ask for Fonts.Light,
    // Fonts.Normal or Fonts.Bold, and never for a weight of their own.
    private static readonly System.Text.RegularExpressions.Regex Weighed =
        new(
            @"FontWeight\.(Thin|ExtraLight|Light|Normal|Medium|SemiBold|Bold|ExtraBold|Black)\b|\(FontWeight\)");

    [Fact]
    public void No_text_is_told_the_font_of_the_interface()
    {
        // The font reaches a text by the window handing it down, and its
        // letters by the formatter; code takes the mono font by being told to
        // (Fonts.Code) and every weight is one of the three kinds: a text
        // that sets the family or a weight itself is one that a change of
        // the fonts does not reach.
        var found = Directory.EnumerateFiles(Source(), "*.cs",
                SearchOption.AllDirectories)
            .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" +
                                    Path.DirectorySeparatorChar) &&
                        !f.Contains(Path.DirectorySeparatorChar + "bin" +
                                    Path.DirectorySeparatorChar) &&
                        Path.GetFileName(f) != "Fonts.cs")
            .SelectMany(f => File.ReadLines(f).Select((line, i) =>
                (f, i, line)))
            .Where(x => x.line.Contains("FontFamily = Fonts.System") ||
                        x.line.Contains("FontFamily = Fonts.English") ||
                        x.line.Contains("FontFamily = Fonts.Other") ||
                        x.line.Contains("FontFamily = Fonts.Mono") ||
                        x.line.Contains("new FontFamily(") ||
                        Weighed.IsMatch(x.line))
            .Select(x => $"{Path.GetFileName(x.f)}:{x.i + 1}: {x.line.Trim()}")
            .ToList();
        Assert.True(found.Count == 0, string.Join("\n", found));
    }
}
