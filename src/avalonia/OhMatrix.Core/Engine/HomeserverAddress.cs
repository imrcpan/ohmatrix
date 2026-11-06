using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace OhMatrix.Core.Engine;

/// <summary>Turns what the person typed into the address of the client API (<c>resolveHomeserver</c> of the TypeScript core).</summary>
public static partial class HomeserverAddress {
    /// <summary>
    /// Plain http is never assumed: it is used only when typed. <c>http://...</c> is taken literally; a bare name or <c>https://name</c> is looked up
    /// through <c>.well-known/matrix/client</c> (how servers delegate), and when that is missing or unusable the name is used over https.
    /// </summary>
    public static async Task<string> Resolve(string input, HttpClient http)
    {
        var typed = input.Trim();
        if (typed.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            return typed.TrimEnd('/');
        var rest = Scheme().Replace(typed, "");
        var host = Path().Replace(rest, "");
        var fallback = Scheme().IsMatch(typed) && HasPath().IsMatch(rest)
            ? typed.TrimEnd('/')
            : $"https://{host}";
        if (fallback != $"https://{host}")
            return fallback;
        try {
            using var res = await http.GetAsync($"https://{host}/.well-known/matrix/client");
            if (res.IsSuccessStatusCode) {
                var json = JsonNode.Parse(await res.Content.ReadAsStringAsync());
                var url = json?["m.homeserver"]?["base_url"];
                if (url is JsonValue v && v.TryGetValue<string>(out var s) && Http().IsMatch(s))
                    return s.TrimEnd('/');
            }
        } catch (Exception e) when (e is HttpRequestException or TaskCanceledException
                                        or System.Text.Json.JsonException) {
            // Offline or no well-known: fall back.
        }

        return fallback;
    }

    [GeneratedRegex("^https://", RegexOptions.IgnoreCase)]
    private static partial Regex Scheme();

    [GeneratedRegex("/.*$")]
    private static partial Regex Path();

    [GeneratedRegex("/.+")]
    private static partial Regex HasPath();

    [GeneratedRegex("^https?://", RegexOptions.IgnoreCase)]
    private static partial Regex Http();
}
