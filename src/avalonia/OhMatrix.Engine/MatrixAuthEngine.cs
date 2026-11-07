#if OHMATRIX_NATIVE_SDK
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Nodes;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;
using JsonValue = System.Text.Json.Nodes.JsonValue;
using Session = OhMatrix.Core.Model.Session;
using SdkSession = uniffi.matrix_sdk_ffi.Session;

namespace OhMatrix.Engine;

/// <summary>The sign-in part of the engine over the Matrix SDK (<c>auth</c> of <c>RustEngineCore</c>): the client it makes is kept for the rest of the engine.</summary>
public sealed class MatrixAuthEngine(
    string dataDirectory,
    HttpClient? http = null) : IAuthEngine {
    private const string DeviceName = "OhMatrix Desktop";

    private readonly HttpClient web = http ?? new HttpClient();

    /// <summary>The signed-in client, or null.</summary>
    public Client? Client { get; private set; }

    /// <summary>The session of the client now (its token may have been renewed), or null when signed out.</summary>
    public Session? CurrentSession =>
        Client is { } c ? ToSession(c.Session()) : null;

    public async Task<Session> LoginWithPassword(string homeserver,
        string username,
        string password)
    {
        try {
            var client =
                await MakeClient(
                    await HomeserverAddress.Resolve(homeserver, web));
            await client.Login(username, password, DeviceName, null);
            Client = client;
            return ToSession(client.Session());
        } catch (Exception e) when (e is not EngineException) {
            throw Translate(e);
        }
    }

    public async Task<Session> Register(string homeserver, string username,
        string password,
        string? token)
    {
        try {
            var url = await HomeserverAddress.Resolve(homeserver, web);
            var transport = new HttpRegisterTransport(web, url);
            var res = await Registration.Run(
                transport,
                new JsonObject {
                    ["username"] = username,
                    ["password"] = password,
                    ["initial_device_display_name"] = DeviceName,
                },
                token
            );
            var userId = Text(res.Body, "user_id");
            var deviceId = Text(res.Body, "device_id");
            var accessToken = Text(res.Body, "access_token");
            if (userId is null || deviceId is null || accessToken is null) {
                throw new EngineException(
                    EngineErrorCode.Unknown,
                    "The server did not sign the new account in."
                );
            }

            var session = new Session(url, userId, deviceId, accessToken);
            await Restore(session);
            return session;
        } catch (Exception e) when (e is not EngineException) {
            throw Translate(e);
        }
    }

    public async Task Restore(Session session)
    {
        try {
            var client = await MakeClient(session.Homeserver);
            await client.RestoreSession(
                new SdkSession(
                    session.AccessToken,
                    session.Native,
                    session.UserId,
                    session.DeviceId,
                    session.Homeserver,
                    null,
                    SlidingSyncVersion.Native
                )
            );
            Client = client;
        } catch (Exception e) when (e is not EngineException) {
            throw Translate(e);
        }
    }

    public async Task Logout()
    {
        var client = Client;
        Client = null;
        if (client is null)
            return;
        try {
            await client.Logout();
        } catch (Exception e) {
            // The device is forgotten here either way; a server that cannot be asked keeps it until the person removes it.
            if (e is not (ClientException or ClientBuildException))
                throw;
        } finally {
            client.Dispose();
        }
    }

    private async Task<Client> MakeClient(string homeserverUrl)
    {
        return await new ClientBuilder()
            .HomeserverUrl(homeserverUrl)
            .SlidingSyncVersionBuilder(SlidingSyncVersionBuilder.DiscoverNative)
            .SessionPaths(
                Path.Combine(dataDirectory, "sdk", "data"),
                Path.Combine(dataDirectory, "sdk", "cache")
            )
            .Build();
    }

    // The refresh token, if the server uses them, is kept in Session.Native.
    private static Session ToSession(SdkSession s)
    {
        return new Session(s.HomeserverUrl, s.UserId, s.DeviceId, s.AccessToken,
            s.RefreshToken);
    }

    private static string? Text(JsonObject body, string key)
    {
        return body[key] is JsonValue v && v.TryGetValue<string>(out var s)
            ? s
            : null;
    }

    /// <summary>What the SDK threw, as the one error type of an engine.</summary>
    public static EngineException Translate(Exception e)
    {
        switch (e) {
            case ClientException.MatrixApi api: {
                var kind = api.kind switch {
                    ErrorKind.UnknownToken => "UnknownToken",
                    ErrorKind.MissingToken => "MissingToken",
                    ErrorKind.Forbidden => "Forbidden",
                    ErrorKind.LimitExceeded => "LimitExceeded",
                    ErrorKind.NotFound => "NotFound",
                    ErrorKind.UserInUse => "UserInUse",
                    ErrorKind.RoomInUse => "RoomInUse",
                    ErrorKind.Unrecognized => "Unrecognized",
                    _ => null,
                };
                return new EngineException(
                    ErrorMapping.Map(kind, api.code, true, api.msg),
                    api.msg,
                    e
                );
            }
            case ClientException.Generic generic:
                return new EngineException(
                    ErrorMapping.Map(null, null, false,
                        $"{generic.msg} {generic.details}"),
                    generic.msg,
                    e
                );
            default:
                return new EngineException(
                    ErrorMapping.Map(null, null, false, e.Message),
                    e.Message,
                    e
                );
        }
    }

    private sealed class HttpRegisterTransport(
        HttpClient http,
        string homeserver)
        : IRegisterTransport {
        public async Task<RegisterReply> Post(JsonObject body)
        {
            try {
                using var content = new StringContent(
                    body.ToJsonString(),
                    Encoding.UTF8,
                    "application/json"
                );
                using var res = await http.PostAsync(
                    homeserver.TrimEnd('/') + "/_matrix/client/v3/register",
                    content
                );
                JsonObject json;
                try {
                    json =
                        JsonNode.Parse(await res.Content.ReadAsStringAsync()) as
                            JsonObject
                        ?? new JsonObject();
                } catch (System.Text.Json.JsonException) {
                    json = new JsonObject();
                }

                return new RegisterReply((int)res.StatusCode, json);
            } catch (HttpRequestException e) {
                throw new EngineException(EngineErrorCode.Network, e.Message,
                    e);
            } catch (TaskCanceledException e) {
                throw new EngineException(EngineErrorCode.Network, e.Message,
                    e);
            }
        }
    }
}
#endif
