using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Engine;

/// <summary>Message search over <c>POST /search</c> of the client-server API. Rooms that are encrypted cannot be searched by the server.</summary>
public sealed class HttpSearchEngine(
    Func<Session?> session,
    Func<string, string?> roomName,
    HttpClient? http = null) : ISearchEngine {
    private readonly HttpClient web = http ?? new HttpClient();

    public async Task<SearchPage> Messages(string term, string? roomId,
        string? from)
    {
        var a = session() ??
                throw new EngineException(EngineErrorCode.Unauthorized,
                    "Not signed in.");
        var filter = new JsonObject {
            ["limit"] = 20
        };
        if (roomId is not null)
            filter["rooms"] = new JsonArray(roomId);
        var body = new JsonObject {
            ["search_categories"] = new JsonObject {
                ["room_events"] = new JsonObject {
                    ["search_term"] = term.Trim(),
                    ["keys"] = new JsonArray("content.body"),
                    ["order_by"] = "recent",
                    ["filter"] = filter,
                    ["event_context"] = new JsonObject {
                        ["before_limit"] = 0,
                        ["after_limit"] = 0
                    },
                }
            }
        };
        var url = a.Homeserver.TrimEnd('/') + "/_matrix/client/v3/search"
                                            + (from is null
                                                ? ""
                                                : "?next_batch=" +
                                                  Uri.EscapeDataString(from));
        var request = new HttpRequestMessage(HttpMethod.Post, url) {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8,
                "application/json")
        };
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", a.AccessToken);
        try {
            using var response = await web.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            if (response.StatusCode != HttpStatusCode.OK)
                throw new EngineException(
                    response.StatusCode == HttpStatusCode.Unauthorized
                        ? EngineErrorCode.Unauthorized
                        : EngineErrorCode.Unknown,
                    "Could not search.");
            var events =
                JsonNode.Parse(text)?["search_categories"]?["room_events"];
            var results = new List<SearchResult>();
            foreach (var hit in events?["results"]?.AsArray() ?? []) {
                var e = hit?["result"];
                var rid = (string?)e?["room_id"];
                var id = (string?)e?["event_id"];
                var msg = (string?)e?["content"]?["body"];
                if (rid is null || id is null || msg is null)
                    continue;
                var sender = (string?)e?["sender"] ?? "";
                var profile =
                    hit?["context"]?["profile_info"]?[sender]?["displayname"];
                results.Add(new SearchResult(id, rid, roomName(rid) ?? rid,
                    sender,
                    (string?)profile ?? ServiceText.PersonName(null, sender),
                    (long?)e?["origin_server_ts"] ?? 0, msg));
            }

            return new SearchPage(results,
                results.Count == 0 ? null : (string?)events?["next_batch"]);
        } catch (HttpRequestException e) {
            throw new EngineException(EngineErrorCode.Network, e.Message);
        }
    }
}
