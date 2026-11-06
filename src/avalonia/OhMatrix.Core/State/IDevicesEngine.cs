using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows where my account is signed in (<c>devices</c> of the TypeScript core).</summary>
public interface IDevicesEngine {
    /// <summary>My sessions: this one first, then the most recently used.</summary>
    Task<IReadOnlyList<DeviceInfo>> ListDevices();

    /// <summary>
    /// Signs other sessions out. The server wants the account password for it; a wrong one is an <see cref="EngineException"/> with
    /// <see cref="EngineErrorCode.Forbidden"/>.
    /// </summary>
    Task RemoveDevices(IReadOnlyList<string> ids, string password);
}
