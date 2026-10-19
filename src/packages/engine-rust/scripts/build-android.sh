#!/usr/bin/env bash
# Builds the Rust side for Android: checks out matrix-rust-sdk at the pinned revision, patches it to use `ring`
# instead of aws-lc (aws-lc's symbols clash with React Native's Folly at run time), and builds the shared libraries
# for the targets in ubrn.yaml. Needs: rustup with the android targets, cargo-ndk, the Android NDK, cmake, clang.
#
#   ANDROID_NDK_HOME=... scripts/build-android.sh [--release | --profile NAME] [--targets arm64-v8a] [--no-cargo]
#   (--profile: a cargo profile of the SDK's Cargo.toml, such as "dist", which is smaller than --release; it wins over --release.
#    --targets: build for fewer than the targets in ubrn.yaml; --no-cargo: only redo the bindings)
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME to the NDK directory}"
case "$(uname -s)" in Darwin) host=darwin-x86_64 ;; *) host=linux-x86_64 ;; esac
clang_dir=$(ls -d "$ANDROID_NDK_HOME"/toolchains/llvm/prebuilt/$host/lib/clang/*/lib/linux | head -1)

# The pinned checkout, with the patch applied once.
if [ ! -d rust_modules/matrix-rust-sdk ]; then npx ubrn checkout --config ubrn.yaml; fi
# (The patch is applied once; whether it is already there is told by a line it adds.)
if ! grep -q "rustls-no-provider" rust_modules/matrix-rust-sdk/crates/matrix-sdk/Cargo.toml; then
  git -C rust_modules/matrix-rust-sdk apply ../../patches/matrix-rust-sdk-ring-provider.patch
fi

# x86_64 needs the compiler runtime for 128-bit arithmetic that the NDK does not link by default.
export CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS="-L$clang_dir"
# Builds the libraries and, from the same build, the TypeScript and C++ bindings and the TurboModule that loads them.
npx ubrn build android --config ubrn.yaml --and-generate "$@"

# The SDK's Kotlin bindings too, which the push service of the app (apps/mobile/modules/ohmatrix-push) uses to read a message with the
# app not running. They are made from the library just built (--no-cargo), and by ubrn started inside the SDK's checkout: that step runs
# `cargo metadata` where it starts, and only there is the workspace.
root=$(pwd)
(cd rust_modules/matrix-rust-sdk && "$root/../../../node_modules/.bin/ubrn" build android --config "$root/ubrn.yaml" --no-cargo --native-bindings "$@")

# The Kotlin bindings are the push module's, not this module's (which is called from JavaScript only): there they are compiled with the
# service that uses them, and this module stays as it was. They are not kept in the repository.
push_java=../../apps/mobile/modules/ohmatrix-push/android/src/main/java
rm -rf "$push_java/org/matrix" "$push_java/uniffi"
mkdir -p "$push_java"
# Merged into what is there (the module's own sources are under org/ too), not moved over it: `mv org dest/org` would put it inside.
for d in org uniffi; do
  if [ -d "android/src/main/java/$d" ]; then
    mkdir -p "$push_java/$d"
    cp -a "android/src/main/java/$d/." "$push_java/$d/"
    rm -rf "android/src/main/java/$d"
  fi
done
[ -f "$push_java/org/matrix/rustcomponents/sdk/matrix_sdk_ffi.kt" ] || { echo "the Kotlin bindings were not made" >&2; exit 1; }

# `--and-generate` writes the bindings; the TurboModule that loads them (cpp/, android/, ios/, src/NativeEngineRust.ts) is a
# second step, over the same namespaces. The JS entry that installs them is src/bindings.tsx, which is written by hand.
namespaces=$(cd src/generated && ls *.ts | sed 's/\.ts$//' | grep -v -- '-ffi$')
npx ubrn generate jsi turbo-module --config ubrn.yaml $namespaces

# The generated C++ of the SDK is one huge constructor with a lambda for each of its 1,400 functions, which takes 7 GB to compile.
# This turns it into a table and a loop (1.5 GB), registering the same functions. See scripts/shrinkBinding.mjs.
node scripts/shrinkBinding.mjs cpp/generated
