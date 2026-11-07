using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Core.Engine;

/// <summary>Spaces over the client-server API (<c>spaces.ts</c> of the Rust engine package): a child is the <c>m.space.child</c> state of the space, with the parent recorded in the child.</summary>
public sealed class HttpSpacesEngine(
    Func<Session?> session,
    HttpClient? http = null) : ISpacesEngine {
    private readonly HttpClient web = http ?? new HttpClient();

    private Session Account() =>
        session() ?? throw new EngineException(EngineErrorCode.Unauthorized,
            "Not signed in.");

    private async Task<(HttpStatusCode, JsonNode?)> Send(Session a,
        HttpMethod method, string path,
        JsonNode? body = null)
    {
        var request =
            new HttpRequestMessage(method, a.Homeserver.TrimEnd('/') + path);
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", a.AccessToken);
        if (body is not null)
            request.Content = new StringContent(body.ToJsonString(),
                Encoding.UTF8, "application/json");
        try {
            using var response = await web.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            JsonNode? parsed = null;
            try {
                parsed = JsonNode.Parse(text);
            } catch (System.Text.Json.JsonException) {
                // No usable body.
            }

            return (response.StatusCode, parsed);
        } catch (HttpRequestException e) {
            throw new EngineException(EngineErrorCode.Network, e.Message);
        }
    }

    private static string Domain(Session a)
    {
        var at = a.UserId.IndexOf(':');
        return at >= 0 ? a.UserId[(at + 1)..] : "";
    }

    private async Task Put(Session a, string room, string type, string key,
        JsonObject content)
    {
        var (status, _) = await Send(a, HttpMethod.Put,
            $"/_matrix/client/v3/rooms/{Uri.EscapeDataString(room)}/state/{Uri.EscapeDataString(type)}/{Uri.EscapeDataString(key)}",
            content);
        if (status != HttpStatusCode.OK)
            throw new EngineException(
                status == HttpStatusCode.Forbidden
                    ? EngineErrorCode.Forbidden
                    : EngineErrorCode.Unknown,
                "Could not change the space.");
    }

    /// <summary>The children listed by the space with their order and servers, in the order the space gives them.</summary>
    private async Task<List<(string RoomId, string? Order, JsonNode? Via)>>
        Children(Session a, string spaceId)
    {
        var (status, body) = await Send(a, HttpMethod.Get,
            $"/_matrix/client/v1/rooms/{Uri.EscapeDataString(spaceId)}/hierarchy?limit=100&max_depth=1");
        if (status != HttpStatusCode.OK)
            throw new EngineException(
                status is HttpStatusCode.NotFound or HttpStatusCode.Forbidden
                    ? EngineErrorCode.NotFound
                    : EngineErrorCode.Unknown,
                "Could not read the space.");
        var space = body?["rooms"]?.AsArray()
            .FirstOrDefault(r => (string?)r?["room_id"] == spaceId);
        var kids = new List<(string, string?, JsonNode?)>();
        foreach (var c in space?["children_state"]?.AsArray() ?? []) {
            var via = c?["content"]?["via"];
            if (via is JsonArray { Count: > 0 } &&
                (string?)c?["state_key"] is { } id)
                kids.Add((id, (string?)c?["content"]?["order"], via));
        }

        return kids;
    }

    /// <summary>The order that puts a child first or last among those listed (numbers, as a space made here writes them).</summary>
    public static string OrderFor(
        IEnumerable<(string RoomId, string? Order)> kids, string roomId,
        bool first)
    {
        var others = kids.Where(k => k.RoomId != roomId)
            .Select(k => double.TryParse(k.Order,
                System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var n)
                ? (double?)n
                : null)
            .OfType<double>().ToList();
        var value = first
            ? Math.Min(0, others.DefaultIfEmpty(0).Min()) - 1
            : Math.Max(0, others.DefaultIfEmpty(0).Max()) + 1;
        return value.ToString(System.Globalization.CultureInfo
            .InvariantCulture);
    }

    public async Task<string> CreateSpace(string name)
    {
        var a = Account();
        var (status, body) = await Send(a, HttpMethod.Post,
            "/_matrix/client/v3/createRoom",
            new JsonObject {
                ["name"] = name,
                ["preset"] = "private_chat",
                ["creation_content"] = new JsonObject {
                    ["type"] = "m.space"
                },
                ["power_level_content_override"] = new JsonObject {
                    ["events_default"] = 100,
                    ["invite"] = 50
                },
            });
        if (status != HttpStatusCode.OK ||
            (string?)body?["room_id"] is not { } id)
            throw new EngineException(EngineErrorCode.Unknown,
                "Could not create the space.");
        return id;
    }

    public async Task AddChild(string spaceId, string roomId)
    {
        var a = Account();
        var order =
            OrderFor(
                (await Children(a, spaceId)).Select(k => (k.RoomId, k.Order)),
                roomId, false);
        await Put(a, spaceId, "m.space.child", roomId, new JsonObject {
            ["order"] = order,
            ["via"] = new JsonArray(Domain(a))
        });
        // The child records its parent too, so clients can nest it in a tree without reading the space.
        try {
            await Put(a, roomId, "m.space.parent", spaceId, new JsonObject {
                ["via"] = new JsonArray(Domain(a))
            });
        } catch (EngineException) {
            // A room I cannot change keeps no record; the space still lists it.
        }
    }

    public async Task RemoveChild(string spaceId, string roomId)
    {
        var a = Account();
        await Put(a, spaceId, "m.space.child", roomId, []);
        try {
            await Put(a, roomId, "m.space.parent", spaceId, []);
        } catch (EngineException) {
            // See AddChild.
        }
    }

    public async Task MoveChild(string spaceId, string roomId, bool first)
    {
        var a = Account();
        var kids = await Children(a, spaceId);
        var current = kids.FirstOrDefault(k => k.RoomId == roomId);
        if (current.RoomId is null)
            throw new EngineException(EngineErrorCode.NotFound,
                "The room is not in the space.");
        await Put(a, spaceId, "m.space.child", roomId, new JsonObject {
            ["order"] = OrderFor(kids.Select(k => (k.RoomId, k.Order)), roomId,
                first),
            ["via"] = current.Via!.DeepClone()
        });
    }
}
