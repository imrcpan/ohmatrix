// The MatrixEngine for iOS and Android, on top of matrix-rust-sdk.
//
// `bindings.tsx` is what uniffi-bindgen-react-native generated (it installs the Rust crate into the JS runtime and
// initialises the bindings); the types and classes it exports are matrix-rust-sdk's own (Element X's FFI crate).
import type { MatrixEngine } from "@ohmatrix/core";

/** What the engine needs from the app that hosts it. */
export interface RustEngineOptions {
  /** A folder in the app's private storage for the SDK's database. */
  dataDir: string;
  /** A folder for what can be fetched again (downloaded media). */
  cacheDir: string;
  /** The passphrase of the database, the same every time (see the app's secure storage). */
  passphrase(): Promise<string>;
}

/** The engine itself. Its constructor takes the options; it is a `MatrixEngine` (the class is written once the bindings exist). */
export declare const RustEngine: new (options: RustEngineOptions) => MatrixEngine;

/**
 * Proof that the native library is loaded and answering: the git revision of the matrix-rust-sdk it was built from, and a
 * transaction id it makes. Throws if the module is not linked into the app.
 */
export async function nativeSelfTest(): Promise<{ sdkGitSha: string; transactionId: string }> {
  const ffi = await import("./bindings.js");
  return { sdkGitSha: ffi.sdkGitSha(), transactionId: ffi.genTransactionId() };
}
