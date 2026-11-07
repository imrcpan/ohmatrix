using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Nodes;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Engine;

/// <summary>Link previews over the media API of the homeserver (<c>preview_url</c>), the authenticated route first and the old one when it is not there.</summary>
public sealed class HttpLinkPreviewEngine(
    Func<Session?> session,
    HttpClient? http = null)
    : ILinkPreviewEngine {
    private readonly HttpClient web = http ?? new HttpClient();

    public async Task<LinkPreview?> Preview(string url)
    {
        if (session() is not { } a)
            return null;
        var root = a.Homeserver.TrimEnd('/');
        var query = "?url=" + Uri.EscapeDataString(url);
        foreach (var path in new[] {
                     "/_matrix/client/v1/media/preview_url",
                     "/_matrix/media/v3/preview_url"
                 }) {
            var request =
                new HttpRequestMessage(HttpMethod.Get, root + path + query);
            request.Headers.Authorization =
                new AuthenticationHeaderValue("Bearer", a.AccessToken);
            try {
                using var response = await web.SendAsync(request);
                if (response.StatusCode is HttpStatusCode.NotFound
                    or HttpStatusCode.MethodNotAllowed)
                    continue;
                if (!response.IsSuccessStatusCode)
                    return null;
                return Parse(url, await response.Content.ReadAsStringAsync());
            } catch (HttpRequestException) {
                return null;
            }
        }

        return null;
    }

    /// <summary>The open-graph fields of an answer; null when it holds no title, description or picture.</summary>
    public static LinkPreview? Parse(string url, string json)
    {
        JsonObject? o;
        try {
            o = JsonNode.Parse(json) as JsonObject;
        } catch (JsonException) {
            return null;
        }

        if (o is null)
            return null;

        string? Str(string key)
        {
            return o[key] is JsonValue v && v.TryGetValue<string>(out var s)
                                         && !string.IsNullOrWhiteSpace(s)
                ? s
                : null;
        }

        int? Num(string key)
        {
            return o[key] is JsonValue v && v.TryGetValue<int>(out var n) &&
                   n > 0
                ? n
                : null;
        }

        var title = Str("og:title");
        var description = Str("og:description");
        var image = Str("og:image");
        if (title is null && description is null && image is null)
            return null;
        return new LinkPreview(
            url,
            title,
            description,
            Str("og:site_name"),
            image,
            Num("og:image:width"),
            Num("og:image:height")
        );
    }
}
