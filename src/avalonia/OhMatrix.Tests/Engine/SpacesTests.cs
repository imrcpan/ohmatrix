using System.Net;
using System.Text;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class SpacesTests {
    private sealed class Handler : HttpMessageHandler {
        public readonly List<string> Seen = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? ""
                : await request.Content.ReadAsStringAsync(cancellationToken);
            var path = Uri.UnescapeDataString(request.RequestUri!.PathAndQuery);
            Seen.Add($"{request.Method} {path} {body}");
            var json = path.Contains("/hierarchy")
                ? "{\"rooms\":[{\"room_id\":\"!sp:s\",\"children_state\":["
                  + "{\"state_key\":\"!a:s\",\"content\":{\"order\":\"1\",\"via\":[\"s\"]}},"
                  + "{\"state_key\":\"!b:s\",\"content\":{\"order\":\"4\",\"via\":[\"s\"]}}]}]}"
                : path.EndsWith("/createRoom")
                    ? "{\"room_id\":\"!new:s\"}"
                    : "{}";
            return new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new StringContent(json, Encoding.UTF8,
                    "application/json")
            };
        }
    }

    private static (HttpSpacesEngine, Handler) Make()
    {
        var handler = new Handler();
        return (new HttpSpacesEngine(
            () => new Session("https://hs/", "@me:s", "D", "t"),
            new HttpClient(handler)), handler);
    }

    [Fact]
    public async Task A_space_is_created_with_the_space_type()
    {
        var (engine, handler) = Make();
        Assert.Equal("!new:s", await engine.CreateSpace("Team"));
        Assert.Contains("\"type\":\"m.space\"", handler.Seen[0]);
    }

    [Fact]
    public async Task
        A_child_is_added_last_with_its_parent_recorded_and_moved_first()
    {
        var (engine, handler) = Make();
        await engine.AddChild("!sp:s", "!c:s");
        Assert.Contains(handler.Seen, l =>
            l.Contains(
                "PUT /_matrix/client/v3/rooms/!sp:s/state/m.space.child/!c:s")
            && l.Contains("\"order\":\"5\""));
        Assert.Contains(handler.Seen,
            l => l.Contains("/rooms/!c:s/state/m.space.parent/!sp:s"));
        handler.Seen.Clear();
        await engine.MoveChild("!sp:s", "!b:s", true);
        Assert.Contains(handler.Seen,
            l => l.Contains("m.space.child/!b:s") &&
                 l.Contains("\"order\":\"-1\""));
        handler.Seen.Clear();
        await engine.RemoveChild("!sp:s", "!a:s");
        Assert.Contains(handler.Seen,
            l => l.Contains("m.space.child/!a:s") && l.EndsWith("{}"));
    }
}
