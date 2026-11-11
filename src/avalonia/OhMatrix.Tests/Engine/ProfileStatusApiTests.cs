using System.Net;
using System.Text;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class ProfileStatusApiTests {
    private sealed class Handler(
        Func<HttpMethod, (HttpStatusCode, string)> answer)
        : HttpMessageHandler {
        public readonly List<string> Seen = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            var body = request.Content == null
                ? ""
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Seen.Add(
                $"{request.Method} {request.RequestUri!.AbsolutePath} {body}");
            var (status, text) = answer(request.Method);
            return new HttpResponseMessage(status) {
                Content = new StringContent(text, Encoding.UTF8,
                    "application/json")
            };
        }
    }

    private static readonly Session Me = new("https://hs.example", "@me:hs",
        "D", "tok");

    private static ProfileStatusApi Make(Handler h)
    {
        return new ProfileStatusApi(() => Me, new HttpClient(h));
    }

    [Fact]
    public async Task Reads_the_status_field_of_the_profile()
    {
        var api = Make(new Handler(_ => (HttpStatusCode.OK,
            """{"displayname":"Me","com.ohmatrix.status":"Coding"}""")));
        Assert.Equal("Coding", await api.Read());
        var none = Make(new Handler(_ =>
            (HttpStatusCode.OK, """{"displayname":"Me"}""")));
        Assert.Null(await none.Read());
    }

    [Fact]
    public async Task Writes_with_put_and_clears_with_delete()
    {
        var h = new Handler(_ => (HttpStatusCode.OK, "{}"));
        var api = Make(h);
        await api.Write("  Busy ");
        await api.Write("   ");
        Assert.Equal(
            "PUT /_matrix/client/v3/profile/%40me%3Ahs/com.ohmatrix.status {\"com.ohmatrix.status\":\"Busy\"}",
            h.Seen[0]);
        Assert.StartsWith(
            "DELETE /_matrix/client/v3/profile/%40me%3Ahs/com.ohmatrix.status",
            h.Seen[1]);
    }

    [Fact]
    public async Task A_server_without_custom_fields_is_unsupported()
    {
        var api = Make(new Handler(_ => (HttpStatusCode.BadRequest,
            """{"errcode":"M_UNRECOGNIZED","error":"x"}""")));
        var e = await Assert.ThrowsAsync<EngineException>(() =>
            api.Write("hi"));
        Assert.Equal(EngineErrorCode.Unsupported, e.Code);
    }
}
