using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Model;

// The cases of richtext.test.ts of the TypeScript ui package.
public class RichTextTests {
    private static string Text(IReadOnlyList<TextRun> runs)
    {
        return string.Concat(runs.Select(r => r.Text));
    }

    private static TextRun? Mark(IReadOnlyList<TextRun> runs, string text)
    {
        return runs.FirstOrDefault(r => r.Text == text);
    }

    [Fact]
    public void ParsesTheFormattingTagsMatrixAllows()
    {
        var runs = RichText.ParseFormatted(
            "<strong>bold</strong> <em>italic</em> <u>under</u> <del>gone</del> <code>code</code>");
        Assert.Equal("bold italic under gone code", Text(runs));
        Assert.True(Mark(runs, "bold")!.Bold);
        Assert.True(Mark(runs, "italic")!.Italic);
        Assert.True(Mark(runs, "under")!.Underline);
        Assert.True(Mark(runs, "gone")!.Strike);
        Assert.True(Mark(runs, "code")!.Code);
    }

    [Fact]
    public void NestedTagsAccumulateAndClosingRestoresTheOuterStyle()
    {
        var runs = RichText.ParseFormatted("<b>a<i>b</i>c</b>");
        Assert.Equal("abc", Text(runs));
        Assert.True(runs[1].Bold && runs[1].Italic);
        Assert.True(runs[2].Bold);
        Assert.False(runs[2].Italic);
    }

    [Fact]
    public void DecodesEntitiesAndKeepsTheNewlineFromBr()
    {
        Assert.Equal("a & b <c>\nd",
            Text(RichText.ParseFormatted("a &amp; b &lt;c&gt;<br>d")));
    }

    [Fact]
    public void LinksBecomeRunsAndMatrixToUserLinksBecomeMentions()
    {
        var runs = RichText.ParseFormatted(
            "<a href=\"https://example.com/x\">site</a> <a href=\"https://matrix.to/#/@ann:localhost\">Ann</a>");
        Assert.Equal("https://example.com/x", Mark(runs, "site")!.Href);
        Assert.Null(Mark(runs, "site")!.UserId);
        Assert.Equal("@ann:localhost", Mark(runs, "Ann")!.UserId);
        Assert.Equal("https://matrix.to/#/@ann:localhost",
            Mark(runs, "Ann")!.Href);
    }

    [Fact]
    public void UnknownAndDangerousTagsAreDroppedTheirTextKept()
    {
        var runs = RichText.ParseFormatted(
            "<script>alert(1)</script><img src=x onerror=alert(1)><span style=\"color:red\" onclick=\"x()\">text</span>");
        Assert.Equal("alert(1)text", Text(runs));
        Assert.All(runs, r => Assert.Null(r.Href));
    }

    [Fact]
    public void SpoilersAreMarkedAndListsGetABulletOrANumber()
    {
        var spoiler =
            RichText.ParseFormatted("<span data-mx-spoiler>secret</span>");
        Assert.True(spoiler.First(r => r.Text.Contains("secret")).Spoiler);
        var bullets =
            RichText.ParseFormatted("<ul><li>one</li><li>two</li></ul>");
        Assert.Equal(["one", "two"],
            bullets.Where(r => r.Prefix == "• ").Select(r => r.Text));
        var ordered = RichText.ParseFormatted("<ol><li>a</li><li>b</li></ol>");
        Assert.Equal(["1. ", "2. "],
            ordered.Where(r => r.Prefix is not null).Select(r => r.Prefix));
    }

    [Fact]
    public void UnclosedTagsDoNotLoseText()
    {
        Assert.Equal("half", Text(RichText.ParseFormatted("<b>half")));
        Assert.Equal("plain", Text(RichText.ParseFormatted("plain")));
    }

    [Fact]
    public void PlainBodiesLinkifyBareUrlsButNotPunctuation()
    {
        var runs =
            RichText.PlainRuns("see https://example.com/a. and http://b.c/d");
        Assert.Equal(["https://example.com/a", "http://b.c/d"],
            runs.Where(r => r.Href is not null).Select(r => r.Href));
        Assert.Equal("see https://example.com/a. and http://b.c/d", Text(runs));
    }

    [Fact]
    public void PlainBodiesTurnMentionedNamesIntoPillsAndOnlyThose()
    {
        var runs = RichText.PlainRuns("hi @ann and @bob", ["@ann:localhost"]);
        Assert.Equal("@ann:localhost", Mark(runs, "@ann")!.UserId);
        Assert.Null(Mark(runs, "@bob")!.UserId);
    }
}
