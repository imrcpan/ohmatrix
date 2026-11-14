using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using OhMatrix.Core.Model;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Engine;

/// <summary>My status line, kept in a custom field of the profile (<c>account.ts</c> of the Rust engine package); the same field the web app uses.</summary>
public sealed class ProfileStatusApi(
    Func<Session?> session,
    HttpClient? http = null) {
    private static readonly Logger logger = Logger.GetDefault();

    /// <summary>The custom profile field the status line lives in.</summary>
    public const string Field = "com.ohmatrix.status";

    private readonly HttpClient web = http ?? new HttpClient();

    private static string Url(Session a)
    {
        return a.Homeserver.TrimEnd('/') + "/_matrix/client/v3/profile/"
                                         + Uri.EscapeDataString(a.UserId);
    }

    private async Task<(HttpStatusCode Status, JsonObject Body)> Send(
        HttpMethod method,
        string url,
        Session a,
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
            } catch (System.Text.Json.JsonException e) {
                logger.Caught("read the status answer", e);
                parsed = new JsonObject();
            }

            return (response.StatusCode, parsed);
        } catch (HttpRequestException e) {
            throw new EngineException(EngineErrorCode.Network, e.Message);
        }
    }

    /// <summary>My status, or null when there is none or the server keeps none.</summary>
    public async Task<string?> Read()
    {
        var a = session();
        if (a == null)
            return null;
        try {
            var (status, body) = await Send(HttpMethod.Get, Url(a), a);
            return status == HttpStatusCode.OK && body[Field] is JsonValue v
                                               && v.TryGetValue<string>(
                                                   out var s) && s.Length > 0
                ? s
                : null;
        } catch (EngineException e) {
            logger.Caught("get the status", e);
            return null;
        }
    }

    /// <summary>Sets the status; empty clears it. A server without custom profile fields refuses as <see cref="EngineErrorCode.Unsupported"/>.</summary>
    public async Task Write(string status)
    {
        var a = session() ??
                throw new EngineException(EngineErrorCode.Unauthorized,
                    "Not signed in.");
        var text = status.Trim();
        var url = Url(a) + "/" + Field;
        var (code, body) = text.Length > 0
            ? await Send(HttpMethod.Put, url, a, new JsonObject {
                [Field] = text
            })
            : await Send(HttpMethod.Delete, url, a);
        if ((int)code is >= 200 and < 300)
            return;
        var errcode = body["errcode"] is JsonValue e &&
                      e.TryGetValue<string>(out var ec)
            ? ec
            : null;
        if (errcode == "M_UNRECOGNIZED" || code is HttpStatusCode.NotFound
                or HttpStatusCode.MethodNotAllowed)
            throw new EngineException(EngineErrorCode.Unsupported,
                "This server does not support profile status.");
        var message = body["error"] is JsonValue m &&
                      m.TryGetValue<string>(out var ms)
            ? ms
            : "Could not set the status.";
        throw new EngineException(
            code == HttpStatusCode.Forbidden
                ? EngineErrorCode.Forbidden
                : EngineErrorCode.Unknown,
            message
        );
    }
}
