# rust/

What the apps share of the Matrix SDK (`matrix-rust-sdk`, its `matrix-sdk-ffi` crate):

- `sdk.sh` is the one place that says which revision of the SDK is used.
- `patches/` are the changes we make to it, and `apply-patches.sh SDK_CHECKOUT` puts them on a checkout (once each).

The builds that use them: `src/packages/engine-rust` (the Android library, through ubrn), and `build-native.sh` for the native apps (`src/avalonia`): it builds the shared library and makes the C# bindings from it (uniffi-bindgen-cs, for uniffi 0.31), into `src/avalonia/OhMatrix.MatrixSdk/native`.
Nothing built from the SDK is kept in the repository.
