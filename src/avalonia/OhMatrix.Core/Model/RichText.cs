using System.Globalization;
using System.Text.RegularExpressions;

namespace OhMatrix.Core.Model;

/// <summary>A run of text with the formatting the sender asked for (<c>Run</c> of the TypeScript richtext model).</summary>
public sealed record TextRun(string Text) {
    public bool Bold { get; init; }
    public bool Italic { get; init; }
    public bool Underline { get; init; }
    public bool Strike { get; init; }
    public bool Code { get; init; }

    /// <summary>Set for links and for bare URLs found in the plain body.</summary>
    public string? Href { get; init; }

    /// <summary>A matrix.to user permalink, or an <c>@name</c> of the body: drawn as a mention pill.</summary>
    public string? UserId { get; init; }

    /// <summary>The run was inside a spoiler; hidden until pressed.</summary>
    public bool Spoiler { get; init; }

    /// <summary>Ends a line (from a line break, a paragraph, a quote or a list item).</summary>
    public bool Br { get; init; }

    /// <summary>Drawn before the text: a bullet or a number of a list item.</summary>
    public string? Prefix { get; init; }
}

/// <summary>
/// Parses Matrix message bodies into styled runs. The HTML of <c>formatted_body</c> is never used as markup: only the few styles of
/// <see cref="TextRun"/> can come out of it, and unknown tags are dropped with their text kept.
/// </summary>
public static partial class RichText {
    [GeneratedRegex(@"https?://[^\s<>()]+[^\s<>().,;:!?""'’]")]
    private static partial Regex UrlRegex();

    [GeneratedRegex(@"(@[^\s@:]+(?::[^\s@:]+)?)")]
    private static partial Regex MentionRegex();

    [GeneratedRegex(@"^https?://matrix\.to/#/(@[^/?#\s]+)")]
    private static partial Regex PermalinkRegex();

    [GeneratedRegex(@"\bhref\s*=\s*(?:""([^""]*)""|'([^']*)'|([^\s>]+))", RegexOptions.IgnoreCase)]
    private static partial Regex HrefRegex();

    [GeneratedRegex(@"&(#\d+|[a-z]+);", RegexOptions.IgnoreCase)]
    private static partial Regex EntityRegex();

    [GeneratedRegex("data-mx-spoiler", RegexOptions.IgnoreCase)]
    private static partial Regex SpoilerRegex();

    private sealed class Frame {
        public TextRun Style = new("");
        public bool Pre;
        public string? List;
    }

    private static string Decode(string s)
    {
        return EntityRegex().Replace(s, m => {
            var e = m.Groups[1].Value;
            switch (e.ToLowerInvariant()) {
                case "amp":
                    return "&";
                case "lt":
                    return "<";
                case "gt":
                    return ">";
                case "quot":
                    return "\"";
                case "apos":
                    return "'";
                case "nbsp":
                    return " ";
            }

            if (e[0] == '#' && int.TryParse(e.AsSpan(1), NumberStyles.None, null, out var code)
                            && code is > 0 and <= 0x10FFFF and not (>= 0xD800 and <= 0xDFFF))
                return char.ConvertFromUtf32(code);
            return m.Value;
        });
    }

    /// <summary>Parses a <c>formatted_body</c>.</summary>
    public static IReadOnlyList<TextRun> ParseFormatted(string html)
    {
        var runs = new List<TextRun>();
        var stack = new List<Frame> {
            new()
        };
        var li = 0;
        var i = 0;

        void Push(string text)
        {
            if (text.Length == 0)
                return;
            var run = stack[^1].Style with {
                Text = text
            };
            if (runs.Count > 0 && SameStyle(runs[^1], run))
                runs[^1] = runs[^1] with {
                    Text = runs[^1].Text + text
                };
            else
                runs.Add(run);
        }

        while (i < html.Length) {
            var lt = html.IndexOf('<', i);
            if (lt == -1) {
                Push(Decode(html[i..]));
                break;
            }

            Push(Decode(html[i..lt]));
            var gt = html.IndexOf('>', lt);
            if (gt == -1) {
                Push(Decode(html[lt..]));
                break;
            }

            var raw = html[(lt + 1)..gt];
            i = gt + 1;
            if (raw.StartsWith("!--", StringComparison.Ordinal)) {
                var end = html.IndexOf("-->", i, StringComparison.Ordinal);
                i = end == -1 ? i : end + 3;
                continue;
            }

            var closing = raw.StartsWith('/');
            var tag = closing ? raw[1..] : raw;
            var cut = tag.AsSpan().IndexOfAny(" \t\r\n/");
            var name = (cut < 0 ? tag : tag[..cut]).ToLowerInvariant();
            var attrs = closing ? "" : raw[name.Length..];
            if (name is "br" or "hr" or "img") {
                if (name == "br")
                    runs.Add(new TextRun("\n") {
                        Br = true
                    });
                continue;
            }

            if (closing) {
                stack.RemoveAt(stack.Count - 1);
                if (stack.Count == 0)
                    stack.Add(new Frame());
                if (name is "p" or "blockquote" or "pre" or "li")
                    runs.Add(new TextRun("\n") {
                        Br = true
                    });
                continue;
            }

            var top = stack[^1];
            var frame = new Frame {
                Style = top.Style,
                Pre = top.Pre,
                List = top.List
            };
            switch (name) {
                case "b" or "strong":
                    frame.Style = frame.Style with {
                        Bold = true
                    };
                    break;
                case "i" or "em" or "blockquote":
                    frame.Style = frame.Style with {
                        Italic = true
                    };
                    break;
                case "u":
                    frame.Style = frame.Style with {
                        Underline = true
                    };
                    break;
                case "s" or "del":
                    frame.Style = frame.Style with {
                        Strike = true
                    };
                    break;
                case "code":
                    frame.Style = frame.Style with {
                        Code = true
                    };
                    break;
                case "pre":
                    frame.Style = frame.Style with {
                        Code = true
                    };
                    frame.Pre = true;
                    break;
                case "li":
                    li = top.List == "ol" ? li + 1 : 0;
                    frame.Style = frame.Style with {
                        Prefix = top.List == "ol" ? $"{li}. " : "• "
                    };
                    break;
                case "ol" or "ul":
                    frame.List = name;
                    top.List = name;
                    break;
                case "a": {
                    var m = HrefRegex().Match(attrs);
                    var url = m.Success
                        ? Decode(m.Groups[1].Success ? m.Groups[1].Value
                            : m.Groups[2].Success ? m.Groups[2].Value
                            : m.Groups[3].Value)
                        : "";
                    if (url.Length > 0) {
                        var uid = PermalinkRegex().Match(url);
                        frame.Style = frame.Style with {
                            Href = url,
                            UserId = uid.Success ? uid.Groups[1].Value : frame.Style.UserId,
                        };
                    }

                    break;
                }
                case "span" when SpoilerRegex().IsMatch(attrs):
                    frame.Style = frame.Style with {
                        Spoiler = true
                    };
                    break;
                case "p" when stack.Any(f => f.Pre):
                    frame.Style = frame.Style with {
                        Code = true
                    };
                    break;
            }

            // Everything else contributes no styling at all.
            stack.Add(frame);
        }

        while (runs.Count > 0 && runs[^1].Text == "\n")
            runs.RemoveAt(runs.Count - 1);
        return runs;
    }

    private static bool SameStyle(TextRun a, TextRun b)
    {
        return a.Bold == b.Bold && a.Italic == b.Italic && a.Underline == b.Underline
               && a.Strike == b.Strike && a.Code == b.Code && a.Spoiler == b.Spoiler
               && a.Href == b.Href && a.UserId == b.UserId && a.Prefix == b.Prefix
               && a.Br == b.Br;
    }

    /// <summary>
    /// A plain body as runs: bare URLs become links, and the <c>@name</c> tokens that match one of the mentioned people become
    /// mention pills.
    /// </summary>
    public static IReadOnlyList<TextRun> PlainRuns(string body,
        IReadOnlyList<string>? mentions = null)
    {
        var runs = new List<TextRun>();
        var at = 0;
        foreach (Match url in UrlRegex().Matches(body)) {
            AddPieces(body[at..url.Index]);
            runs.Add(new TextRun(url.Value) {
                Href = url.Value
            });
            at = url.Index + url.Length;
        }

        AddPieces(body[at..]);
        return runs;

        void AddPieces(string part)
        {
            foreach (var piece in MentionRegex().Split(part)) {
                if (piece.Length == 0)
                    continue;
                var uid = piece[0] == '@'
                    ? mentions?.FirstOrDefault(m => m == piece || m.Split(':')[0] == piece)
                    : null;
                runs.Add(new TextRun(piece) {
                    UserId = uid
                });
            }
        }
    }
}
