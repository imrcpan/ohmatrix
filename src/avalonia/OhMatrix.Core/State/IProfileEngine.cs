using OhMatrix.Core.Model;

namespace OhMatrix.Core.State;

/// <summary>The part of an engine that knows who I am (<c>profile</c> of the TypeScript core).</summary>
public interface IProfileEngine {
    Task<Profile> Load();

    /// <summary>Sets my picture from the bytes of an image file.</summary>
    Task SetAvatar(string mimeType, byte[] data);

    /// <summary>Sets my status line (empty clears it). A server without custom profile fields refuses as <see cref="EngineErrorCode.Unsupported"/>.</summary>
    Task SetStatus(string status);

    /// <summary>Changes the name others see. Failures are <see cref="EngineException"/>.</summary>
    Task SetDisplayName(string name);
}
