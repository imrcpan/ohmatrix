# shellcheck shell=bash disable=SC2034
# Every pinned version of the build tools, in one place. Change a version here and nowhere else.

NODE_VERSION=24.18.0
NODE_MIN_MAJOR=22 # package.json "engines"; an installed Node at or above this is reused, not replaced
PNPM_VERSION=10.33.0 # package.json "packageManager"

JDK_MIN_MAJOR=17 # what Gradle and the React Native plugin need; an installed JDK from this up to JDK_MAX_MAJOR is reused
JDK_MAX_MAJOR=25
JDK_INSTALL_MAJOR=21 # what is installed (apt, or Temurin) when there is none

RUST_TOOLCHAIN=1.99.1
# How a release build compiles the Matrix SDK library (the biggest part of an APK). Measured on arm64-v8a, the library as it is in the APK:
#   cargo "release" profile                      84.5 MB
#   "dist" (a profile of the SDK's own Cargo.toml: link time optimisation, optimised for size)           58.1 MB
#   "dist" with one codegen unit                 42.1 MB  (the whole crate is optimised at once, not in parts: slower to build, same behaviour)
# Tried and left out: panic=abort (41.5 MB on its own, but uniffi relies on catching a panic so that a Rust error does not take the app
# down), --icf=all (-1.1 MB), and building the SDK without its search feature (-0.1 MB).
RUST_RELEASE_PROFILE=dist
# One codegen unit is a setting of the profile, not a compiler flag: it is given as cargo's CARGO_PROFILE_<NAME>_CODEGEN_UNITS, which gets
# through ubrn and cargo-ndk to cargo. (CARGO_TARGET_<triple>_RUSTFLAGS does not: ubrn sets that one itself and overwrites it.)
RUST_RELEASE_CODEGEN_UNITS=1
CARGO_NDK_VERSION=4.1.2

# Android command line tools, from https://developer.android.com/studio (the checksum is the one published there).
ANDROID_CMDLINE_TOOLS=15859902
ANDROID_CMDLINE_TOOLS_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583
# The NDK React Native asks for (node_modules/react-native/gradle/libs.versions.toml). The build-android scripts check this against it:
# with a different one here, Gradle would download the one it wants on its own, a second NDK of 1.5 GB.
ANDROID_NDK=27.1.12297006
ANDROID_PLATFORM=35
ANDROID_BUILD_TOOLS=35.0.0

# Packages from the distribution. Both builds need the first group; the Rust and Android side needs the second.
APT_BASE=(ca-certificates curl git unzip xz-utils)
APT_ANDROID=(build-essential cmake pkg-config zip protobuf-compiler libssl-dev python3 perl clang lld ninja-build)

# ABI (as the Android build and ubrn.yaml name it) -> Rust target.
rust_target_of() {
  case "$1" in
    arm64-v8a) echo aarch64-linux-android ;;
    x86_64) echo x86_64-linux-android ;;
    armeabi-v7a) echo armv7-linux-androideabi ;;
    x86) echo i686-linux-android ;;
    *) return 1 ;;
  esac
}
