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
    public bool PullToRefresh { get; init; }

    /// <summary>The server last signed in to, offered again on the sign-in screen.</summary>
    public string? LastHomeserver { get; init; }

    /// <summary>Servers added to Explore by name, in the order they were added.</summary>
    public IReadOnlyList<string> ExploreServers { get; init; } = [];

    /// <summary>The name of an installed font for the interface; null is the system's own.</summary>
    public string? Font { get; init; }

    public string? StickerGroup { get; init; }
}
