using System.Text.RegularExpressions;

namespace OhMatrix.Core.Model;

/// <summary>What was typed for a server, as its name (<c>serverName.ts</c>): a link or an address is cut down to the host.</summary>
public static partial class ServerName {
    [GeneratedRegex("^[a-z]+://")]
    private static partial Regex SchemeRegex();

    [GeneratedRegex("^[@#!][^:]*:")]
    private static partial Regex SigilRegex();

    [GeneratedRegex("[/?#].*$")]
    private static partial Regex TailRegex();

    [GeneratedRegex(@"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$")]
    private static partial Regex HostRegex();

    /// <summary>The server name (<c>kde.org</c>, with a port if it has one), or null when the text is not one.</summary>
    public static string? Parse(string typed)
    {
        var host = typed.Trim().ToLowerInvariant();
        host = SchemeRegex().Replace(host, "");
        host = SigilRegex().Replace(host, "");
        host = TailRegex().Replace(host, "");
        return HostRegex().IsMatch(host) ? host : null;
    }
}
