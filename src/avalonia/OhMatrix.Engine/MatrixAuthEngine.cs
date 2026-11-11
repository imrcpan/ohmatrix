#if OHMATRIX_NATIVE_SDK
using System.Text;
using System.Text.Json.Nodes;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using OhMatrix.Infra.Logging;
using uniffi.matrix_sdk_ffi;
using JsonValue = System.Text.Json.Nodes.JsonValue;
using Session = OhMatrix.Core.Model.Session;
using SdkSession = uniffi.matrix_sdk_ffi.Session;

namespace OhMatrix.Engine;

/// <summary>The sign-in part of the engine over the Matrix SDK (<c>auth</c> of <c>RustEngineCore</c>): the client it makes is kept for the rest of the engine.</summary>
public sealed class MatrixAuthEngine(
    string dataDirectory,
    HttpClient? http = null) : IAuthEngine {
    private static readonly Logger logger = Logger.GetDefault();

    private const string DeviceName = "OhMatrix Desktop";

    private readonly HttpClient web = http ?? new HttpClient();

    /// <summary>The signed-in client, or null.</summary>
    public Client? Client { get; private set; }

    /// <summary>The session of the client now (its token may have been renewed), or null when signed out.</summary>
    public Session? CurrentSession =>
        Client != null ? ToSession(Client.Session()) : null;

    public async Task<Session> LoginWithPassword(string homeserver,
        string username,
        string password)
    {
        try {
            var url = await HomeserverAddress.Resolve(homeserver, web);
            DropStore();
            return await WithFreshStoreOnMismatch(async () => {
                var client = await MakeClient(url);
                await client.Login(username, password, DeviceName, null);
                Client = client;
                return ToSession(client.Session());
            });
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
            if (userId == null || deviceId == null || accessToken == null) {
                throw new EngineException(
                    EngineErrorCode.Unknown,
                    "The server did not sign the new account in."
                );
            }

            var session = new Session(url, userId, deviceId, accessToken);
            DropStore();
            await Restore(session);
            return session;
        } catch (Exception e) when (e is not EngineException) {
            throw Translate(e);
        }
    }

    public async Task Restore(Session session)
    {
        try {
            await WithFreshStoreOnMismatch(async () => {
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
                return true;
            });
        } catch (Exception e) when (e is not EngineException) {
            throw Translate(e);
        }
    }

    // The store of the SDK can hold the keys of another device than the one
    // that is being signed in or restored ("the account in the store doesn't
    // match the account in the constructor"). The person cannot do anything
    // about that, so it is not shown: it is logged, the store is cleared and
    // the work is done again on a new one.
    private async Task<T> WithFreshStoreOnMismatch<T>(Func<Task<T>> work)
    {
        try {
            return await work();
        } catch (Exception e) when (IsStoreMismatch(e)) {
            logger.Warn(
                $"The crypto store belongs to another device, it is cleared: {e.Message}");
            DropStore();
            return await work();
        }
    }

    internal static bool IsStoreMismatch(Exception e)
    {
        var text = e.ToString();
        return text.Contains("MismatchedAccount",
                   StringComparison.Ordinal) ||
               text.Contains(
                   "doesn't match the account in the constructor",
                   StringComparison.Ordinal);
    }

    public async Task Logout()
    {
        var client = Client;
        Client = null;
        if (client == null)
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

    // A new sign-in is a new device, and the store of the SDK keeps the
    // keys of the device it was made for: of one that was signed out, or
    // whose sign-in did not end, it refuses the new one ("the account in
    // the store doesn't match the account in the constructor"). What is
    // there belongs to no session that is kept, so it goes. A restore needs
    // the store and does not come here.
    private void DropStore()
    {
        Client?.Dispose();
        Client = null;
        var folder = Path.Combine(dataDirectory, "sdk");
        if (Directory.Exists(folder))
            Directory.Delete(folder, true);
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
        logger.Error($"Engine error: {e}");
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
