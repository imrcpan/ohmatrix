using System.Net;
using System.Text;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class HttpDevicesEngineTests {
    private sealed class Handler(
        Func<HttpRequestMessage, string, (HttpStatusCode, string)> answer)
        : HttpMessageHandler {
        public readonly List<string> Seen = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            var body = request.Content is null
                ? ""
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Seen.Add(
                $"{request.Method} {request.RequestUri!.AbsolutePath} {body}");
            Assert.Equal("Bearer tok",
                request.Headers.Authorization!.ToString());
            var (status, text) = answer(request, body);
            return new HttpResponseMessage(status) {
                Content = new StringContent(text, Encoding.UTF8,
                    "application/json")
            };
        }
    }

    private static readonly Session Me = new("https://hs.example/", "@me:hs",
        "D1", "tok");

    private static HttpDevicesEngine Make(Handler handler)
    {
        return new HttpDevicesEngine(() => Me, new HttpClient(handler));
    }

    [Fact]
    public async Task Lists_this_session_first_then_the_latest()
    {
        var engine = Make(new Handler((_, _) => (HttpStatusCode.OK, """
            {"devices":[
              {"device_id":"A","display_name":"Old","last_seen_ts":1000,"last_seen_ip":"::ffff:10.0.0.1"},
              {"device_id":"D1","display_name":"","last_seen_ts":5},
              {"device_id":"B","display_name":"New","last_seen_ts":9000}]}
            """)));
        var list = await engine.ListDevices();
        Assert.Equal(["D1", "B", "A"], list.Select(d => d.Id));
        Assert.True(list[0].Current);
        Assert.Equal("D1", list[0].Name);
        Assert.Equal("10.0.0.1", list[2].LastSeenIp);
    }

    [Fact]
    public async Task Signing_out_answers_the_password_step()
    {
        var handler = new Handler((_, body) => body.Contains("\"auth\"")
            ? (HttpStatusCode.OK, "{}")
            : (HttpStatusCode.Unauthorized, """{"session":"S1","flows":[]}"""));
        await Make(handler).RemoveDevices(["A", "B"], "secret");
        Assert.Equal(2, handler.Seen.Count);
        Assert.Contains("/_matrix/client/v3/delete_devices", handler.Seen[1]);
        Assert.Contains("\"password\":\"secret\"", handler.Seen[1]);
        Assert.Contains("\"session\":\"S1\"", handler.Seen[1]);
        Assert.Contains("\"user\":\"me\"", handler.Seen[1]);
    }

    [Fact]
    public async Task A_wrong_password_is_forbidden()
    {
        var engine = Make(new Handler((_, body) => body.Contains("\"auth\"")
            ? (HttpStatusCode.Unauthorized,
                """{"errcode":"M_FORBIDDEN","error":"Invalid password"}""")
            : (HttpStatusCode.Unauthorized, """{"session":"S1"}""")));
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            engine.RemoveDevices(["A"], "bad"));
        Assert.Equal(EngineErrorCode.Forbidden, e.Code);
    }
}
