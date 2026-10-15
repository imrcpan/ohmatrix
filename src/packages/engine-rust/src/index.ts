// The MatrixEngine for iOS and Android, on top of matrix-rust-sdk.
//
// `engine.ts` is the engine, written against `sdk.ts` (small interfaces in our own words) so that it can be tested
// without the native library. `sdkBindings.ts` makes those interfaces out of the bindings uniffi-bindgen-react-native
// generated, and `bindings.tsx` installs the library; both need the app's native module, so they are loaded only when the
// engine first needs the SDK, not when this file is imported.
import type { Sdk, SdkClientConfig } from "./sdk.js";
import { RustEngineCore, type RustEngineOptions } from "./engine.js";

export type { RustEngineOptions } from "./engine.js";

/** The SDK, loaded once, the first time a client is made. */
function lazySdk(): Sdk {
  let loaded: Promise<Sdk> | null = null;
  const load = () =>
    (loaded ??= Promise.all([import("./bindings.js"), import("./sdkBindings.js")]).then(([bindings, adapter]) => adapter.sdkFromBindings(bindings)));
  return {
    // Native sliding sync, which is what the SDK is built around; a session made by another engine has none stored.
    defaultSlidingSync: 1,
    newClient: async (config: SdkClientConfig) => (await load()).newClient(config),
  };
}

/** The engine for the app: matrix-rust-sdk. */
export class RustEngine extends RustEngineCore {
  constructor(options: RustEngineOptions) {
    super(lazySdk(), options);
  }
}

/**
 * Proof that the native library is loaded and answering: the git revision of the matrix-rust-sdk it was built from, and a
 * transaction id it makes. Throws if the module is not linked into the app.
 */
export async function nativeSelfTest(): Promise<{ sdkGitSha: string; transactionId: string }> {
  const ffi = await import("./bindings.js");
  return { sdkGitSha: ffi.sdkGitSha(), transactionId: ffi.genTransactionId() };
}
