using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows who I am (<c>profile</c> of the TypeScript core).</summary>
public interface IProfileEngine {
    Task<Profile> Load();

    /// <summary>Changes the name others see. Failures are <see cref="EngineException"/>.</summary>
    Task SetDisplayName(string name);
}
