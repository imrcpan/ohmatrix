using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>An open chat: its lines, oldest first, as they change, and what can be done in it. Events come on any thread.</summary>
public interface IChatSession : IDisposable {
    event Action<IReadOnlyList<TimelineItem>>? Changed;

    /// <summary>The lines now; what <see cref="Changed"/> last told.</summary>
    IReadOnlyList<TimelineItem> Items { get; }

    /// <summary>Names of the people typing in the chat (never me), as they change.</summary>
    event Action<IReadOnlyList<string>>? TypingChanged;

    /// <summary>Sends a text message; with <paramref name="replyToEventId"/>, as the answer to that message.</summary>
    Task Send(string text, string? replyToEventId = null);

    /// <summary>Adds my reaction to a line, or takes it away if it is there.</summary>
    Task ToggleReaction(string itemId, string key);

    /// <summary>Loads older messages; false when there are no more.</summary>
    Task<bool> LoadOlder();

    /// <summary>Tells the server that everything shown has been read.</summary>
    Task MarkRead();
}

/// <summary>The part of an engine that opens a chat (<c>timeline</c> of the TypeScript core).</summary>
public interface IChatEngine {
    Task<IChatSession> Open(string roomId);
}
