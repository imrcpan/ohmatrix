namespace OhMatrix.Core.Model;

/// <summary>Where the account stands with its encryption keys (<c>SecurityState</c> of the TypeScript core).</summary>
public enum SecurityState {
    /// <summary>Not known yet: nothing is shown rather than a prompt that may turn out wrong.</summary>
    Unavailable,

    /// <summary>The keys are not set up on this account.</summary>
    NeedsSetup,

    /// <summary>The account has keys, but this device cannot read the history until it gets the recovery key.</summary>
    NeedsRecovery,

    /// <summary>This device is verified and the keys are kept: all is well.</summary>
    Ready,
}

/// <summary>What the SDK says of the encryption of the account.</summary>
public sealed record RawSecurity(
    /// <summary>Unknown, Enabled, Disabled or Incomplete: whether the keys are kept in secret storage.</summary>
    string Recovery,
    /// <summary>Whether this device is verified by the keys of the account; null while that is not known.</summary>
    bool? Verified,
    /// <summary>There is a key backup on the server.</summary>
    bool BackupOnServer
) {
    /// <summary>The state the app acts on (<c>securityStateOf</c>).</summary>
    public SecurityState State()
    {
        if (Recovery == "Unknown" && Verified is null)
            return SecurityState.Unavailable;
        if (Verified == true && Recovery == "Enabled")
            return SecurityState.Ready;
        if (Verified == true)
            return SecurityState.NeedsSetup;
        return Recovery is "Enabled" or "Incomplete" || BackupOnServer
            ? SecurityState.NeedsRecovery
            : SecurityState.NeedsSetup;
    }
}
