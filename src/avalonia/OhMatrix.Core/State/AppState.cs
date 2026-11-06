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

    /// <summary>The chat list, in the order it is shown: pinned first, then the latest activity first.</summary>
    public IReadOnlyList<RoomSummary> Rooms { get; init; } = [];

    /// <summary>Who I am on the server; null until it has been read.</summary>
    public Profile? Profile { get; init; }

    public SyncState SyncState { get; init; } = SyncState.Stopped;

    /// <summary>The chat that is open, or null.</summary>
    public string? SelectedRoomId { get; init; }

    /// <summary>What the left pane shows: the chats, or the profile page (and what opens from it).</summary>
    public SidebarPage SidebarPage { get; init; } = SidebarPage.Chats;

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
