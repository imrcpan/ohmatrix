# rust/

What the apps share of the Matrix SDK (`matrix-rust-sdk`, its `matrix-sdk-ffi` crate):

- `sdk.sh` is the one place that says which revision of the SDK is used.
- `patches/` are the changes we make to it, and `apply-patches.sh SDK_CHECKOUT` puts them on a checkout (once each).

The builds that use them: `src/packages/engine-rust` (the Android library, through ubrn) now; the native apps (`src/avalonia`) later.
Nothing built from the SDK is kept in the repository.
