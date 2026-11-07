using System.Globalization;
using OhMatrix.Core.I18n;
using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

public enum SidebarPage {
    Chats,
    Profile,
    Theme,
    Language,
    Explore,
    Settings,
    Sessions,
    Encryption,
    Space,
    Advanced,
    Logs,
}

public enum AuthStatus {
    Booting,
    SignedOut,
    SigningIn,
    SignedIn,
}

/// <summary>What the screens show (<c>AppState</c> of the TypeScript state package). Grows with the screens.</summary>
public sealed record AppState {
    public AuthStatus Auth { get; init; } = AuthStatus.Booting;
    public string? AuthError { get; init; }

    /// <summary>Why the sign-in failed, so that the screen can word it in the language of the person.</summary>
    public EngineErrorCode? AuthErrorCode { get; init; }

    public string? UserId { get; init; }
    public string? Homeserver { get; init; }
    public Preferences Prefs { get; init; } = new();

    /// <summary>
    /// A zoom being tried: the interface is drawn at <see cref="ZoomTrial.To"/> while Settings asks to keep it, and goes back to
    /// <see cref="ZoomTrial.From"/> when <see cref="ZoomTrial.Until"/> comes. It is not a preference: it is never saved, and <c>Prefs.UiScale</c>
    /// stays what is kept.
    /// </summary>
    public ZoomTrial? ZoomTrial { get; init; }

    /// <summary>The public rooms being joined; a big room on another server can take a long while.</summary>
    public IReadOnlyList<JoiningRoom> Joining { get; init; } = [];

    /// <summary>Why the last join failed, until it is dismissed.</summary>
    public string? JoinError { get; init; }

    /// <summary>The chat list, in the order it is shown: pinned first, then the latest activity first.</summary>
    public IReadOnlyList<RoomSummary> Rooms { get; init; } = [];

    /// <summary>Who I am on the server; null until it has been read.</summary>
    public Profile? Profile { get; init; }

    public SyncState SyncState { get; init; } = SyncState.Stopped;

    /// <summary>
    /// The first load of the list is over: it has been still for a moment once syncing, or a while has passed. Until then grey rows stand
    /// where the chats will be.
    /// </summary>
    public bool RoomsSettled { get; init; }

    /// <summary>The short message at the top of the screen, if there is one.</summary>
    public Notice? Notice { get; init; }

    /// <summary>My stickers, oldest added first (read when the picker opens).</summary>
    public IReadOnlyList<Sticker> Stickers { get; init; } = [];

    /// <summary>My sticker groups as stored: the default one may be missing (see <see cref="StickerPack.WithDefault"/>).</summary>
    public IReadOnlyList<StickerGroup> StickerGroups { get; init; } = [];

    /// <summary>The open chat has been given its messages; until then grey bubbles stand over its place.</summary>
    public bool TimelineReady { get; init; }

    /// <summary>Where the account stands with its encryption keys.</summary>
    public SecurityState Security { get; init; } = SecurityState.Unavailable;

    /// <summary>The call that is going, ringing or just over; null when there is none.</summary>
    public Calls.CallInfo? Call { get; init; }

    /// <summary>The verification with another session on screen, or null.</summary>
    public VerifyFlow? Verification { get; init; }

    /// <summary>The chat that is open, or null.</summary>
    public string? SelectedRoomId { get; init; }

    /// <summary>What the left pane shows: the chats, or the profile page (and what opens from it).</summary>
    public SidebarPage SidebarPage { get; init; } = SidebarPage.Chats;

    /// <summary>The space whose rooms the left pane lists while <see cref="SidebarPage"/> is <see cref="SidebarPage.Space"/>.</summary>
    public string? OpenSpaceId { get; init; }

    /// <summary>The info panel of the open chat is showing.</summary>
    public bool RoomInfoOpen { get; init; }

    /// <summary>What the info panel lists; null until it has been read.</summary>
    public RoomDetails? Details { get; init; }

    /// <summary>The message the person is answering in the open chat, if any.</summary>
    public TimelineItem? ReplyTo { get; init; }

    /// <summary>One of my messages whose text is being changed in the composer.</summary>
    public TimelineItem? Editing { get; init; }

    /// <summary>The names of the people typing in the open chat.</summary>
    public IReadOnlyList<string> Typing { get; init; } = [];

    /// <summary>The lines of the open chat, oldest first.</summary>
    public IReadOnlyList<TimelineItem> Timeline { get; init; } = [];

    /// <summary>The language the screens speak: the one chosen, else the one of the system.</summary>
    public string Locale => Strings.IsLocale(Prefs.Locale)
        ? Prefs.Locale!
        : Strings.DetectLocale(CultureInfo.CurrentUICulture.Name);
}

/// <summary>A zoom that is being tried; <c>Until</c> is a time of the clock of the controller.</summary>
public sealed record ZoomTrial(double From, double To, DateTimeOffset Until);

public enum NoticeKind {
    Success,
    Error,
    Progress,
}

/// <summary>A short message in a pill at the top of the screen (<c>useNotice</c>): it goes away by itself after a few seconds, a message about something going on stays until the next one.</summary>
public sealed record Notice(string Message, NoticeKind Kind, long Serial = 0);
