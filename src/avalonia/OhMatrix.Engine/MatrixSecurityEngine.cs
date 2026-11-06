#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>The encryption keys of the account over the Matrix SDK (<c>security</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixSecurityEngine(MatrixAuthEngine auth) : ISecurityEngine {
    private Client Signed()
    {
        return auth.Client ?? throw new EngineException(
            EngineErrorCode.Unauthorized,
            "Not signed in."
        );
    }

    public async Task<SecurityState> State()
    {
        try {
            var encryption = Signed().Encryption();
            var raw = new RawSecurity(
                encryption.RecoveryState().ToString(),
                encryption.VerificationState() switch {
                    VerificationState.Verified => true,
                    VerificationState.Unverified => false,
                    _ => null,
                },
                await encryption.BackupExistsOnServer()
            );
            return raw.State();
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    public async Task RestoreWithRecoveryKey(string key)
    {
        try {
            await Signed().Encryption().Recover(key.Trim());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }
}
#endif
