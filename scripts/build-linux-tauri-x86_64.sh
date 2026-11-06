#!/usr/bin/env bash
# Builds the Tauri window (the web app in a native Linux window) for x86_64: a .deb, an .rpm and an AppImage, into ~/release/linux_tauri.
# On a bare Debian this is one command: it installs what is missing (system packages with the web view, Node, pnpm, Rust), then
# builds. What is already there is used as it is. It must run on a x86_64 machine: the web view the window links against is the one
# of the machine's own packages. One script for each architecture.
#
#   scripts/build-linux-tauri-x86_64.sh --version a.b.c [--release-dir DIR] [--check] [--skip-setup] [--jobs N]
#
#   --version     the version of this build, like 1.2.3 (required, except with --check); Settings shows it
#   --release-dir where the result goes: DIR/linux_tauri/OhMatrix_linux_tauri_<version>_x86_64.{deb,rpm,AppImage} (default ~/release)
#   --check       only report what is missing (and whether the machine is big enough); install and build nothing
#   --skip-setup  do not install anything, use what is on the machine
#   --jobs N      parallel compile jobs, instead of what the machine's CPUs and memory allow
#
# Environment: VITE_DEFAULT_HOMESERVER (the server offered on the sign-in screen), OHM_TOOLS (where tools are installed, default
# ~/.ohmatrix-tools), OHM_OUT (caches and logs, default build-out), OHM_RELEASE_DIR (default ~/release).
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ARCH=x86_64
# shellcheck source=lib/linux-tauri-build.sh
source "$here/lib/linux-tauri-build.sh"
