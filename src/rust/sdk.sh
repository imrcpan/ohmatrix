# shellcheck shell=bash disable=SC2034
# The Matrix SDK every build of the app uses, in one place: the Android library (src/packages/engine-rust, through ubrn) and, later, the native
# desktop and mobile apps (src/avalonia). Sourced by the scripts that check the SDK out.
#
# The revision is the one whose uniffi version (0.31) the bindings generators work with; matrix-sdk 0.19 moved to uniffi 0.32.
# src/packages/engine-rust/ubrn.yaml names the same revision (ubrn reads its own file), and build-android.sh stops if the two differ.
SDK_REPO=https://github.com/matrix-org/matrix-rust-sdk
SDK_REV=1c44fb66214667c6d00acaf72ab592493653708b # matrix-sdk-0.18.0
SDK_FFI_MANIFEST=bindings/matrix-sdk-ffi/Cargo.toml # the crate the bindings are made from (the one Element X uses)
