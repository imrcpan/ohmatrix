using System.Text.Json.Nodes;
using OhMatrix.Core.Model;

namespace OhMatrix.Core.Engine;

/// <summary>One answer of a server to a registration request: the HTTP status and the JSON it sent back.</summary>
public sealed record RegisterReply(int Status, JsonObject Body);

/// <summary>Sends one registration request (<c>/_matrix/client/v3/register</c>) and gives back the reply. A failure to reach the server is <see cref="EngineErrorCode.Network"/>.</summary>
public interface IRegisterTransport {
    Task<RegisterReply> Post(JsonObject body);
}

/// <summary>Creating an account with a username and a password (<c>registration.ts</c> of the TypeScript core).</summary>
public static class Registration {
    private const string Dummy = "m.login.dummy";
    private const string Token = "m.login.registration_token";

    /// <summary>
    /// Which of the steps a server offers can be done here: the dummy step, and the registration token step when a token was typed. An e-mail
    /// address, a captcha or terms to accept are more than a form can answer. A flow that uses the token is taken when there is one.
    /// </summary>
    public static RegistrationPlan Plan(
        IReadOnlyList<IReadOnlyList<string>> flows, bool hasToken)
    {
        var allowed = hasToken
            ? new[] {
                Dummy, Token
            }
            : [Dummy];
        var doable = flows.Where(f => f.All(allowed.Contains)).ToList();
        var pick =
            (hasToken ? doable.FirstOrDefault(f => f.Contains(Token)) : null)
            ?? doable.FirstOrDefault();
        if (pick != null)
            return new RegistrationPlan(pick, null);
        if (!hasToken && flows.Any(f => f.All(s => s is Dummy or Token)))
            return new RegistrationPlan(null, EngineErrorCode.TokenRequired);
        return new RegistrationPlan(null, EngineErrorCode.Unsupported);
    }

    /// <summary>
    /// Asks once, and when the server answers with the steps it wants, does them one after the other. Returns the reply that made the account.
    /// Throws <see cref="EngineException"/>: <c>Unsupported</c>, <c>TokenRequired</c>, <c>TokenInvalid</c>, <c>Conflict</c> (taken), <c>Forbidden</c>.
    /// </summary>
    public static async Task<RegisterReply> Run(
        IRegisterTransport transport,
        JsonObject baseBody,
        string? token
    )
    {
        var hasToken = !string.IsNullOrWhiteSpace(token);
        var res = await transport.Post(Copy(baseBody));
        if (res.Status != 401 || res.Body["flows"] is not JsonArray flows) {
            if (res.Status is < 200 or >= 300)
                throw Failed(res);
            return res;
        }

        var plan = Plan(ReadFlows(flows), hasToken);
        var problem = plan.Problem;
        if (problem != null) {
            throw new EngineException(
                problem.Value,
                problem == EngineErrorCode.TokenRequired
                    ? "This server needs a registration token to create an account."
                    : "This server needs more than a username and password to register."
            );
        }

        var session = res.Body["session"] is JsonValue s &&
                      s.TryGetValue<string>(out var sv)
            ? sv
            : null;
        var done = new HashSet<string>(Strings(res.Body["completed"]));
        foreach (var stage in plan.Stages!) {
            if (done.Contains(stage))
                continue;
            var auth = new JsonObject {
                ["type"] = stage
            };
            if (stage == Token)
                auth["token"] = token!.Trim();
            if (session != null)
                auth["session"] = session;
            var body = Copy(baseBody);
            body["auth"] = auth;
            res = await transport.Post(body);
            if (res.Status is >= 200 and < 300)
                return res;
            var completed = Strings(res.Body["completed"]).ToList();
            // The token step not completed after it was tried: the token is not valid (a server may also refuse it outright).
            if (stage == Token && !completed.Contains(Token)) {
                throw new EngineException(
                    EngineErrorCode.TokenInvalid,
                    Text(res.Body, "error") ??
                    "The registration token is not valid."
                );
            }

            if (res.Status != 401)
                throw Failed(res);
            foreach (var c in completed)
                done.Add(c);
        }

        throw Failed(res);
    }

    private static JsonObject Copy(JsonObject o)
    {
        return (JsonObject)o.DeepClone();
    }

    private static List<IReadOnlyList<string>> ReadFlows(JsonArray flows)
    {
        var list = new List<IReadOnlyList<string>>();
        foreach (var f in flows)
            list.Add(Strings(f?["stages"]).ToList());
        return list;
    }

    private static IEnumerable<string> Strings(JsonNode? node)
    {
        if (node is not JsonArray array)
            yield break;
        foreach (var item in array) {
            if (item is JsonValue v && v.TryGetValue<string>(out var s))
                yield return s;
        }
    }

    private static string? Text(JsonObject body, string key)
    {
        return body[key] is JsonValue v && v.TryGetValue<string>(out var s)
            ? s
            : null;
    }

    private static EngineException Failed(RegisterReply res)
    {
        var code = Text(res.Body, "errcode");
        return new EngineException(
            code switch {
                "M_USER_IN_USE" => EngineErrorCode.Conflict,
                "M_FORBIDDEN" => EngineErrorCode.Forbidden,
                _ => EngineErrorCode.Unknown,
            },
            Text(res.Body, "error") ?? "could not register"
        );
    }
}

/// <summary>The steps to do, or why none can be done.</summary>
public sealed record RegistrationPlan(
    IReadOnlyList<string>? Stages,
    EngineErrorCode? Problem);
