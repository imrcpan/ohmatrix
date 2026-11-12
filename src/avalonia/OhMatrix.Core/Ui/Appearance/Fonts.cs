using System.Text;
using Avalonia;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using OhMatrix.Core.Model;

namespace OhMatrix.Core.Ui.Appearance;

/// <summary>The fonts of the interface: the system UI fonts (SF on Apple, Segoe UI on Windows, the platform default elsewhere; the stack of theme.tsx) unless the person chose an installed one.</summary>
public static class Fonts {
    private const string Stack =
        "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI Variable Text, Segoe UI, system-ui, Helvetica Neue, sans-serif";

    // The families of the interface and of code end in a name that no font
    // has, and that is new each time the fonts or the weights change. The
    // name of the interface's says that the text is the interface's own, and
    // is cut by its letters (see ScriptTextFormatter); that it is new makes
    // whatever holds the family draw again.
    private const string UiMarker = "OhMatrix.Ui.";
    private const string MonoMarker = "OhMatrix.Mono.";

    // The resources the app's texts take their fonts from.
    private const string DefaultFont = "ContentControlThemeFontFamily";
    private const string MonoFont = "OhMatrix.MonoFont";

    /// <summary>
    /// A number that is new each time any of the fonts or the weights change. What measures with a font of its own (the room for the time in a
    /// bubble) holds what it measured with; it is made again when this is not the number it was made at.
    /// </summary>
    public static int Version { get; private set; }

    private static string? usedMono;
    private static string? usedEnglish;
    private static string? usedOther;
    private static FontWeight lightWeight = FontWeight.Light;
    private static FontWeight normalWeight = FontWeight.Normal;
    private static FontWeight boldWeight = FontWeight.Bold;

    /// <summary>
    /// The font of the interface, and of every text that is given none. It is the English font, the font of the other scripts, the general
    /// font and the system's stack, and it ends in a name that marks it. The formatter of the text (<see cref="ScriptTextFormatter"/>) draws a
    /// text with this family letter by letter: a Latin letter with <see cref="English"/> and any other letter with <see cref="Other"/>. Nothing
    /// sets it on a text: the windows hand it down.
    /// </summary>
    public static FontFamily System { get; private set; } =
        new(Stack + ", " + UiMarker + "0");

    /// <summary>The font of the Latin letters: the English font, then the general one, then the system's stack.</summary>
    public static FontFamily English { get; private set; } = new(Stack);

    /// <summary>
    /// The font of the letters that are not Latin: the font for the other languages, then the general one, then the system's stack. It is used
    /// whatever the language of the interface, and before the English font even where the English font has the letter too.
    /// </summary>
    public static FontFamily Other { get; private set; } = new(Stack);

    /// <summary>
    /// The font of the monospaced texts (code, the log). A text that is monospaced does not set it: it is told to take it, with
    /// <see cref="Code"/>, and then follows it when it is changed.
    /// </summary>
    public static FontFamily Mono { get; private set; } =
        new("monospace, " + MonoMarker + "0");

    /// <summary>
    /// The three kinds of weight a text can ask for. What it is drawn in is not the number it asks for but the one chosen for its kind in the
    /// font settings (<see cref="Drawn"/>), whoever draws it, so a text asks for a kind and never for a number.
    /// </summary>
    public static FontWeight Light => FontWeight.Light;

    public static FontWeight Normal => FontWeight.Normal;

    public static FontWeight Bold => FontWeight.Bold;

    /// <summary>
    /// The weight a text that asks for <paramref name="asked"/> is drawn in: the one chosen for the kind it is nearest to. A weight up to
    /// 350 is of the kind Light, up to 550 Normal and a heavier one Bold, so Medium is Normal and SemiBold is Bold.
    /// </summary>
    public static FontWeight Drawn(FontWeight asked)
    {
        return (int)asked <= 350 ? lightWeight
            : (int)asked <= 550 ? normalWeight
            : boldWeight;
    }

    /// <summary>Takes the fonts and weights of the preferences; new families are made when any of them changed, so that what holds the old ones can tell.</summary>
    public static void Use(Preferences p)
    {
        var general = Named(p.Font);
        // Null follows the general font; an empty name is the system's own,
        // with no general font behind it.
        var english = Chain(p.EnglishFont, general);
        var other = Chain(p.OtherFont, general);
        var mono = Named(p.MonoFont);
        var monospaced = mono == null ? "monospace" : mono + ", monospace";
        var light = (FontWeight)p.LightWeight;
        var normal = (FontWeight)p.NormalWeight;
        var bold = (FontWeight)p.BoldWeight;
        // Preferences that look the same are the same families: what holds
        // a family takes an equal one to be the same, and a new one to be a
        // change, and a weight is a change of the families too, since it is
        // by the families that texts are told to be drawn again.
        if (english != usedEnglish || other != usedOther ||
            monospaced != usedMono || light != lightWeight ||
            normal != normalWeight || bold != boldWeight) {
            usedEnglish = english;
            usedOther = other;
            usedMono = monospaced;
            lightWeight = light;
            normalWeight = normal;
            boldWeight = bold;
            Version++;
            English = new FontFamily(english);
            Other = new FontFamily(other);
            System = new FontFamily(
                $"{Merge(english, other)}, {UiMarker}{Version}");
            Mono = new FontFamily($"{monospaced}, {MonoMarker}{Version}");
        }

        if (Application.Current is { } app)
            Defaults(app);
    }

    /// <summary>
    /// Makes the interface's font the default one of the app: the resource that the window and the controls of the theme take their font from.
    /// The text that is given no font inherits it, and a change of the fonts is handed down to all of it at once.
    /// </summary>
    public static void Defaults(Application app)
    {
        app.Resources[DefaultFont] = System;
        app.Resources[MonoFont] = Mono;
    }

    /// <summary>
    /// Makes a text monospaced: it takes <see cref="Mono"/> and follows it when the font is changed. A text that is given the family itself
    /// would keep the one it was given.
    /// </summary>
    public static void Code(StyledElement text)
    {
        text.Bind(TextElement.FontFamilyProperty,
            text.GetResourceObservable(MonoFont));
    }

    // The names a font falls back through: the chosen one (the general one
    // when none is chosen, nothing when the system's own is), then the
    // fallbacks, then the stack. Duplicates are left out.
    private static string Chain(string? chosen, string? general)
    {
        var names = new List<string>();
        if (chosen == null) {
            if (general != null)
                names.Add(general);
        } else if (chosen.Length > 0)
            names.Add(chosen);

        if (general != null && chosen != "" && !names.Contains(general))
            names.Add(general);
        names.Add(Stack);
        return string.Join(", ", names);
    }

    private static string Merge(string english, string other)
    {
        var stack = Stack.Split(", ");
        var names = new List<string>();
        foreach (var part in new[] {
                     english, other
                 }) {
            foreach (var name in part.Split(", ")) {
                if (!stack.Contains(name) && !names.Contains(name))
                    names.Add(name);
            }
        }

        names.Add(Stack);
        return string.Join(", ", names);
    }

    /// <summary>Whether <paramref name="family"/> is the family of the interface (of any time), whose text is cut by its letters.</summary>
    public static bool IsUi(FontFamily family)
    {
        var names = family.FamilyNames;
        return names.Count > 1 &&
               names[names.Count - 1]
                   .StartsWith(UiMarker, StringComparison.Ordinal);
    }

    /// <summary>
    /// The length of the first piece of <paramref name="text"/>, and whether it is drawn in the English font (otherwise in the font of the other
    /// scripts). A piece runs up to the first letter of the other kind: a Latin letter takes the English font and any other letter the other
    /// font. What is not a letter (digits, spaces, punctuation, signs, marks) goes with the letter before it, or with the first letter after it
    /// at the start of the text, and a text without a letter is English.
    /// </summary>
    public static (int Length, bool English) Piece(ReadOnlySpan<char> text)
    {
        // The first letter says which kind the piece is; what is before it
        // goes with it. The piece ends at the first letter of the other kind.
        var at = 0;
        var kind = Latin;
        while (at < text.Length) {
            var found = KindAt(text, at, out var used);
            at += used;
            if (found != None) {
                kind = found;
                break;
            }
        }

        while (at < text.Length) {
            var found = KindAt(text, at, out var used);
            if (found != None && found != kind)
                return (at, kind == Latin);
            at += used;
        }

        return (text.Length, kind == Latin);
    }

    private const int None = 0;
    private const int Latin = 1;
    private const int NotLatin = 2;

    // What the character at a place is: not a letter, a Latin letter or any
    // other, and how many chars it is made of. ASCII, most of what is
    // written, is told without decoding it.
    private static int KindAt(ReadOnlySpan<char> text, int at, out int used)
    {
        var c = text[at];
        if (c < 0x80) {
            used = 1;
            return char.IsAsciiLetter(c) ? Latin : None;
        }

        Rune.DecodeFromUtf16(text[at..], out var rune, out used);
        return !Rune.IsLetter(rune) ? None : IsLatin(rune) ? Latin : NotLatin;
    }

    // The letters of the Latin scripts: ASCII, Latin-1, the extended Latin
    // blocks, the phonetic ones and the ligatures.
    private static bool IsLatin(Rune rune)
    {
        var v = rune.Value;
        return v is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or 0xAA or 0xBA
            or >= 0xC0 and <= 0x2AF or >= 0x1D00 and <= 0x1DBF
            or >= 0x1E00 and <= 0x1EFF or >= 0x2C60 and <= 0x2C7F
            or >= 0xA720 and <= 0xA7FF or >= 0xAB30 and <= 0xAB6F
            or >= 0xFB00 and <= 0xFB06;
    }

    /// <summary>Whether two preferences look different to the interface, in the same language.</summary>
    public static bool Differs(Preferences a, Preferences b)
    {
        return a.Font != b.Font || a.EnglishFont != b.EnglishFont ||
               a.OtherFont != b.OtherFont || a.MonoFont != b.MonoFont ||
               a.LightWeight != b.LightWeight ||
               a.NormalWeight != b.NormalWeight || a.BoldWeight != b.BoldWeight;
    }

    // An empty name is the system's own font.
    private static string? Named(string? name)
    {
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }

    /// <summary>
    /// Puts the middle of the letters of a one-line text at the middle of its box. A font draws its line with room above and below that is not the same on both sides (differently from one font to the next), so a text centred by its box can sit high or low beside an icon. The text must have its string, font and size.
    /// </summary>
    public static void Center(TextBlock text)
    {
        if (string.IsNullOrEmpty(text.Text))
            return;
        // A text that is given no font is drawn in the interface's.
        var family = text.IsSet(TextBlock.FontFamilyProperty)
            ? text.FontFamily
            : System;
        var layout = new TextLayout(text.Text,
            new Typeface(family, text.FontStyle, text.FontWeight),
            text.FontSize, null);
        // The middle of capitals and of ideographs is about 0.36 em above the baseline.
        var shift = layout.Height / 2 -
                    (layout.Baseline - 0.36 * text.FontSize);
        text.RenderTransform = new TranslateTransform(0, shift);
    }

    /// <summary>The names of the fonts installed, sorted.</summary>
    public static IReadOnlyList<string> Installed()
    {
        return [
            .. FontManager.Current.SystemFonts.Select(f => f.Name).Distinct()
                .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase)
        ];
    }
}
