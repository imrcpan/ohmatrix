#!/usr/bin/env bash
# Builds the Tauri window (the web app in a native macOS window) for Intel (x86_64): a .dmg, into ~/release/mac_tauri.
# It must run on a Mac (the window is drawn by the system's WKWebView, and the disk image is made by macOS tools). The Mac may be of either
# CPU: the other is a cross build, which Rust does with a target added. Without --skip-setup it installs what is missing (Node, pnpm and Rust
# into OHM_TOOLS); Xcode's command line tools it cannot install and asks for (`xcode-select --install`). One script for each CPU.
# The app is not signed or notarized: macOS asks the person to allow it the first time (System Settings > Privacy & Security).
#
#   scripts/build-mac-tauri-x86_64.sh --version a.b.c [--release-dir DIR] [--check] [--skip-setup] [--jobs N]
#
#   --version     the version of this build, like 1.2.3 (required, except with --check); Settings shows it
#   --release-dir where the result goes: DIR/mac_tauri/OhMatrix_mac_tauri_<version>_x86_64.dmg (default ~/release)
#   --check       only report what is missing; install and build nothing
#   --skip-setup  do not install anything, use what is on the machine
#   --jobs N      parallel compile jobs, instead of what the machine's CPUs allow
#
# Environment: VITE_DEFAULT_HOMESERVER (the server offered on the sign-in screen), OHM_TOOLS (where tools are installed, default
# ~/.ohmatrix-tools), OHM_OUT (caches and logs, default build-out), OHM_RELEASE_DIR (default ~/release).
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ARCH=x86_64
# shellcheck source=lib/mac-tauri-build.sh
source "$here/lib/mac-tauri-build.sh"
