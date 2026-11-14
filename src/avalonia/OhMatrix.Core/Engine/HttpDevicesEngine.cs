using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Engine;

/// <summary>The sessions of the account over the client-server API of the homeserver (<c>devices.ts</c> of the Rust engine package).</summary>
public sealed class HttpDevicesEngine(
    Func<Session?> session,
    HttpClient? http = null)
    : IDevicesEngine {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly HttpClient web = http ?? new HttpClient();

    private Session Account()
    {
        return session() ??
               throw new EngineException(EngineErrorCode.Unauthorized,
                   "Not signed in.");
    }

    private static string Base(Session a)
    {
        return a.Homeserver.TrimEnd('/') + "/_matrix/client/v3";
    }

    private async Task<(HttpStatusCode Status, JsonObject Body)> Ask(
        Session a,
        string url,
        HttpMethod method,
        JsonObject? body = null
    )
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization =
            new AuthenticationHeaderValue("Bearer", a.AccessToken);
        if (body != null)
            request.Content =
                new StringContent(body.ToJsonString(), Encoding.UTF8,
                    "application/json");
        try {
            using var response = await web.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            JsonObject parsed;
            try {
                parsed = JsonNode.Parse(text) as JsonObject ?? new JsonObject();
            } catch (JsonException e) {
                logger.Exception("HttpDevicesEngine", e);
                parsed = new JsonObject();
            }

            return (response.StatusCode, parsed);
        } catch (HttpRequestException e) {
            throw new EngineException(EngineErrorCode.Network, e.Message);
        }
    }

    private static string? Text(JsonObject o, string key)
    {
        return o[key] is JsonValue v && v.TryGetValue<string>(out var s)
            ? s
            : null;
    }

    public async Task<IReadOnlyList<DeviceInfo>> ListDevices()
    {
        var a = Account();
        var (status, body) = await Ask(a, Base(a) + "/devices", HttpMethod.Get);
        if (status != HttpStatusCode.OK)
            throw new EngineException(
                status == HttpStatusCode.Unauthorized
                    ? EngineErrorCode.Unauthorized
                    : EngineErrorCode.Unknown,
                Text(body, "error") ?? "Could not list the sessions."
            );
        var list = new List<DeviceInfo>();
        if (body["devices"] is JsonArray devices) {
            foreach (var node in devices) {
                if (node is not JsonObject d)
                    continue;
                var id = Text(d, "device_id");
                if (id == null)
                    continue;
                var name = Text(d, "display_name");
                var ip = Text(d, "last_seen_ip")?.Replace("::ffff:", "");
                long? seen = d["last_seen_ts"] is JsonValue t &&
                             t.TryGetValue<long>(out var ts)
                    ? ts
                    : null;
                list.Add(new DeviceInfo(
                    id,
                    string.IsNullOrEmpty(name) ? id : name,
                    seen,
                    string.IsNullOrEmpty(ip) ? null : ip,
                    id == a.DeviceId
                ));
            }
        }

        return [
            .. list.OrderByDescending(d => d.Current)
                .ThenByDescending(d => d.LastSeenTs ?? 0)
        ];
    }

    public async Task RemoveDevices(IReadOnlyList<string> ids, string password)
    {
        if (ids.Count == 0)
            return;
        var a = Account();
        var url = Base(a) + "/delete_devices";

        JsonObject Devices()
        {
            return new JsonObject {
                ["devices"] = new JsonArray([
                    .. ids.Select(i => (JsonNode?)JsonValue.Create(i))
                ])
            };
        }

        var (status, body) = await Ask(a, url, HttpMethod.Post, Devices());
        if (status == HttpStatusCode.OK)
            return;
        var flow = Text(body, "session");
        if (status != HttpStatusCode.Unauthorized || flow == null)
            throw new EngineException(
                EngineErrorCode.Unknown,
                Text(body, "error") ?? "Could not sign the sessions out."
            );
        var user = a.UserId.TrimStart('@').Split(':')[0];
        var answer = Devices();
        answer["auth"] = new JsonObject {
            ["type"] = "m.login.password",
            ["identifier"] = new JsonObject {
                ["type"] = "m.id.user",
                ["user"] = user
            },
            ["password"] = password,
            ["session"] = flow,
        };
        (status, body) = await Ask(a, url, HttpMethod.Post, answer);
        if (status == HttpStatusCode.OK)
            return;
        throw new EngineException(
            status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                ? EngineErrorCode.Forbidden
                : EngineErrorCode.Unknown,
            Text(body, "error") ?? "Could not sign the sessions out."
        );
    }
}
