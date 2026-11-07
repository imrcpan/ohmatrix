using System.Text.RegularExpressions;
using OhMatrix.Core.Model;

namespace OhMatrix.Core.Engine;

/// <summary>Turns what the SDK threw into the one error type engines let out (<c>errors.ts</c> of the TypeScript engine).</summary>
public static partial class ErrorMapping {
    private static readonly Dictionary<string, EngineErrorCode> ByKind = new() {
        ["UnknownToken"] = EngineErrorCode.Unauthorized,
        ["MissingToken"] = EngineErrorCode.Unauthorized,
        ["Forbidden"] = EngineErrorCode.Forbidden,
        ["LimitExceeded"] = EngineErrorCode.RateLimited,
        ["NotFound"] = EngineErrorCode.NotFound,
        ["UserInUse"] = EngineErrorCode.Conflict,
        ["RoomInUse"] = EngineErrorCode.Conflict,
        ["Unrecognized"] = EngineErrorCode.Unsupported,
    };

    private static readonly Dictionary<string, EngineErrorCode> ByCode = new() {
        ["M_UNKNOWN_TOKEN"] = EngineErrorCode.Unauthorized,
        ["M_MISSING_TOKEN"] = EngineErrorCode.Unauthorized,
        ["M_FORBIDDEN"] = EngineErrorCode.Forbidden,
        ["M_LIMIT_EXCEEDED"] = EngineErrorCode.RateLimited,
        ["M_NOT_FOUND"] = EngineErrorCode.NotFound,
        ["M_USER_IN_USE"] = EngineErrorCode.Conflict,
        ["M_ROOM_IN_USE"] = EngineErrorCode.Conflict,
        ["M_UNRECOGNIZED"] = EngineErrorCode.Unsupported,
    };

    /// <summary>What a failure that never got an answer from the server looks like (no network, DNS, TLS, timeouts).</summary>
    [GeneratedRegex(
        "(error sending request|connection (refused|reset|closed)|timed? ?out|dns|failed to lookup|network is unreachable|unreachable|offline|ssl|tls|certificate)",
        RegexOptions.IgnoreCase
    )]
    private static partial Regex Network();

    /// <summary>
    /// An answer of the homeserver is mapped by its Matrix error (<paramref name="kind"/> is the name of the variant, <paramref name="code"/> the
    /// <c>M_...</c> code); anything else that looks like a failure to reach it is <c>Network</c>; the rest is <c>Unknown</c>.
    /// </summary>
    public static EngineErrorCode Map(string? kind, string? code,
        bool fromServer, string text)
    {
        if (kind is not null && ByKind.TryGetValue(kind, out var byKind))
            return byKind;
        if (code is not null && ByCode.TryGetValue(code, out var byCode))
            return byCode;
        if (!fromServer && Network().IsMatch(text))
            return EngineErrorCode.Network;
        return EngineErrorCode.Unknown;
    }
}
