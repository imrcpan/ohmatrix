using Avalonia.Media;

namespace OhMatrix.Core.Theming;

/// <summary>The themes: how one is derived from a few colours, the registry, and the built-in ones.</summary>
public static class Themes {
    public const string System = "system";

    private static readonly Dictionary<string, ThemeDefinition>
        Registry = new();

    private static readonly List<string> Order = new();

    static Themes()
    {
        RegisterBuiltIn();
    }

    /// <summary>Derives a complete token set from a handful of seed colours (Telegram-style chat chrome).</summary>
    public static ThemeDefinition Define(ThemeSeed seed)
    {
        var dark = seed.Dark;
        var bg = seed.Bg ?? (dark ? "#1C1C1E" : "#FFFFFF");
        var text = seed.Text ?? (dark ? "#FFFFFF" : "#000000");
        var bgSecondary = seed.BgSecondary
                          ?? Hex(ThemeColor.Mix(bg,
                              dark ? "#FFFFFF" : "#000000",
                              dark ? 0.1 : 0.05));
        var chatBg = seed.ChatBg
                     ?? Hex(dark
                         ? ThemeColor.Mix(bg, seed.Accent, 0.12)
                         : ThemeColor.Mix("#E8EDF2", seed.Accent, 0.06));
        var bubbleIn = seed.BubbleIn
                       ?? (dark
                           ? Hex(ThemeColor.Mix(chatBg, "#FFFFFF", 0.1))
                           : "#FFFFFF");
        var bubbleOut = seed.BubbleOut
                        ?? (dark
                            ? Hex(ThemeColor.Mix(chatBg, seed.Accent, 0.45))
                            : seed.Accent);
        var grey = dark ? "#8D8E93" : "#8E8E93";
        var mention = ThemeColor.Hex("#3390EC");

        var colors = new ColorTokens {
            Bg = ThemeColor.Hex(bg),
            BgSecondary = ThemeColor.Hex(bgSecondary),
            ChatBg = ThemeColor.Hex(chatBg),
            Separator =
                dark
                    ? ThemeColor.Rgba(84, 84, 88, 0.5)
                    : ThemeColor.Rgba(60, 60, 67, 0.16),
            Text = ThemeColor.Hex(text),
            TextSecondary = ThemeColor.Hex(grey),
            TextTertiary = ThemeColor.Hex(dark ? "#48484A" : "#C7C7CC"),
            Accent = ThemeColor.Hex(seed.Accent),
            OnAccent = ThemeColor.Hex("#FFFFFF"),
            Danger = ThemeColor.Hex(dark ? "#FF453A" : "#FF3B30"),
            BubbleIn = ThemeColor.Hex(bubbleIn),
            BubbleInText = ThemeColor.Hex(dark ? "#FFFFFF" : "#000000"),
            BubbleOut = ThemeColor.Hex(bubbleOut),
            BubbleOutText = ThemeColor.Hex("#FFFFFF"),
            BubbleOutMeta = ThemeColor.Rgba(255, 255, 255, 0.72),
            Hover = dark
                ? ThemeColor.Rgba(255, 255, 255, 0.06)
                : ThemeColor.Rgba(0, 0, 0, 0.04),
            Selected =
                ThemeColor.Hex(dark
                    ? Hex(ThemeColor.Mix(bg, seed.Accent, 0.5))
                    : seed.Accent),
            OnSelected = ThemeColor.Hex("#FFFFFF"),
            OnSelectedSecondary = ThemeColor.Rgba(255, 255, 255, 0.78),
            Badge = ThemeColor.Hex(seed.Accent),
            BadgeMuted = ThemeColor.Hex(dark ? "#58585D" : "#C7C7CC"),
            ServiceChip =
                dark
                    ? ThemeColor.Rgba(20, 30, 45, 0.6)
                    : ThemeColor.Rgba(60, 80, 100, 0.38),
            ServiceChipText = ThemeColor.Hex(dark ? "#E6EAF0" : "#FFFFFF"),
            Overlay = dark
                ? ThemeColor.Rgba(0, 0, 0, 0.5)
                : ThemeColor.Rgba(0, 0, 0, 0.3),
            MentionBg = ThemeColor.Rgba(mention.R, mention.G, mention.B,
                dark ? 0.28 : 0.16),
            MentionHighlight = ThemeColor.Rgba(mention.R, mention.G, mention.B,
                dark ? 0.16 : 0.1),
        };
        if (seed.Overrides is not null)
            colors = seed.Overrides(colors);
        return new ThemeDefinition(seed.Id, seed.Label, dark, colors);
    }

    public static void Register(ThemeDefinition theme)
    {
        if (!Registry.ContainsKey(theme.Id))
            Order.Add(theme.Id);
        Registry[theme.Id] = theme;
        Listed = [.. Order.Select(id => Registry[id])];
    }

    // The list All() gives, made when a theme is registered, not at each call.
    private static IReadOnlyList<ThemeDefinition> Listed = [];

    /// <summary>The registered themes, in the order they were registered (the order of the picker).</summary>
    public static IReadOnlyList<ThemeDefinition> All()
    {
        return Listed;
    }

    public static ThemeDefinition? Get(string id)
    {
        return Registry.GetValueOrDefault(id);
    }

    /// <summary><c>system</c> follows the OS light/dark setting; an unknown id falls back to light.</summary>
    public static ThemeDefinition Resolve(string id, bool? systemDark)
    {
        var effective =
            id == System ? (systemDark == true ? "dark" : "light") : id;
        return Registry.GetValueOrDefault(effective) ?? Registry["light"];
    }

    private static string Hex(Color c)
    {
        return $"#{c.R:X2}{c.G:X2}{c.B:X2}";
    }

    private static Dictionary<string, string> Label(string en, string zh)
    {
        return new Dictionary<string, string> {
            ["en"] = en,
            ["zh-CN"] = zh
        };
    }

    /// <summary>The accent of a dark theme with neutral surfaces, as the "dark-*" themes of the React Native app.</summary>
    private static ThemeSeed NeutralDark(string id, string en, string zh,
        string accent,
        string bubbleOut, string onAccent, string selected, string badge)
    {
        var a = ThemeColor.Hex(accent);
        return new ThemeSeed {
            Id = id,
            Label = Label(en, zh),
            Dark = true,
            Accent = accent,
            BubbleOut = bubbleOut,
            Bg = "#141414",
            BgSecondary = "#1F1F1F",
            ChatBg = "#0D0D0D",
            BubbleIn = "#1F1F1F",
            Overrides = c => c with {
                OnAccent = ThemeColor.Hex(onAccent),
                Selected = ThemeColor.Hex(selected),
                Badge = ThemeColor.Hex(badge),
                ServiceChip = ThemeColor.Rgba(0, 0, 0, 0.6),
                MentionBg = ThemeColor.Rgba(a.R, a.G, a.B, 0.26),
                MentionHighlight = ThemeColor.Rgba(a.R, a.G, a.B, 0.15),
            },
        };
    }

    private static void RegisterBuiltIn()
    {
        Register(Define(new ThemeSeed {
            Id = "light",
            Label = Label("Light", "浅色"),
            Dark = false,
            Accent = "#3390EC",
            ChatBg = "#E5EBF0",
            BgSecondary = "#F2F2F7",
        }));
        Register(Define(new ThemeSeed {
            Id = "dark",
            Label = Label("Dark", "深色"),
            Dark = true,
            Accent = "#4DA3F7",
            Bg = "#1C1C1E",
            BgSecondary = "#2C2C2E",
            ChatBg = "#0E1621",
            BubbleIn = "#212D3B",
            BubbleOut = "#2B5278",
            Overrides = c => c with {
                Selected = ThemeColor.Hex("#2B5278"),
                Badge = ThemeColor.Hex("#3E88F7"),
            },
        }));
        Register(Define(new ThemeSeed {
            Id = "midnight",
            Label = Label("Midnight", "午夜"),
            Dark = true,
            Accent = "#5AA9FF",
            Bg = "#000000",
            BgSecondary = "#1A1A1C",
            ChatBg = "#000000",
            BubbleIn = "#1C1C1E",
            BubbleOut = "#1F4E85",
        }));
        Register(Define(new ThemeSeed {
            Id = "ocean",
            Label = Label("Ocean", "海洋"),
            Dark = true,
            Accent = "#3CC4C4",
            Bg = "#0F1C24",
            BgSecondary = "#17293A",
            ChatBg = "#0A141B",
        }));
        Register(Define(NeutralDark("dark-green", "Dark Green", "暗绿", "#00BC7D",
            "#078357",
            "#0B1F17", "#0B8A5C", "#02B377")));
        Register(Define(NeutralDark("dark-yellow", "Dark Yellow", "暗黄",
            "#F0B100", "#A97C07",
            "#241A00", "#B1820B", "#E5A902")));
        Register(Define(NeutralDark("dark-pink", "Dark Pink", "暗粉", "#FF8CB0",
            "#C46B87",
            "#2A1119", "#B4627B", "#F486A8")));
        Register(Define(NeutralDark("dark-violet", "Dark Violet", "紫罗兰黑",
            "#A695E7", "#7F72B1",
            "#1B1524", "#7A6DAA", "#9E8EDD")));
        Register(Define(new ThemeSeed {
            Id = "forest",
            Label = Label("Forest", "森林"),
            Dark = false,
            Accent = "#3E9B5F",
            ChatBg = "#DDE9D8",
            BgSecondary = "#F1F5EE",
            BubbleOut = "#DCF8C6",
            Overrides = c => c with {
                BubbleOutText = ThemeColor.Hex("#16311F"),
                BubbleOutMeta = ThemeColor.Rgba(22, 49, 31, 0.55),
            },
        }));
        Register(Define(new ThemeSeed {
            Id = "sakura",
            Label = Label("Sakura", "樱花"),
            Dark = false,
            Accent = "#E5588A",
            ChatBg = "#F6E6EC",
            BgSecondary = "#FBF1F4",
        }));
        Register(Define(new ThemeSeed {
            Id = "light-violet",
            Label = Label("Light Violet", "紫罗兰亮色"),
            Dark = false,
            Accent = "#7C5CD6",
            ChatBg = "#EFE9FA",
            BgSecondary = "#F5F1FC",
            BubbleOut = "#7C5CD6",
        }));
    }
}
