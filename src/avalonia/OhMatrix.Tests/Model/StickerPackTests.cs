using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Model;

public class StickerPackTests {
    private const string Pack = """
                                {"pack":{"display_name":"mine"},"images":{
                                  "cat":{"url":"mxc://s/cat","body":"cat","info":{"mimetype":"image/png","w":64,"h":32,"size":900},"usage":["sticker"]},
                                  "smile":{"url":"mxc://s/smile","usage":["emoticon"]},
                                  "plain":{"url":"mxc://s/plain","info":{"mimetype":"image/gif"}},
                                  "bad":{"url":"http://s/bad"}}}
                                """;

    [Fact]
    public void Stickers_are_the_images_the_pack_marks_for_them()
    {
        var list = StickerPack.Parse(Pack);
        Assert.Equal(["cat", "plain"], list.Select(s => s.Shortcode));
        Assert.Equal(new Sticker("cat", "mxc://s/cat", "image/png", 64, 32, 900), list[0]);
        Assert.Equal("image/gif", list[1].MimeType);
        Assert.Empty(StickerPack.Parse(null));
        Assert.Empty(StickerPack.Parse("not json"));
    }

    [Fact]
    public void Writing_keeps_what_another_client_put_in_the_pack()
    {
        var text =
            StickerPack.Write(Pack, [new Sticker("dog", "mxc://s/dog", "image/webp", 10, 20)]);
        Assert.Contains("\"display_name\":\"mine\"", text);
        var back = StickerPack.Parse(text);
        Assert.Equal(["dog"], back.Select(s => s.Shortcode));
        Assert.Contains("\"smile\"", text);
    }

    [Fact]
    public void The_event_of_a_sticker_has_its_name_and_picture()
    {
        var content =
            StickerPack.EventContent(new Sticker("cat", "mxc://s/cat", "image/png", 1, 2));
        Assert.Equal("cat", (string?)content["body"]);
        Assert.Equal("mxc://s/cat", (string?)content["url"]);
        Assert.Equal(1, (int?)content["info"]!["w"]);
    }

    [Fact]
    public void A_new_name_is_free_and_short()
    {
        var taken = new HashSet<string> {
            "cat",
            "cat 2"
        };
        Assert.Equal("cat 3", StickerPack.NewShortcode("cat.png", taken));
        Assert.Equal("sticker", StickerPack.NewShortcode("  ", taken));
        Assert.Equal(40, StickerPack.NewShortcode(new string('x', 60) + ".gif", taken).Length);
    }

    [Fact]
    public void Only_four_kinds_of_picture_are_taken_and_small_ones()
    {
        Assert.Equal("image/png", StickerPack.Check("a.png", "image/png", 10));
        Assert.Equal("image/jpeg", StickerPack.Check("a.jpg", "", 10));
        Assert.Equal("image/webp", StickerPack.Check("a.webp", "application/octet-stream", 10));
        Assert.Equal(EngineErrorCode.UnsupportedType,
            Assert.Throws<EngineException>(() => StickerPack.Check("a.svg", "image/svg+xml", 10))
                .Code);
        Assert.Equal(EngineErrorCode.TooLarge,
            Assert.Throws<EngineException>(() => StickerPack.Check("a.png", "image/png", 4_000_000))
                .Code);
    }

    private static StickerGroup G(string id, params string[] stickers) =>
        new(id, "", null, stickers);

    [Fact]
    public void The_default_group_holds_what_no_group_has()
    {
        var pack = new[] {
            "a", "b", "c", "d"
        }.Select(c => new Sticker(c, "mxc://s/" + c, "image/png")).ToList();
        var groups = StickerPack.WithDefault([G("x", "c", "gone"), G("default", "d")], pack);
        Assert.Equal(["default", "x"], groups.Select(g => g.Id));
        Assert.Equal(["d", "a", "b"], groups[0].Stickers);
        Assert.Equal(["c"], groups[1].Stickers);
    }

    [Fact]
    public void A_sticker_is_in_one_group_only()
    {
        var groups = StickerPack.Place([G("default", "a"), G("x", "b"), G("y")], "b", "y");
        Assert.Equal(["a"], groups[0].Stickers);
        Assert.Empty(groups[1].Stickers);
        Assert.Equal(["b"], groups[2].Stickers);
        var same = StickerPack.Place(groups, "a", "nope");
        Assert.Equal(["a"], same[0].Stickers);
    }

    [Fact]
    public void Groups_are_read_safely_and_written_whole()
    {
        var parsed = StickerPack.ParseGroups("""
                                             {"groups":[{"id":"x","name":" Fun ","icon":{"kind":"emoji","emoji":"🎉"},"stickers":["a","a","b"]},
                                                        {"id":"x","stickers":["c"]},
                                                        {"id":"y","stickers":["b","d"]},{"name":"no id"}]}
                                             """);
        Assert.Equal(["x", "y"], parsed.Select(g => g.Id));
        Assert.Equal("Fun", parsed[0].Name);
        Assert.Equal(["a", "b"], parsed[0].Stickers);
        Assert.Equal(["d"], parsed[1].Stickers);
        var again = StickerPack.ParseGroups(StickerPack.WriteGroups(parsed));
        Assert.Equal(parsed.Select(g => (g.Id, g.Name, g.Icon)),
            again.Select(g => (g.Id, g.Name, g.Icon)));
        Assert.Equal(parsed[0].Stickers, again[0].Stickers);
        Assert.Throws<EngineException>(() =>
            StickerPack.WriteGroups([new("default", "", StickerIcon.OfEmoji("😀"), [])]));
        Assert.Throws<EngineException>(() =>
            StickerPack.WriteGroups(Enumerable.Range(0, 13).Select(i => G("g" + i)).ToList()));
    }

    [Fact]
    public void A_cover_is_the_one_chosen_the_first_sticker_or_a_face()
    {
        var pack = new[] {
            new Sticker("a", "mxc://s/a", "image/png")
        };
        Assert.Equal("🎉",
            StickerPack.CoverOf(new("x", "", StickerIcon.OfEmoji("🎉"), ["a"]), pack).Emoji);
        Assert.Equal("mxc://s/a", StickerPack.CoverOf(G("x", "gone", "a"), pack).Url);
        Assert.Equal(StickerPack.FallbackEmoji, StickerPack.CoverOf(G("x"), pack).Emoji);
    }

    [Fact]
    public void Items_move_and_removed_stickers_leave_the_groups()
    {
        Assert.Equal(["b", "c", "a"], StickerPack.MoveItem(["a", "b", "c"], 0, 2));
        Assert.Equal(["a", "b"], StickerPack.MoveItem(["a", "b"], 0, 5));
        var groups = StickerPack.Without([G("x", "a", "b"), G("y", "c")], ["b", "c"]);
        Assert.Equal(["a"], groups[0].Stickers);
        Assert.Empty(groups[1].Stickers);
        var id = StickerPack.NewGroupId([G("000000")], new Random(1));
        Assert.Equal(6, id.Length);
    }
}
