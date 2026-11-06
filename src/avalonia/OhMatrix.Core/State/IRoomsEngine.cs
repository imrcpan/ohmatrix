using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

public enum SyncState {
    Stopped,
    Connecting,
    Syncing,
    Error,
}

/// <summary>The part of an engine that follows the chat list (<c>sync</c> and <c>rooms</c> of the TypeScript core). Events come on any thread.</summary>
public interface IRoomsEngine {
    /// <summary>The whole list, in no particular order, each time something in it changes.</summary>
    event Action<IReadOnlyList<RoomSummary>>? RoomsChanged;

    event Action<SyncState>? SyncChanged;

    Task StartSync();
    Task StopSync();
}
