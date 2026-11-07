using Avalonia.Media;
using OhMatrix.Core.Theming;
using Xunit;

namespace OhMatrix.Tests.Theming;

// The cases of themes.test.ts of the React Native app, so that the two themes systems stay the same.
public class ThemesTests {
    [Fact]
    public void Mix_interpolates_colours()
    {
        Assert.Equal(Color.FromRgb(0x80, 0x80, 0x80),
            ThemeColor.Mix("#000000", "#ffffff", 0.5));
        Assert.Equal(Color.FromRgb(0xff, 0, 0),
            ThemeColor.Mix("#ff0000", "#0000ff", 0));
    }

    [Fact]
    public void Built_in_themes_are_registered()
    {
        var ids = Themes.All().Select(t => t.Id).ToList();
        string[] expected = [
            "light", "dark", "midnight", "ocean", "forest", "dark-green",
            "dark-pink",
            "dark-yellow", "dark-violet", "light-violet", "sakura",
        ];
        foreach (var id in expected)
            Assert.Contains(id, ids);
    }

    [Fact]
    public void A_custom_theme_is_one_Define_and_one_Register()
    {
        var label = new Dictionary<string, string> {
            ["en"] = "Amber"
        };
        Themes.Register(Themes.Define(new ThemeSeed {
            Id = "amber",
            Label = label,
            Dark = true,
            Accent = "#FFB300",
        }));
        Assert.Equal(Color.FromRgb(0xFF, 0xB3, 0),
            Themes.Get("amber")!.Colors.Accent);
        Assert.Equal("amber", Themes.All()[^1].Id);
        Assert.Equal("Amber", Themes.Get("amber")!.LabelFor("zh-CN"));
    }

    [Fact]
    public void
        System_follows_the_OS_scheme_and_unknown_ids_fall_back_to_light()
    {
        Assert.Equal("dark", Themes.Resolve("system", true).Id);
        Assert.Equal("light", Themes.Resolve("system", null).Id);
        Assert.Equal("light", Themes.Resolve("nope", true).Id);
        Assert.Equal("sakura", Themes.Resolve("sakura", true).Id);
    }

    [Fact]
    public void The_light_theme_has_the_tokens_of_the_React_Native_app()
    {
        var c = Themes.Get("light")!.Colors;
        Assert.Equal(Color.FromRgb(0x33, 0x90, 0xEC), c.Accent);
        Assert.Equal(Color.FromRgb(0xE5, 0xEB, 0xF0), c.ChatBg);
        Assert.Equal(Color.FromRgb(0xFF, 0xFF, 0xFF), c.BubbleIn);
        Assert.Equal(c.Accent, c.BubbleOut);
        Assert.Equal(Color.FromArgb(41, 60, 60, 67), c.Separator);
    }

    [Fact]
    public void The_dark_theme_derives_its_selected_row_from_the_override()
    {
        var c = Themes.Get("dark")!.Colors;
        Assert.Equal(Color.FromRgb(0x2B, 0x52, 0x78), c.Selected);
        Assert.Equal(Color.FromRgb(0x3E, 0x88, 0xF7), c.Badge);
        Assert.Equal(Color.FromRgb(0x21, 0x2D, 0x3B), c.BubbleIn);
    }
}
