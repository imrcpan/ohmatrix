using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows who I am (<c>profile</c> of the TypeScript core).</summary>
public interface IProfileEngine {
    Task<Profile> Load();
}
