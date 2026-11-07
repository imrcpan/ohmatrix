#if OHMATRIX_NATIVE_SDK
using OhMatrix.Core.Model;
using OhMatrix.Core.State;
using uniffi.matrix_sdk_ffi;

namespace OhMatrix.Engine;

/// <summary>The encryption keys of the account over the Matrix SDK (<c>security</c> of <c>RustEngineCore</c>).</summary>
public sealed class MatrixSecurityEngine(MatrixAuthEngine auth)
    : ISecurityEngine {
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

    public async Task<string> SetUp(string password)
    {
        try {
            var client = Signed();
            var encryption = client.Encryption();
            // The keys of the account first (a new identity: the server wants the password for it), then the recovery that keeps them.
            using var handle = await encryption.ResetIdentity();
            if (handle is not null)
                await handle.Reset(new AuthData.Password(
                    new AuthDataPasswordDetails(client.UserId(), password)));
            return await encryption.EnableRecovery(false, null, new Progress());
        } catch (Exception e) when (e is not EngineException) {
            throw MatrixAuthEngine.Translate(e);
        }
    }

    private sealed class Progress : EnableRecoveryProgressListener {
        public void OnUpdate(EnableRecoveryProgress status)
        {
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
