using System.Net;
using System.Text;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class HttpLinkPreviewEngineTests {
    private sealed class Handler(Func<string, (HttpStatusCode, string)> answer)
        : HttpMessageHandler {
        public readonly List<string> Seen = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            Seen.Add(request.RequestUri!.PathAndQuery);
            var (status, text) = answer(request.RequestUri.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(status) {
                Content = new StringContent(text, Encoding.UTF8, "application/json")
            });
        }
    }

    private static readonly Session Me = new("https://hs.example", "@me:hs", "D", "tok");

    [Fact]
    public void Reads_the_open_graph_fields()
    {
        var p = HttpLinkPreviewEngine.Parse("https://e.com", """
                                                             {"og:title":"Hello","og:description":"World","og:site_name":"E","og:image":"mxc://s/i",
                                                              "og:image:width":800,"og:image:height":400}
                                                             """)!;
        Assert.Equal(("Hello", "World", "E", "mxc://s/i"),
            (p.Title, p.Description, p.SiteName, p.Image));
        Assert.Equal((800, 400), (p.ImageWidth, p.ImageHeight));
        Assert.Null(HttpLinkPreviewEngine.Parse("https://e.com", """{"og:url":"x"}"""));
        Assert.Null(HttpLinkPreviewEngine.Parse("https://e.com", "not json"));
    }

    [Fact]
    public async Task Falls_back_to_the_old_route_and_gives_up_on_errors()
    {
        var handler = new Handler(path => path.StartsWith("/_matrix/client/v1")
            ? (HttpStatusCode.NotFound, "{}")
            : (HttpStatusCode.OK, """{"og:title":"T"}"""));
        var engine = new HttpLinkPreviewEngine(() => Me, new HttpClient(handler));
        Assert.Equal("T", (await engine.Preview("https://e.com/a b"))!.Title);
        Assert.Equal(2, handler.Seen.Count);
        Assert.Contains("url=https%3A%2F%2Fe.com%2Fa%20b", handler.Seen[1]);
        var refused = new HttpLinkPreviewEngine(
            () => Me, new HttpClient(new Handler(_ => (HttpStatusCode.Forbidden, "{}"))));
        Assert.Null(await refused.Preview("https://e.com"));
    }
}
