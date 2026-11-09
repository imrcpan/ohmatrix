using System.Net;
using System.Text;
using OhMatrix.Core.Engine;
using OhMatrix.Core.Model;
using Xunit;

namespace OhMatrix.Tests.Engine;

public class SearchTests {
    private sealed class Handler : HttpMessageHandler {
        public string? Url;
        public string? Body;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Url = request.RequestUri!.PathAndQuery;
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK) {
                Content = new StringContent("""
                                            {"search_categories":{"room_events":{"next_batch":"n2","results":[
                                              {"result":{"event_id":"$1","room_id":"!r:s","sender":"@ann:s","origin_server_ts":5,
                                               "content":{"body":"the budget is ready"}},
                                               "context":{"profile_info":{"@ann:s":{"displayname":"Ann Lee"}}}}]}}}
                                            """, Encoding.UTF8,
                    "application/json")
            };
        }
    }

    [Fact]
    public async Task
        The_server_search_is_asked_for_a_room_and_a_page_and_read()
    {
        var handler = new Handler();
        var engine = new HttpSearchEngine(
            () => new Session("https://hs/", "@me:s", "D", "t"),
            _ => null, new HttpClient(handler));
        var page = await engine.Messages(" budget ", "!r:s", "n1");
        Assert.Contains("next_batch=n1", handler.Url);
        Assert.Contains("\"search_term\":\"budget\"", handler.Body);
        Assert.Contains("!r:s", handler.Body);
        var hit = Assert.Single(page.Results);
        Assert.Equal(("$1", "Ann Lee", "the budget is ready"),
            (hit.EventId, hit.SenderName, hit.Text));
        Assert.Equal("n2", page.Next);
    }

    [Fact]
    public void A_snippet_puts_the_hit_in_context()
    {
        var s = Snippet.Make(
            "A very long line of words that talks about the Budget for next year and more",
            "budget", 10);
        Assert.Equal("Budget", s.Match);
        Assert.StartsWith("...", s.Before);
        Assert.EndsWith("...", s.After);
        Assert.Equal("", Snippet.Make("short", "zzz").Match);
    }

    [Fact]
    public void A_snippet_collapses_white_space_as_the_regular_expression_did()
    {
        // What the first version did, kept here to compare with.
        static string Old(string s) =>
            System.Text.RegularExpressions.Regex.Replace(s, @"\s+", " ")
                .Trim();

        string[] texts = [
            "", " ", "a", "a b", "a  b", " a b ", "a\tb\nc\r\nd", "\n\n x \n",
            "a\u00a0b", "a\u2003\u2003b", "\u3000a\u3000", "a\u0085b",
            "a\u200bb", "x \v y \f z", "  Budget   for\nnext   year  ",
        ];
        foreach (var text in texts) {
            var s = Snippet.Make(text, "zzz", 1000);
            Assert.Equal(Old(text), s.After);
        }

        var hit =
            Snippet.Make("the  budget\n\nis   ready", " Budget\tis ", 100);
        Assert.Equal("budget is", hit.Match);
        Assert.Equal("the ", hit.Before);
        Assert.Equal(" ready", hit.After);
    }
}
