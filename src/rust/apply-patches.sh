#!/usr/bin/env bash
# Puts our patches on a checkout of the Matrix SDK, once each (a patch that is on already is left alone).
#
#   src/rust/apply-patches.sh SDK_CHECKOUT
#
#   matrix-rust-sdk-ring-provider.patch  the SDK uses `ring` instead of aws-lc (aws-lc's symbols clash with React Native's Folly at run time)
#   matrix-rust-sdk-call-events.patch    a listener the app gives the signalling events of a room to (calls between two people)
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
sdk=${1:?say where the SDK is checked out: apply-patches.sh SDK_CHECKOUT}
[ -d "$sdk/crates/matrix-sdk" ] || { echo "$sdk is not a checkout of matrix-rust-sdk" >&2; exit 1; }
sdk=$(cd "$sdk" && pwd)

# Whether a patch is on is told by a line it adds.
if ! grep -q "rustls-no-provider" "$sdk/crates/matrix-sdk/Cargo.toml"; then
  git -C "$sdk" apply "$here/patches/matrix-rust-sdk-ring-provider.patch"
fi
if [ ! -f "$sdk/bindings/matrix-sdk-ffi/src/call_events.rs" ]; then
  git -C "$sdk" apply "$here/patches/matrix-rust-sdk-call-events.patch"
fi
