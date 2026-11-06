#!/usr/bin/env bash
# Builds the Matrix SDK for the native apps (src/avalonia): the shared library (libmatrix_sdk_ffi) and the C# bindings made from it.
#
#   src/rust/build-native.sh [--release | --profile NAME] [--out DIR] [--work DIR]
#
#   --profile  a cargo profile of the SDK's Cargo.toml ("reldev" by default: optimised, so the library is not slow to run, with little debug
#              information; "dist" is the smallest). --release is the cargo release profile.
#   --out      where the library and the bindings are put (default: src/avalonia/OhMatrix.MatrixSdk/native, which is not in git)
#   --work     where the SDK is checked out and built (default: ~/.cache/ohmatrix/sdk-native)
#
# Needs: git, a rust toolchain (cargo), and uniffi-bindgen-cs (installed here when it is missing). The SDK and its patches are the ones of sdk.sh and
# patches/. Nothing it makes is kept in the repository.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=sdk.sh
source "$here/sdk.sh"

# The generator for the uniffi the SDK uses (0.31): its own version, then the uniffi it is made for.
BINDGEN_TAG='v0.11.1+v0.31.0'

profile=reldev
out="$here/../avalonia/OhMatrix.MatrixSdk/native"
work="${XDG_CACHE_HOME:-$HOME/.cache}/ohmatrix/sdk-native"
while [ $# -gt 0 ]; do
  case $1 in
    --release) profile=release ;;
    --profile) profile=${2:?a profile name}; shift ;;
    --out) out=${2:?a directory}; shift ;;
    --work) work=${2:?a directory}; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
mkdir -p "$out" "$work"
out=$(cd "$out" && pwd)
work=$(cd "$work" && pwd)

case "$(uname -s)" in
  Linux) lib=libmatrix_sdk_ffi.so ;;
  Darwin) lib=libmatrix_sdk_ffi.dylib ;;
  MINGW* | MSYS* | CYGWIN*) lib=matrix_sdk_ffi.dll ;;
  *) echo "unsupported system: $(uname -s)" >&2; exit 1 ;;
esac

# The SDK, at the revision of sdk.sh, with our patches on.
sdk="$work/matrix-rust-sdk"
if [ ! -d "$sdk/.git" ]; then
  git init -q "$sdk"
  git -C "$sdk" remote add origin "$SDK_REPO"
fi
if [ "$(git -C "$sdk" rev-parse HEAD 2>/dev/null || true)" != "$SDK_REV" ]; then
  git -C "$sdk" fetch -q --depth 1 origin "$SDK_REV"
  git -C "$sdk" checkout -q --force FETCH_HEAD
fi
"$here/apply-patches.sh" "$sdk"

# The library. One job at a time is slow but the final link of this crate needs several GB of memory.
jobs=${CARGO_BUILD_JOBS:-}
(cd "$sdk" && cargo build -p matrix-sdk-ffi --profile "$profile" ${jobs:+-j "$jobs"})
target_dir=$profile
[ "$profile" = dev ] && target_dir=debug
cp "$sdk/target/$target_dir/$lib" "$out/$lib"

# The generator, and the bindings. It reads the library, and has to run where the SDK's cargo workspace is (it asks cargo for the crates).
bindgen="$work/bindgen/bin/uniffi-bindgen-cs"
if [ ! -x "$bindgen" ]; then
  cargo install uniffi-bindgen-cs --git https://github.com/NordSecurity/uniffi-bindgen-cs --tag "$BINDGEN_TAG" --root "$work/bindgen"
fi
rm -rf "$out/bindings"
mkdir -p "$out/bindings"
(cd "$sdk" && "$bindgen" --library "$sdk/target/$target_dir/$lib" --out-dir "$out/bindings" --no-format)

# The generator names a type `Action` and then uses System.Action on the same line: the compiler takes the first for the second.
sed -i 's/InvokeCallbackOnce(Action invoke)/InvokeCallbackOnce(System.Action invoke)/' "$out/bindings/matrix_sdk_ffi.cs"

echo "library:  $out/$lib"
echo "bindings: $out/bindings ($(find "$out/bindings" -name '*.cs' | wc -l) files)"
