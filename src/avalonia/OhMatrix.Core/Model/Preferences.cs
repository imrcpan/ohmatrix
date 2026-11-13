namespace OhMatrix.Core.Model;

/// <summary>Settings chosen by the person, kept per device (<c>Preferences</c> of the TypeScript core, with the same defaults).</summary>
public sealed record Preferences {
    /// <summary>A registered theme id, or <c>system</c> to follow the OS.</summary>
    public string Theme { get; init; } = "system";

    /// <summary>The interface language; null detects it from the system.</summary>
    public string? Locale { get; init; }

    /// <summary>The chat list width in px in landscape; null is automatic.</summary>
    public double? SidebarWidth { get; init; }

    /// <summary>The zoom of the whole interface (1 is 100%).</summary>
    public double UiScale { get; init; } = 1;

    public bool Notifications { get; init; }
    public bool NotificationPreview { get; init; } = true;

    /// <summary>My messages wear the accent of the theme.</summary>
    public bool OwnBubbleAccent { get; init; } = true;

    public bool PushEnabled { get; init; } = true;

    /// <summary>The notice over the chats that asks to set up or verify the encryption is not shown; pressing its buttons turns it on, and the advanced settings turn it off.</summary>
    public bool EncryptionReminderOff { get; init; }

    public bool PullToRefresh { get; init; }

    /// <summary>The server last signed in to, offered again on the sign-in screen.</summary>
    public string? LastHomeserver { get; init; }

    /// <summary>
    /// My name and picture as they were last loaded, shown at once when the app starts for the same account; the server's are asked for, and
    /// replace them when they come.
    /// </summary>
    public Profile? CachedProfile { get; init; }

    /// <summary>Servers added to Explore by name, in the order they were added.</summary>
    public IReadOnlyList<string> ExploreServers { get; init; } = [];

    /// <summary>The name of an installed font for the interface; null is the system's own.</summary>
    public string? Font { get; init; }

    /// <summary>
    /// The font of the English texts: null follows the general font, an empty name is the system's own, and any other is that installed font.
    /// </summary>
    public string? EnglishFont { get; init; }

    /// <summary>The font of the texts in the other languages, chosen the same way as <see cref="EnglishFont"/>.</summary>
    public string? OtherFont { get; init; }

    /// <summary>The font of the monospaced texts (the log); null is the system's monospace font.</summary>
    public string? MonoFont { get; init; }

    /// <summary>The weights of Light, Normal and Bold texts, as the CSS numbers (100 to 900).</summary>
    public int LightWeight { get; init; } = 300;

    public int NormalWeight { get; init; } = 400;

    public int BoldWeight { get; init; } = 700;

    /// <summary>The folder files are kept in when saved; null asks each time.</summary>
    public string? DownloadFolder { get; init; }

    public string? StickerGroup { get; init; }

    /// <summary>The emoji used last, newest first (at most 24): the picker shows them first.</summary>
    public IReadOnlyList<string> RecentEmoji { get; init; } = [];
}
