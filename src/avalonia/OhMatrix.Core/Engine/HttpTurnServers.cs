using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using OhMatrix.Core.Calls;
using OhMatrix.Core.Model;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Engine;

/// <summary>The TURN servers the homeserver offers for calls (<c>/voip/turnServer</c>); none when it offers none or cannot be asked.</summary>
public sealed class HttpTurnServers(
    Func<Session?> session,
    HttpClient? http = null) {
    private static readonly Logger logger = Logger.GetDefault();

    private readonly HttpClient web = http ?? new HttpClient();

    public async Task<IReadOnlyList<IceServer>> Get()
    {
        var account = session();
        if (account == null)
            return [];
        try {
            var request = new HttpRequestMessage(
                HttpMethod.Get,
                account.Homeserver.TrimEnd('/') +
                "/_matrix/client/v3/voip/turnServer"
            );
            request.Headers.Authorization =
                new AuthenticationHeaderValue("Bearer", account.AccessToken);
            using var response = await web.SendAsync(request);
            if (!response.IsSuccessStatusCode)
                return [];
            if (JsonNode.Parse(await response.Content.ReadAsStringAsync()) is
                    not JsonObject body
                || body["uris"] is not JsonArray uris)
                return [];
            var urls = uris.Select(u => (string?)u)
                .Where(u => !string.IsNullOrEmpty(u))
                .Select(u => u!).ToList();
            if (urls.Count == 0)
                return [];
            return [
                new IceServer(urls, (string?)body["username"],
                    (string?)body["password"])
            ];
        } catch (Exception e) when (e is HttpRequestException
                                        or System.Text.Json.JsonException) {
            logger.Exception("HttpTurnServers", e);
            return [];
        }
    }
}
