using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows the encryption keys of the account (<c>security</c> of the TypeScript core).</summary>
public interface ISecurityEngine {
    Task<SecurityState> State();

    /// <summary>Makes the keys of the account (the server wants the password for it) and the recovery that keeps them; gives the recovery key, which cannot be shown again.</summary>
    Task<string> SetUp(string password);

    /// <summary>Unlocks the encrypted history on this device with the recovery key. A wrong key is an <see cref="EngineException"/>.</summary>
    Task RestoreWithRecoveryKey(string key);
}
