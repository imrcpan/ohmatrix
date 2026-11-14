using System.Text.Json.Nodes;

namespace OhMatrix.Core.Model;

/// <summary>One sticker of my own pack (<c>im.ponies.user_emotes</c>, MSC2545).</summary>
public sealed record Sticker(
    string Shortcode,
    string Url,
    string MimeType,
    int? Width = null,
    int? Height = null,
    long? Size = null
);

/// <summary>A sticker group's cover: a standard emoji or a small picture.</summary>
public sealed record StickerIcon(
    string? Emoji,
    string? Url = null,
    string? MimeType = null) {
    public static StickerIcon OfEmoji(string emoji)
    {
        return new StickerIcon(emoji);
    }

    public static StickerIcon OfImage(string url, string mimeType)
    {
        return new StickerIcon(null, url, mimeType);
    }

    public bool IsEmoji => Emoji != null;
}

/// <summary>
/// A group of my stickers (kept in the account, so on every device): a name (empty = the default, "Group n"), a cover, and the stickers in it by
/// name, in order. A sticker is in one group at most.
/// </summary>
public sealed record StickerGroup(
    string Id,
    string Name,
    StickerIcon? Icon,
    IReadOnlyList<string> Stickers
);

/// <summary>The pack of stickers and its groups: what is read from the account data, what is written back, and how a group is changed (<c>stickerPack.ts</c>, <c>stickerGroups.ts</c>).</summary>
public static class StickerPack {
    /// <summary>The account data event my own pack lives in (MSC2545, as Element and Cinny write it).</summary>
    public const string PackEvent = "im.ponies.user_emotes";

    /// <summary>The account data event my sticker groups live in. Other clients do not read it: for them the pack is one list.</summary>
    public const string GroupsEvent = "org.ohmatrix.sticker_groups";

    /// <summary>The most one sticker may weigh (bytes): a larger file is refused, not shrunk.</summary>
    public const long MaxBytes = 3 * 1024 * 1024;

    /// <summary>The id of the group that stands first, always: the built-in emoji set (<see cref="BuiltinStickers"/>). It is not stored and cannot be changed or deleted.</summary>
    public const string BuiltinGroup = "builtin";

    /// <summary>The id of the group that holds the stickers that no group has (an older pack had them in an undeletable first group). It is shown only when it has some.</summary>
    public const string DefaultGroup = "default";

    /// <summary>The cover of a group when none was chosen and it has no sticker yet.</summary>
    public static StickerIcon FallbackCover { get; } =
        StickerIcon.OfImage(BuiltinStickers.Scheme + BuiltinStickers.Fallback,
            "image/png");

    /// <summary>The most groups a pack may have besides the default one.</summary>
    public const int GroupsMax = 12;

    private static int? Int(JsonNode? node)
    {
        return node is JsonValue v && v.TryGetValue<double>(out var d) &&
               double.IsFinite(d)
            ? (int)d
            : null;
    }

    private static long? Long(JsonNode? node)
    {
        return node is JsonValue v && v.TryGetValue<double>(out var d) &&
               double.IsFinite(d)
            ? (long)d
            : null;
    }

    private static string? Text(JsonNode? node)
    {
        return node is JsonValue v && v.TryGetValue<string>(out var s)
            ? s
            : null;
    }

    private static bool HasUsage(JsonNode? image, out bool sticker)
    {
        sticker = true;
        if (image?["usage"] is not JsonArray usage)
            return false;
        sticker = usage.Any(u => Text(u) == "sticker");
        return true;
    }

    /// <summary>The stickers of a pack's content, in the order the pack has them. Images the pack marks as emoticon-only are left out.</summary>
    public static IReadOnlyList<Sticker> Parse(string? content)
    {
        var images = Read(content)?["images"] as JsonObject;
        var list = new List<Sticker>();
        if (images == null)
            return list;
        foreach (var (shortcode, image) in images) {
            var url = Text(image?["url"]);
            if (url == null ||
                !url.StartsWith("mxc://", StringComparison.Ordinal))
                continue;
            HasUsage(image, out var sticker);
            if (!sticker)
                continue;
            var info = image?["info"];
            list.Add(new Sticker(shortcode, url,
                Text(info?["mimetype"]) ?? "image/png",
                Int(info?["w"]), Int(info?["h"]), Long(info?["size"])));
        }

        return list;
    }

    private static JsonObject? Read(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return null;
        try {
            return JsonNode.Parse(content) as JsonObject;
        } catch (System.Text.Json.JsonException) {
            return null;
        }
    }

    private static JsonObject Info(Sticker s)
    {
        var info = new JsonObject {
            ["mimetype"] = s.MimeType
        };
        var w = s.Width;
        if (w != null)
            info["w"] = w;
        var h = s.Height;
        if (h != null)
            info["h"] = h;
        var size = s.Size;
        if (size != null)
            info["size"] = size;
        return info;
    }

    /// <summary>
    /// The pack's content with <paramref name="stickers"/> as its images. The rest of what was there (the pack's name and picture, and the images
    /// that are only emoticons) is kept as it was, so another client's data is not lost.
    /// </summary>
    public static string Write(string? previous, IEnumerable<Sticker> stickers)
    {
        var old = Read(previous) ?? new JsonObject();
        var images = new JsonObject();
        if (old["images"] is JsonObject before) {
            foreach (var (code, image) in before) {
                if (HasUsage(image, out var sticker) && !sticker)
                    images[code] = image?.DeepClone();
            }
        }

        foreach (var s in stickers)
            images[s.Shortcode] = new JsonObject {
                ["url"] = s.Url,
                ["body"] = s.Shortcode,
                ["info"] = Info(s),
                ["usage"] = new JsonArray("sticker"),
            };
        old["images"] = images;
        return old.ToJsonString();
    }

    /// <summary>The content of the <c>m.sticker</c> event that sends <paramref name="s"/>.</summary>
    public static JsonObject EventContent(Sticker s)
    {
        return new JsonObject {
            ["body"] = s.Shortcode,
            ["url"] = s.Url,
            ["info"] = Info(s),
        };
    }

    /// <summary>A name for a new sticker from a file name or caption: no extension, no surrounding blanks, and not one the pack already has.</summary>
    public static string NewShortcode(string? name, ISet<string> taken)
    {
        var text =
            System.Text.RegularExpressions.Regex.Replace(name ?? "",
                @"\.[A-Za-z0-9]{1,5}$", "");
        text = string.Join(" ",
            text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        var baseName = text.Length > 40 ? text[..40].Trim() : text;
        if (baseName.Length == 0)
            baseName = "sticker";
        if (!taken.Contains(baseName))
            return baseName;
        for (var n = 2;; n++) {
            if (!taken.Contains($"{baseName} {n}"))
                return $"{baseName} {n}";
        }
    }

    private static readonly Dictionary<string, string> Kinds = new() {
        ["png"] = "image/png",
        ["jpg"] = "image/jpeg",
        ["jpeg"] = "image/jpeg",
        ["gif"] = "image/gif",
        ["webp"] = "image/webp",
    };

    /// <summary>
    /// The type of a file for the pack, or a refusal: only PNG, JPEG, GIF and WebP are taken, whatever else it is: SVG, video, a document. A file
    /// whose type the system did not give is told by its name's ending.
    /// </summary>
    public static string Mime(string? name, string mimeType)
    {
        var given = mimeType.ToLowerInvariant()
            .Replace("image/jpg", "image/jpeg");
        var ending = (name ?? "").Split('.').Last().ToLowerInvariant();
        Kinds.TryGetValue(ending, out var byName);
        var mime = Kinds.ContainsValue(given) ? given
            : given.Length == 0 || given == "application/octet-stream" ? byName
            : null;
        return mime ?? throw new EngineException(
            EngineErrorCode.UnsupportedType,
            "A sticker has to be a PNG, JPEG, GIF or WebP picture");
    }

    /// <summary>Refuses a file the pack may not hold: of a kind it does not take, or heavier than <see cref="MaxBytes"/>. Gives the file's type.</summary>
    public static string Check(string? name, string mimeType, long size)
    {
        var mime = Mime(name, mimeType);
        if (size > MaxBytes)
            throw new EngineException(EngineErrorCode.TooLarge,
                "The picture is over the 3 MB a sticker may be");
        return mime;
    }

    // ---- groups ----

    private static StickerIcon? IconOf(JsonNode? node)
    {
        var kind = Text(node?["kind"]);
        if (kind == "emoji" && Text(node?["emoji"]) is { Length: > 0 } emoji)
            return StickerIcon.OfEmoji(emoji);
        if (kind != "image")
            return null;
        var url = Text(node?["url"]);
        var mime = Text(node?["mimeType"]);
        if (url == null || !url.StartsWith("mxc://", StringComparison.Ordinal)
                        || mime == null)
            return null;
        return StickerIcon.OfImage(url, mime);
    }

    /// <summary>
    /// The groups a stored value holds, made safe: those without an id are dropped, a repeated id is dropped, so is a sticker named twice (it stays
    /// in the first group), and no more than <see cref="GroupsMax"/> are kept.
    /// </summary>
    public static IReadOnlyList<StickerGroup> ParseGroups(string? content)
    {
        var list = Read(content)?["groups"] as JsonArray;
        var ids = new HashSet<string>();
        var used = new HashSet<string>();
        var result = new List<StickerGroup>();
        if (list == null)
            return result;
        foreach (var g in list) {
            var id = Text(g?["id"]);
            if (string.IsNullOrEmpty(id) || !ids.Add(id))
                continue;
            var isDefault = id == DefaultGroup;
            if (!isDefault &&
                result.Count(x => x.Id != DefaultGroup) >= GroupsMax)
                continue;
            var stickers = (g?["stickers"] as JsonArray ?? [])
                .Select(Text).OfType<string>().Where(s => !used.Contains(s))
                .Distinct().ToList();
            foreach (var s in stickers)
                used.Add(s);
            result.Add(new StickerGroup(id, (Text(g?["name"]) ?? "").Trim(),
                IconOf(g?["icon"]), stickers));
        }

        return result;
    }

    /// <summary>The content to store for <paramref name="groups"/>; refuses what would be dropped or cut.</summary>
    public static string WriteGroups(IReadOnlyList<StickerGroup> groups)
    {
        // The built-in group is never stored.
        groups = groups.Where(g => g.Id != BuiltinGroup).ToList();
        if (groups.Count(g => g.Id != DefaultGroup) > GroupsMax)
            throw new EngineException(EngineErrorCode.Unsupported,
                $"At most {GroupsMax} groups");
        var array = new JsonArray();
        foreach (var g in groups) {
            var item = new JsonObject {
                ["id"] = g.Id,
                ["name"] = g.Name,
                ["stickers"] = new JsonArray(g.Stickers
                    .Select(s => (JsonNode?)JsonValue.Create(s))
                    .ToArray()),
            };
            var icon = g.Icon;
            if (icon != null)
                item["icon"] = icon.IsEmoji
                    ? new JsonObject {
                        ["kind"] = "emoji",
                        ["emoji"] = icon.Emoji
                    }
                    : new JsonObject {
                        ["kind"] = "image",
                        ["url"] = icon.Url,
                        ["mimeType"] = icon.MimeType
                    };
            array.Add(item);
        }

        var text = new JsonObject {
            ["groups"] = array
        }.ToJsonString();
        if (ParseGroups(text).Count != groups.Count)
            throw new EngineException(EngineErrorCode.Unknown,
                "The groups are not valid");
        return text;
    }

    /// <summary>The groups with these stickers taken out of them (after the stickers are removed from the pack).</summary>
    public static IReadOnlyList<StickerGroup> Without(
        IReadOnlyList<StickerGroup> groups,
        IEnumerable<string> shortcodes)
    {
        var gone = shortcodes.ToHashSet();
        return groups.Select(g => g.Stickers.Any(gone.Contains)
            ? g with {
                Stickers = g.Stickers.Where(s => !gone.Contains(s)).ToList()
            }
            : g).ToList();
    }

    /// <summary>A new group id that none of <paramref name="groups"/> has.</summary>
    public static string NewGroupId(IReadOnlyList<StickerGroup> groups,
        Random? random = null)
    {
        random ??= Random.Shared;
        var taken = groups.Select(g => g.Id).ToHashSet();
        while (true) {
            var value = random.NextInt64(0, 2176782336L);
            var digits = new char[6];
            for (var i = 5; i >= 0; i--, value /= 36)
                digits[i] =
                    "0123456789abcdefghijklmnopqrstuvwxyz"[(int)(value % 36)];
            var id = new string(digits);
            if (!taken.Contains(id))
                return id;
        }
    }

    /// <summary>What a group shows as its cover: the one chosen, else its first sticker (that is in the pack), else <see cref="FallbackCover"/>.</summary>
    public static StickerIcon CoverOf(StickerGroup group,
        IReadOnlyList<Sticker> pack)
    {
        var icon = group.Icon;
        if (icon != null)
            return icon;
        if (group.Id == BuiltinGroup)
            return StickerIcon.OfImage(
                BuiltinStickers.Scheme + BuiltinStickers.Cover, "image/png");
        var first = group.Stickers
            .Select(c => pack.FirstOrDefault(s => s.Shortcode == c))
            .FirstOrDefault(s => s != null);
        return first == null
            ? FallbackCover
            : StickerIcon.OfImage(first.Url, first.MimeType);
    }

    /// <summary>The list with the item at <paramref name="from"/> taken out and put where the item at <paramref name="to"/> was.</summary>
    public static List<T> MoveItem<T>(IReadOnlyList<T> list, int from, int to)
    {
        var result = list.ToList();
        if (from == to || from < 0 || to < 0 || from >= list.Count ||
            to >= list.Count)
            return result;
        var item = result[from];
        result.RemoveAt(from);
        result.Insert(to, item);
        return result;
    }

    /// <summary>
    /// The groups as the screen shows them: the built-in set first, then the
    /// stored ones without a sticker the pack no longer has. The stickers that
    /// no group has (those of an older pack's first group) are in the group
    /// <see cref="DefaultGroup"/>, which is shown only while it has some.
    /// </summary>
    public static IReadOnlyList<StickerGroup> WithDefault(
        IReadOnlyList<StickerGroup> stored,
        IReadOnlyList<Sticker> pack)
    {
        var have = pack.Select(s => s.Shortcode).ToHashSet();
        var others = stored.Where(g => g.Id != BuiltinGroup)
            .Select(g => g with {
                Stickers = g.Stickers.Where(have.Contains).ToList()
            }).ToList();
        var taken = others.Where(g => g.Id != DefaultGroup)
            .SelectMany(g => g.Stickers).ToHashSet();
        var mine = others.FirstOrDefault(g => g.Id == DefaultGroup);
        var listed = (mine?.Stickers ?? []).Where(c => !taken.Contains(c))
            .ToList();
        var rest = pack.Select(s => s.Shortcode)
            .Where(c => !taken.Contains(c) && !listed.Contains(c));
        List<string> loose = [.. listed, .. rest];
        var kept = others.Where(g => g.Id != DefaultGroup).ToList();
        if (loose.Count > 0) {
            var group = (mine ?? new StickerGroup(DefaultGroup, "", null, []))
                with {
                    Stickers = loose
                };
            var at = mine == null ? kept.Count : others.IndexOf(mine);
            kept.Insert(Math.Min(at, kept.Count), group);
        }

        var first = new StickerGroup(BuiltinGroup, "", null,
            [.. BuiltinStickers.All.Select(s => s.Shortcode)]);
        return [first, .. kept];
    }

    /// <summary>
    /// The groups with sticker <paramref name="code"/> in group <paramref name="groupId"/> (at the end) and in no other. The default group holds
    /// what no group has, so putting a sticker there takes it out of the others; an id that is no group leaves them as they are.
    /// </summary>
    public static IReadOnlyList<StickerGroup> Place(
        IReadOnlyList<StickerGroup> groups, string code,
        string groupId)
    {
        if (groupId != DefaultGroup && groups.All(g => g.Id != groupId))
            return groups.ToList();
        return groups.Select(g => {
            var rest = g.Stickers.Where(x => x != code).ToList();
            return g.Id == groupId
                ? g with {
                    Stickers = [.. rest, code]
                }
                : rest.Count == g.Stickers.Count
                    ? g
                    : g with {
                        Stickers = rest
                    };
        }).ToList();
    }
}
