using System.Text.RegularExpressions;
using OhMatrix.Core.I18n;
using Xunit;

namespace OhMatrix.Tests.I18n;

// The cases of i18n.test.ts and catalogs.test.ts of src/i18n, read from the same TOML files.
public class StringsTests {
    [Fact]
    public void T_fills_the_values_and_reads_each_language()
    {
        Assert.Equal("3 members", Strings.T("en", "members", ("n", 3)));
        Assert.Equal("聊天", Strings.T("zh-CN", "chats"));
        Assert.Equal("3 位成員", Strings.T("zh-TW", "members", ("n", 3)));
        Assert.Equal("Iniciar sesión", Strings.T("es", "signIn"));
        Assert.Equal("Войти", Strings.T("ru", "signIn"));
        Assert.Equal("साइन इन करें", Strings.T("hi", "signIn"));
        Assert.Equal("A e B stanno scrivendo...",
            Strings.T("it", "typing.two", ("a", "A"), ("b", "B")));
        Assert.Equal("A님 외 4명이 입력 중...",
            Strings.T("ko", "typing.many", ("a", "A"), ("n", 4)));
    }

    [Fact]
    public void A_missing_translation_never_throws()
    {
        Assert.Equal("nope.nothing", Strings.T("en", "nope.nothing"));
        Assert.Equal("nope.nothing",
            Strings.T("zh-CN", "nope.nothing", ("n", 1)));
        Assert.Equal("Chats", Strings.T("xx", "chats"));
    }

    [Fact]
    public void The_language_follows_the_system_tag()
    {
        (string? Tag, string Expected)[] cases = [
            ("en-US", "en"), ("fr", "fr"), ("fr-CA", "fr"), ("pt_BR", "pt"),
            ("PT-pt", "pt"),
            ("ja-JP", "ja"), ("ko", "ko"), ("hi-IN", "hi"), ("bn-BD", "bn"),
            ("in", "id"),
            ("id-ID", "id"), ("zh", "zh-CN"), ("zh-Hans-CN", "zh-CN"),
            ("zh-SG", "zh-CN"),
            ("zh-TW", "zh-TW"), ("zh-HK", "zh-TW"), ("zh-Hant", "zh-TW"),
            ("zh-Hant-TW", "zh-TW"), ("ar", "en"), ("ur", "en"), (null, "en"),
            ("", "en"),
        ];
        foreach (var (tag, expected) in cases)
            Assert.Equal(expected, Strings.DetectLocale(tag));
    }

    [Fact]
    public void There_are_14_languages_and_English_is_first()
    {
        Assert.Equal(14, Strings.Languages.Count);
        Assert.Equal("en", Strings.Languages[0].Id);
        Assert.Equal("简体中文",
            Strings.Languages.Single(l => l.Id == "zh-CN").Label);
        Assert.True(Strings.IsLocale("fr"));
        Assert.False(Strings.IsLocale("xx"));
        Assert.False(Strings.IsLocale(null));
    }

    [Fact]
    public void Every_language_has_every_text_of_English_with_the_same_values()
    {
        var values = new Regex(@"\{(\w+)\}");
        var keys = Strings.Keys();
        Assert.Equal(630, keys.Count);
        var problems = new List<string>();
        foreach (var language in Strings.Languages) {
            Assert.True(Strings.HasCatalog(language.Id));
            foreach (var key in keys) {
                var text = Strings.T(language.Id, key);
                if (string.IsNullOrWhiteSpace(text))
                    problems.Add($"{language.Id}: {key} is empty");
                var have = values.Matches(text).Select(m => m.Groups[1].Value)
                    .Order().ToList();
                var want = values.Matches(Strings.T("en", key))
                    .Select(m => m.Groups[1].Value)
                    .Order().ToList();
                if (!have.SequenceEqual(want))
                    problems.Add(
                        $"{language.Id}: {key} has {{{string.Join(",", have)}}}");
            }
        }

        Assert.Empty(problems);
    }

    [Theory]
    [InlineData("a = \"x\\u00e9\\n\"  # c", "a", "xé\n")]
    [InlineData("\"k.j\" = 'lit\\n'", "k.j", "lit\\n")]
    [InlineData("a = \"\\uD83D\\uDE00\"", "a", "\U0001F600")]
    public void The_reader_understands_the_strings_of_the_files(string line,
        string key,
        string value)
    {
        Assert.Equal(value, TomlLite.Parse(line).Root[key]);
    }

    [Theory]
    [InlineData("a = 1")]
    [InlineData("a = \"x\" \"y\"")]
    [InlineData("a = \"x\"\na = \"y\"")]
    [InlineData("[table]")]
    [InlineData("a = \"\"\"x\"\"\"")]
    public void The_reader_refuses_what_it_does_not_support(string text)
    {
        Assert.Throws<FormatException>(() => TomlLite.Parse(text));
    }

    [Fact]
    public void The_short_forms_give_what_the_general_form_gives()
    {
        Assert.Equal("Ann and Bob are typing...",
            Strings.T("en", "typing.two", ("a", "Ann"), ("b", "Bob")));
        Assert.Equal(
            Strings.T("en", "typing.two", ("a", (object)"Ann"),
                ("b", (object)"Bob")),
            Strings.T("en", "typing.two", ("a", "Ann"), ("b", "Bob")));
        Assert.Equal("7 messages selected",
            Strings.T("en", "selected.count", ("n", 7)));
        Assert.Equal(
            Strings.T("en", "selected.count", ("n", (object)7)),
            Strings.T("en", "selected.count", ("n", 7)));
        Assert.Equal("Uploading stickers 2/9…",
            Strings.T("en", "sticker.uploading.n", ("n", 9), ("i", 2)));
        // A number is written the same in every language of the list.
        Assert.Equal(
            Strings.T("de", "sticker.uploading.n", ("n", (object)1234567),
                ("i", (object)2)),
            Strings.T("de", "sticker.uploading.n", ("n", 1234567), ("i", 2)));
    }

    [Fact]
    public void An_unknown_language_reads_english_and_an_unknown_key_itself()
    {
        Assert.Equal(Strings.T("en", "cancel"), Strings.T("xx", "cancel"));
        Assert.Equal("no.such.key", Strings.T("en", "no.such.key"));
        Assert.Equal("no.such.key",
            Strings.T("zh-CN", "no.such.key", ("n", 1)));
    }

    [Fact]
    public void Languages_asked_for_from_many_threads_at_once_read_right()
    {
        var ids = Strings.Languages.Select(l => l.Id).ToArray();
        var expected = ids.ToDictionary(id => id,
            id => Strings.T(id, "cancel"));
        var wrong = 0;
        Parallel.For(0, 4000, n => {
            var id = ids[n % ids.Length];
            if (Strings.T(id, "cancel") != expected[id])
                Interlocked.Increment(ref wrong);
        });
        Assert.Equal(0, wrong);
    }
}
