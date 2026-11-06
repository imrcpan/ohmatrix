using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows the encryption keys of the account (<c>security</c> of the TypeScript core).</summary>
public interface ISecurityEngine {
    Task<SecurityState> State();

    /// <summary>Unlocks the encrypted history on this device with the recovery key. A wrong key is an <see cref="EngineException"/>.</summary>
    Task RestoreWithRecoveryKey(string key);
}
