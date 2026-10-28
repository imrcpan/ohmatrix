#!/usr/bin/env bash
# Builds the Android app for armeabi-v7a (older 32-bit ARM phones), one APK, into ~/release/android. On a bare Debian this is one command: it installs
# what is missing (system packages, Node, pnpm, a JDK, Rust with the Android target, the Android SDK and NDK), builds the Rust Matrix
# SDK bindings, and then the app. What is already there is used as it is. The compile settings follow what the machine, or the
# container, really has. One script for each ABI: the ABIs are built one after the other, never together (the biggest compile needs
# 7.3 GB, so two at once would not fit).
#
#   scripts/build-android-armeabi-v7a.sh --version a.b.c [--release-dir DIR] [--debug|--release]
#                            [--google-services FILE] [--check] [--skip-setup] [--jobs N] [--save-disk|--no-save-disk]
#
#   --version      the version of this build, like 1.2.3 (required, except with --check). It is the APK's version name, and what
#                  Settings shows; the ABI gets its own version code from it.
#   --release-dir  where the result goes: DIR/android/OhMatrix_android_<version>_armeabi-v7a.apk (default ~/release)
#   --release      the default; --debug builds the debug variant (the file name then ends in _debug)
#   --google-services  the Firebase file to build with, instead of src/apps/mobile/google-services.json (push through FCM)
#   --check        only report what is missing (and whether the machine is big enough); install and build nothing
#   --skip-setup   do not install anything, use what is on the machine
#   --jobs N       parallel compile jobs, instead of what the machine's CPUs and memory allow
#   --save-disk    delete the Rust build output once the library is built, and the crates at the end (about 5 GB). The
#                  default is to do it when less than 30 GB are free, which is what a GitHub runner has; --no-save-disk never does.
#
# A release build compiles the Rust library with the "dist" profile of the Matrix SDK and one codegen unit (lib/versions.sh): the
# library is 42 MB instead of 84, and takes longer to build. The libraries are stored compressed in the APK and unpacked when it is
# installed (useLegacyPackaging in app.json): the APK is smaller, and the installed app takes the same room as before.
# The APK is signed with the debug key (what `expo prebuild` sets up): fine for installing, not for publishing;
# sign-android.sh signs it with the release key afterwards (the build never sees that key).
# Environment: OHM_TOOLS (where tools are installed, default ~/.ohmatrix-tools), OHM_OUT (caches and logs, default build-out),
# OHM_RELEASE_DIR (default ~/release), EXPO_PUBLIC_DEFAULT_HOMESERVER (the server offered on the sign-in screen).
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ABI=armeabi-v7a
# shellcheck source=lib/android-build.sh
source "$here/lib/android-build.sh"
