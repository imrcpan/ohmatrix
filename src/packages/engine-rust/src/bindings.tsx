// Installs the Rust library into the JS runtime and initialises the bindings uniffi-bindgen-react-native generated for it
// (src/generated). This is the entry it would write itself (src/index.tsx), kept here by hand because our own entry is
// src/index.ts and ubrn leaves `src/` alone when there is one.
//
// If a namespace is added or removed (matrix-rust-sdk's crates change), change the lists below: they are the files in
// src/generated that do not end in `-ffi`.
import installer from "./NativeEngineRust";

import * as matrix_sdk from "./generated/matrix_sdk";
import * as matrix_sdk_base from "./generated/matrix_sdk_base";
import * as matrix_sdk_common from "./generated/matrix_sdk_common";
import * as matrix_sdk_crypto from "./generated/matrix_sdk_crypto";
import * as matrix_sdk_ffi from "./generated/matrix_sdk_ffi";
import * as matrix_sdk_ui from "./generated/matrix_sdk_ui";

// Done once, even when the JS is reloaded (Metro's fast refresh runs this module again).
const state = globalThis as unknown as { __ohmatrixRustReady?: boolean };
if (!state.__ohmatrixRustReady) {
  installer.installRustCrate();
  matrix_sdk.default.initialize();
  matrix_sdk_base.default.initialize();
  matrix_sdk_common.default.initialize();
  matrix_sdk_crypto.default.initialize();
  matrix_sdk_ffi.default.initialize();
  matrix_sdk_ui.default.initialize();
  state.__ohmatrixRustReady = true;
}

export * from "./generated/matrix_sdk";
export * from "./generated/matrix_sdk_base";
export * from "./generated/matrix_sdk_common";
export * from "./generated/matrix_sdk_crypto";
export * from "./generated/matrix_sdk_ffi";
export * from "./generated/matrix_sdk_ui";
