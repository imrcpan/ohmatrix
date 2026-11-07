namespace OhMatrix.Core.State;

/// <summary>Making and arranging spaces (<c>spaces</c> and <c>createSpace</c> of the TypeScript core), over the state events of the rooms.</summary>
public interface ISpacesEngine {
    /// <summary>Creates a space (an unencrypted container for rooms) and gives its id.</summary>
    Task<string> CreateSpace(string name);

    /// <summary>Lists a room in a space, last.</summary>
    Task AddChild(string spaceId, string roomId);

    /// <summary>Takes a room out of a space's list; the room itself is untouched.</summary>
    Task RemoveChild(string spaceId, string roomId);

    /// <summary>Moves a room to the start or the end of a space's list.</summary>
    Task MoveChild(string spaceId, string roomId, bool first);
}
