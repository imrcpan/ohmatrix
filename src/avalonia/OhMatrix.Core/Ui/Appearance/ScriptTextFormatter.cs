using System.Runtime.CompilerServices;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;

namespace OhMatrix.Core.Ui.Appearance;

/// <summary>
/// The formatter of every text of the app. It hands the text of the interface (the text whose font is <see cref="Fonts.System"/>, which is the
/// one every text has unless it was given another) to the formatter of Avalonia a piece at a time, each piece in the font of its letters:
/// Latin letters in the English font, any other letter in the font of the other scripts (<see cref="Fonts.Piece"/>). So no text has to be told,
/// nor can one be forgotten: a label, a menu, a tip, a text box, a chat bubble are all drawn by letters, and the text that is given a font of
/// its own, as code is, is left as it is. It also gives every run the weight that is chosen in the font settings for the kind of weight the
/// run asks for (<see cref="Fonts.Drawn"/>), so no text sets a weight of its own either.
/// </summary>
public sealed class ScriptTextFormatter : TextFormatter {
    private readonly TextFormatter inner;

    /// <summary>A formatter that cuts the interface's text by its letters and gives the pieces to <paramref name="inner"/>.</summary>
    public ScriptTextFormatter(TextFormatter inner)
    {
        this.inner = inner;
    }

    /// <summary>Makes it the formatter of the app, once.</summary>
    public static void Install()
    {
        var current = Current;
        if (current is ScriptTextFormatter)
            return;
        Replace(new ScriptTextFormatter(current));
    }

    // Avalonia keeps its services in a locator, and asks it for the
    // formatter each time a text is laid out. The members of the locator are
    // left out of the assemblies that are built against, but they are there
    // when the app runs; they are reached as they are, without reflection,
    // so that the app can be compiled ahead of time.
    private static void Replace(TextFormatter formatter)
    {
        Bind(Mutable(null), formatter);
    }

    [UnsafeAccessor(UnsafeAccessorKind.StaticMethod,
        Name = "get_CurrentMutable")]
    private static extern AvaloniaLocator Mutable(AvaloniaLocator? none);

    [UnsafeAccessor(UnsafeAccessorKind.Method, Name = "BindToSelf")]
    private static extern AvaloniaLocator Bind<T>(AvaloniaLocator locator,
        T service);

    public override TextLine? FormatLine(ITextSource textSource,
        int firstTextSourceIndex, double paragraphWidth,
        TextParagraphProperties paragraphProperties,
        TextLineBreak? previousLineBreak = null)
    {
        return inner.FormatLine(new Source(textSource), firstTextSourceIndex,
            paragraphWidth, paragraphProperties, previousLineBreak);
    }

    public override TextLine? FormatLine(ITextSource textSource,
        int firstTextSourceIndex, double paragraphWidth,
        TextParagraphProperties paragraphProperties,
        TextLineBreak? previousLineBreak, TextRunCache? textRunCache)
    {
        return inner.FormatLine(new Source(textSource), firstTextSourceIndex,
            paragraphWidth, paragraphProperties, previousLineBreak,
            textRunCache);
    }

    // The text as the formatter asks for it: a run of the interface's text
    // is given only up to the end of its first piece, and the next run asked
    // for starts there. Every run has the weight that is chosen for the kind
    // of weight it asks for. The properties of the pieces are made once for
    // the properties they come from, as a text asks for many pieces with
    // the same ones, and each set costs a lookup of its typeface.
    private sealed class Source(ITextSource source) : ITextSource {
        private TextRunProperties? seen;
        private PieceProperties? english;
        private PieceProperties? other;

        public TextRun? GetTextRun(int textSourceIndex)
        {
            var run = source.GetTextRun(textSourceIndex);
            if (run is not TextCharacters chars)
                return run;
            var properties = chars.Properties;
            var face = properties.Typeface;
            var weight = Fonts.Drawn(face.Weight);
            if (!ReferenceEquals(seen, properties)) {
                seen = properties;
                english = other = null;
            }

            // The text with a font of its own has the one variant: its weight.
            if (!Fonts.IsUi(face.FontFamily))
                return weight == face.Weight
                    ? run
                    : new TextCharacters(chars.Text,
                        english ??= new PieceProperties(properties,
                            face.FontFamily, weight));
            var (length, isEnglish) = Fonts.Piece(chars.Text.Span);
            var piece = isEnglish
                ? english ??= new PieceProperties(properties, Fonts.English,
                    weight)
                : other ??= new PieceProperties(properties, Fonts.Other,
                    weight);
            return new TextCharacters(chars.Text[..length], piece);
        }
    }

    // The properties of a run with another family and weight.
    private sealed class PieceProperties : TextRunProperties {
        private readonly TextRunProperties properties;

        public PieceProperties(TextRunProperties properties,
            FontFamily family, FontWeight weight)
        {
            this.properties = properties;
            var face = properties.Typeface;
            Typeface = new Typeface(family, face.Style, weight, face.Stretch);
        }

        public override Typeface Typeface { get; }

        public override double FontRenderingEmSize =>
            properties.FontRenderingEmSize;

        public override TextDecorationCollection? TextDecorations =>
            properties.TextDecorations;

        public override IBrush? ForegroundBrush => properties.ForegroundBrush;
        public override IBrush? BackgroundBrush => properties.BackgroundBrush;

        public override System.Globalization.CultureInfo? CultureInfo =>
            properties.CultureInfo;

        public override FontFeatureCollection? FontFeatures =>
            properties.FontFeatures;

        public override BaselineAlignment BaselineAlignment =>
            properties.BaselineAlignment;
    }
}
