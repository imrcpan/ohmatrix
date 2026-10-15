#!/usr/bin/env bash
# Builds the Rust side for Android: checks out matrix-rust-sdk at the pinned revision, patches it to use `ring`
# instead of aws-lc (aws-lc's symbols clash with React Native's Folly at run time), and builds the shared libraries
# for the targets in ubrn.yaml. Needs: rustup with the android targets, cargo-ndk, the Android NDK, cmake, clang.
#
#   ANDROID_NDK_HOME=... scripts/build-android.sh [--release] [--targets arm64-v8a] [--no-cargo]
#   (--targets: build for fewer than the targets in ubrn.yaml; --no-cargo: only redo the bindings)
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
# (--native-bindings, which also writes Kotlin bindings, is not used: the module is called from JS only.)
npx ubrn build android --config ubrn.yaml --and-generate "$@"

# `--and-generate` writes the bindings; the TurboModule that loads them (cpp/, android/, ios/, src/NativeEngineRust.ts) is a
# second step, over the same namespaces. The JS entry that installs them is src/bindings.tsx, which is written by hand.
namespaces=$(cd src/generated && ls *.ts | sed 's/\.ts$//' | grep -v -- '-ffi$')
npx ubrn generate jsi turbo-module --config ubrn.yaml $namespaces
