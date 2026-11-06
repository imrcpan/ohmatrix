#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;

namespace OhMatrix.Engine;

/// <summary>Who I am on the server, over the Matrix SDK (<c>profile</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixProfileEngine(MatrixAuthEngine auth) : IProfileEngine {
    public async Task<Profile> Load()
    {
        var client = auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
        try {
            var id = client.UserId();
            string? name = null;
            try {
                name = await client.DisplayName();
            } catch (Exception) {
                // A server that keeps no name: the part of the user id before the colon is shown instead.
            }

            var avatar = await client.AvatarUrl();
            return new Profile(id, string.IsNullOrWhiteSpace(name) ? null : name, avatar);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task SetDisplayName(string name)
    {
        var client = auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
        try {
            await client.SetDisplayName(name);
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }
}
#endif
