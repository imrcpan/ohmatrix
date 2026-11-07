using System.Text.RegularExpressions;
using OhMatrix.Core.Model;

namespace OhMatrix.Core.Ui;

/// <summary>Why something could not be done, in words for the person: a known cause by what it means, and for anything else what the server said, so that a notice is never just "failed" (<c>failureReason</c>).</summary>
public static class Failure {
    public static string Reason(Exception e, Func<string, string> t)
    {
        var whole = e.Message.Trim();
        var at = whole.LastIndexOf("Caused by:", StringComparison.Ordinal);
        var said = (at >= 0 ? whole[(at + 10)..] : whole).Trim();
        if (e is EngineException { Code: EngineErrorCode.TooLarge })
            return t("sticker.reason.large");
        if (e is EngineException { Code: EngineErrorCode.UnsupportedType })
            return t("sticker.reason.type");
        if (Regex.IsMatch(said, @"too.?large|payload too large|\b413\b|exceeds? .*(size|limit)",
                RegexOptions.IgnoreCase))
            return t("avatar.reason.large");
        if (e is EngineException engine) {
            switch (engine.Code) {
                case EngineErrorCode.Network:
                    return t("avatar.reason.network");
                case EngineErrorCode.Forbidden:
                    return t("avatar.reason.forbidden");
                case EngineErrorCode.RateLimited:
                    return t("avatar.reason.rate");
                case EngineErrorCode.Unauthorized:
                    return t("avatar.reason.auth");
                case EngineErrorCode.Unsupported:
                    return t("avatar.reason.unsupported");
                case EngineErrorCode.NotFound:
                    return t("avatar.reason.notFound");
            }
        }

        return said.Length > 0 ? said[..Math.Min(160, said.Length)] : t("avatar.reason.unknown");
    }
}
