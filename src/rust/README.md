# rust/

What the apps share of the Matrix SDK (`matrix-rust-sdk`, its `matrix-sdk-ffi` crate):

- `sdk.sh` is the one place that says which revision of the SDK is used.
- `patches/` are the changes we make to it, and `apply-patches.sh SDK_CHECKOUT` puts them on a checkout (once each).

The builds that use them: `src/packages/engine-rust` (the Android library, through ubrn), and `build-native.sh` for the native apps (`src/avalonia`): it builds the shared library and makes the C# bindings from it (uniffi-bindgen-cs, for uniffi 0.31), into `src/avalonia/OhMatrix.MatrixSdk/native`.

`patches/uniffi-bindgen-cs-aot.patch` is on the generator of those bindings (uniffi-bindgen-cs), not on the SDK. Its templates reach for reflection to
release what a record holds (`FFIObjectUtil.DisposeAll` looks at the type of every field at run time) and wrap what Rust calls in delegates
(`Marshal.GetFunctionPointerForDelegate`), which NativeAOT does not like and which costs a lookup per call. With the patch a record, enum or error
releases its fields by statements made from their types (`x?.Dispose();`, a `foreach` for a list or map), and what Rust calls is an
`[UnmanagedCallersOnly]` method taken as a function pointer. `uniffi-cs.toml` is the generator's configuration.

Nothing built from the SDK is kept in the repository.
