using System.Net;
using System.Text.Json.Nodes;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class RegistrationTests {
    private sealed class Script(params RegisterReply[] replies) : IRegisterTransport {
        public readonly List<JsonObject> Sent = [];
        private int next;

        public Task<RegisterReply> Post(JsonObject body)
        {
            Sent.Add(body);
            return Task.FromResult(replies[next++]);
        }
    }

    private static RegisterReply Reply(int status, string json)
    {
        return new RegisterReply(status, (JsonObject)JsonNode.Parse(json)!);
    }

    private static readonly JsonObject Base = new() {
        ["username"] = "new",
        ["password"] = "pw"
    };

    private static async Task<EngineErrorCode> Failure(Script script, string? token = null)
    {
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            Registration.Run(script, Base, token)
        );
        return e.Code;
    }

    [Fact]
    public async Task A_server_that_wants_nothing_more_makes_the_account_at_once()
    {
        var script = new Script(Reply(200, """{"user_id":"@new:s"}"""));
        var res = await Registration.Run(script, Base, null);
        Assert.Equal(200, res.Status);
        Assert.Single(script.Sent);
    }

    [Fact]
    public async Task The_dummy_step_is_answered_with_the_session()
    {
        var script = new Script(
            Reply(401, """{"session":"S","flows":[{"stages":["m.login.dummy"]}]}"""),
            Reply(200, """{"user_id":"@new:s"}""")
        );
        await Registration.Run(script, Base, null);
        var auth = script.Sent[1]["auth"]!;
        Assert.Equal("m.login.dummy", (string?)auth["type"]);
        Assert.Equal("S", (string?)auth["session"]);
        Assert.Equal("new", (string?)script.Sent[1]["username"]);
    }

    [Fact]
    public async Task The_token_is_sent_trimmed_in_its_own_step()
    {
        var script = new Script(
            Reply(401,
                """{"session":"S","flows":[{"stages":["m.login.registration_token","m.login.dummy"]}]}"""),
            Reply(401, """{"session":"S","completed":["m.login.registration_token"],"flows":[]}"""),
            Reply(200, """{"user_id":"@new:s"}""")
        );
        await Registration.Run(script, Base, " tok ");
        Assert.Equal("tok", (string?)script.Sent[1]["auth"]!["token"]);
        Assert.Equal("m.login.dummy", (string?)script.Sent[2]["auth"]!["type"]);
    }

    [Fact]
    public async Task A_wanted_token_is_told_apart_from_other_demands()
    {
        var token = """{"flows":[{"stages":["m.login.registration_token","m.login.dummy"]}]}""";
        var captcha = """{"flows":[{"stages":["m.login.recaptcha"]}]}""";
        Assert.Equal(EngineErrorCode.TokenRequired, await Failure(new Script(Reply(401, token))));
        Assert.Equal(EngineErrorCode.Unsupported, await Failure(new Script(Reply(401, captcha))));
        Assert.Equal(EngineErrorCode.Unsupported,
            await Failure(new Script(Reply(401, captcha)), "t"));
    }

    [Fact]
    public async Task A_refused_token_is_invalid()
    {
        var script = new Script(
            Reply(401, """{"session":"S","flows":[{"stages":["m.login.registration_token"]}]}"""),
            Reply(401, """{"session":"S","error":"bad","flows":[]}""")
        );
        Assert.Equal(EngineErrorCode.TokenInvalid, await Failure(script, "x"));
    }

    [Fact]
    public async Task Refusals_are_mapped_by_the_matrix_error()
    {
        Assert.Equal(EngineErrorCode.Conflict,
            await Failure(new Script(Reply(400, """{"errcode":"M_USER_IN_USE"}"""))));
        Assert.Equal(EngineErrorCode.Forbidden,
            await Failure(new Script(Reply(403, """{"errcode":"M_FORBIDDEN"}"""))));
        Assert.Equal(EngineErrorCode.Unknown, await Failure(new Script(Reply(500, "{}"))));
    }
}

public class ErrorMappingTests {
    [Theory]
    [InlineData("UnknownToken", null, true, "", EngineErrorCode.Unauthorized)]
    [InlineData("UserInUse", null, true, "", EngineErrorCode.Conflict)]
    [InlineData(null, "M_LIMIT_EXCEEDED", true, "", EngineErrorCode.RateLimited)]
    [InlineData(null, null, false, "error sending request for url", EngineErrorCode.Network)]
    [InlineData(null, null, false, "dns error: failed to lookup", EngineErrorCode.Network)]
    [InlineData(null, null, true, "timed out", EngineErrorCode.Unknown)]
    [InlineData(null, null, false, "something odd", EngineErrorCode.Unknown)]
    public void Maps(string? kind, string? code, bool fromServer, string text,
        EngineErrorCode expected)
    {
        Assert.Equal(expected, ErrorMapping.Map(kind, code, fromServer, text));
    }
}

public class HomeserverAddressTests {
    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> answer)
        : HttpMessageHandler {
        public readonly List<string> Urls = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Urls.Add(request.RequestUri!.ToString());
            return Task.FromResult(answer(request));
        }
    }

    private static HttpResponseMessage Json(string body)
    {
        return new HttpResponseMessage(HttpStatusCode.OK) {
            Content = new StringContent(body)
        };
    }

    [Fact]
    public async Task Typed_http_is_taken_literally()
    {
        var handler = new Handler(_ => Json("{}"));
        Assert.Equal("http://localhost:8008",
            await HomeserverAddress.Resolve(" http://localhost:8008/ ", new HttpClient(handler)));
        Assert.Empty(handler.Urls);
    }

    [Fact]
    public async Task A_bare_name_follows_the_well_known()
    {
        var handler = new Handler(_ =>
            Json("""{"m.homeserver":{"base_url":"https://matrix-client.matrix.org/"}}"""));
        Assert.Equal("https://matrix-client.matrix.org",
            await HomeserverAddress.Resolve("matrix.org", new HttpClient(handler)));
        Assert.Equal(["https://matrix.org/.well-known/matrix/client"], handler.Urls);
    }

    [Fact]
    public async Task Without_a_well_known_the_name_is_used_over_https()
    {
        var handler = new Handler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        Assert.Equal("https://example.org",
            await HomeserverAddress.Resolve("https://example.org/", new HttpClient(handler)));
    }

    [Fact]
    public async Task An_explicit_path_is_the_address()
    {
        var handler = new Handler(_ => Json("{}"));
        Assert.Equal("https://example.org/matrix",
            await HomeserverAddress.Resolve("https://example.org/matrix/",
                new HttpClient(handler)));
        Assert.Empty(handler.Urls);
    }
}
