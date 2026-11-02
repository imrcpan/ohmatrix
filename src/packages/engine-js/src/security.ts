import type { MatrixClient } from "matrix-js-sdk";
import { decodeRecoveryKey } from "matrix-js-sdk/lib/crypto-api/recovery-key";
import { EngineError, type Listener, type SecurityApi, type SecurityState } from "@ohmatrix/core";
import { encryptMegolmExport } from "./megolmExport.js";

/** Holds secret-storage keys the user unlocked this session; the SDK pulls them via callbacks. */
export class SecretKeyCache {
  private keys = new Map<string, Uint8Array<ArrayBuffer>>();
  readonly callbacks = {
    getSecretStorageKey: async ({ keys }: { keys: Record<string, unknown> }): Promise<[string, Uint8Array<ArrayBuffer>] | null> => {
      for (const id of Object.keys(keys)) {
        const k = this.keys.get(id);
        if (k) return [id, k];
      }
      return null;
    },
    cacheSecretStorageKey: (id: string, _info: unknown, key: Uint8Array<ArrayBuffer>) => {
      this.keys.set(id, key);
    },
  };
  set(id: string, key: Uint8Array<ArrayBuffer>) {
    this.keys.set(id, key);
  }
  clear() {
    this.keys.clear();
  }
}

export class JsSecurity implements SecurityApi {
  private listeners = new Set<Listener<SecurityState>>();
  private last: SecurityState | null = null;

  constructor(
    private getClient: () => MatrixClient | null,
    private cache: SecretKeyCache,
  ) {}

  async state(): Promise<SecurityState> {
    const crypto = this.getClient()?.getCrypto();
    if (!crypto) return "unavailable";
    if (await crypto.isCrossSigningReady()) return "ready";
    const status = await crypto.getCrossSigningStatus();
    const storage = await crypto.getSecretStorageStatus();
    return status.privateKeysInSecretStorage || storage.defaultKeyId ? "needs_recovery" : "needs_setup";
  }

  /** Re-evaluate and notify; called by the engine after sync/crypto events. */
  async refresh(): Promise<void> {
    let s: SecurityState;
    try {
      s = await this.state();
    } catch {
      return;
    }
    if (s !== this.last) {
      this.last = s;
      this.listeners.forEach((cb) => cb(s));
    }
  }

  onState(cb: Listener<SecurityState>): () => void {
    this.listeners.add(cb);
    if (this.last) cb(this.last);
    else void this.refresh();
    return () => {
      this.listeners.delete(cb);
    };
  }

  reset() {
    this.last = null;
    this.cache.clear();
  }

  async setUp({ password }: { password: string }): Promise<{ recoveryKey: string }> {
    const client = this.getClient();
    const crypto = client?.getCrypto();
    if (!client || !crypto) throw new EngineError("unsupported", "encryption unavailable");
    try {
      await crypto.bootstrapCrossSigning({
        setupNewCrossSigning: true,
        authUploadDeviceSigningKeys: (makeRequest) =>
          makeRequest({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: client.getUserId()! },
            password,
          }),
      });
      let recoveryKey = "";
      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => {
          const k = await crypto.createRecoveryKeyFromPassphrase();
          recoveryKey = k.encodedPrivateKey ?? "";
          return k;
        },
        setupNewKeyBackup: true,
        setupNewSecretStorage: true,
      });
      await this.refresh();
      return { recoveryKey };
    } catch (e) {
      if (e instanceof EngineError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new EngineError(/forbidden|password|401/i.test(msg) ? "forbidden" : "unknown", msg, e);
    }
  }

  async exportKeys(passphrase: string): Promise<string> {
    const crypto = this.getClient()?.getCrypto();
    if (!crypto) throw new EngineError("unsupported", "encryption unavailable");
    try {
      return await encryptMegolmExport(await crypto.exportRoomKeysAsJson(), passphrase);
    } catch (e) {
      throw new EngineError("unknown", e instanceof Error ? e.message : String(e), e);
    }
  }

  async restoreWithRecoveryKey(recoveryKey: string): Promise<void> {
    const client = this.getClient();
    const crypto = client?.getCrypto();
    if (!client || !crypto) throw new EngineError("unsupported", "encryption unavailable");
    let key: Uint8Array<ArrayBuffer>;
    try {
      key = decodeRecoveryKey(recoveryKey.replace(/\s+/g, ""));
    } catch {
      throw new EngineError("forbidden", "Invalid recovery key");
    }
    const keyId = await client.secretStorage.getDefaultKeyId();
    if (!keyId) throw new EngineError("not_found", "This account has no recovery key set up");
    const info = await client.secretStorage.getKey(keyId);
    if (!info || !(await client.secretStorage.checkKey(key, info[1]))) throw new EngineError("forbidden", "Invalid recovery key");
    this.cache.set(keyId, key);
    try {
      await crypto.bootstrapCrossSigning({});
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      await crypto.restoreKeyBackup();
    } catch (e) {
      throw new EngineError("unknown", e instanceof Error ? e.message : String(e), e);
    } finally {
      await this.refresh();
    }
  }
}
