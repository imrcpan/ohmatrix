#Requires -Version 7
# Builds the Tauri window (the web app in a native Windows window) for aarch64: an NSIS installer (per user, no administrator needed), into
# $ReleaseDir/win_tauri/OhMatrix_win_tauri_<version>_aarch64.exe. It runs on a Windows machine of either CPU (the other one is a cross build,
# which the Visual Studio C++ tools for ARM64 are needed for). Without -SkipSetup it installs what is missing (Node, pnpm and Rust into
# $HOME/.ohmatrix-tools and rustup's folder; for ARM64 the Visual Studio component). One script for each CPU.
#
#   scripts/build-win-tauri-aarch64.ps1 -Version a.b.c [-ReleaseDir DIR] [-Check] [-SkipSetup]
#
#   -Version     the version of this build, like 1.2.3 (required, except with -Check); Settings shows it
#   -ReleaseDir  where the result goes (default $HOME/release, or the environment's OHM_RELEASE_DIR)
#   -Check       only report what is missing; install and build nothing
#   -SkipSetup   do not install anything, use what is on the machine
#
# Environment: VITE_DEFAULT_HOMESERVER (the server offered on the sign-in screen), OHM_TOOLS (default $HOME/.ohmatrix-tools), OHM_OUT (caches and
# logs, default build-out), OHM_RELEASE_DIR.
param([string]$Version, [string]$ReleaseDir, [switch]$Check, [switch]$SkipSetup)
& "$PSScriptRoot/lib/win-tauri-build.ps1" -Arch aarch64 @PSBoundParameters
exit $LASTEXITCODE
