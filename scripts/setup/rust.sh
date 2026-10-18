# shellcheck shell=bash disable=SC2153
# Rust for the Android libraries: rustup, the pinned toolchain, the Android targets and cargo-ndk. A rustup that is already
# on the system is used as it is (and gets what it lacks); otherwise one is installed under OHM_TOOLS, away from ~/.cargo.

# setup_rust TARGET...  (Rust target triples)
setup_rust() {
  local target have_targets missing_targets=() ndk_ok=0 own=0
  if [ -x "$OHM_TOOLS/cargo/bin/rustup" ]; then
    own=1
  elif ! have rustup; then
    if [ "$OHM_CHECK" = 1 ]; then
      missing "rustup, rust $RUST_TOOLCHAIN, targets $*, cargo-ndk $CARGO_NDK_VERSION"
      return 0
    fi
    note "installing rustup and rust $RUST_TOOLCHAIN"
    export RUSTUP_HOME="$OHM_TOOLS/rustup" CARGO_HOME="$OHM_TOOLS/cargo"
    curl --proto '=https' --tlsv1.2 -fsSL --retry 5 https://sh.rustup.rs |
      sh -s -- -y --profile minimal --default-toolchain "$RUST_TOOLCHAIN" --no-modify-path >/dev/null
    own=1
  fi
  if [ "$own" = 1 ]; then
    export RUSTUP_HOME="$OHM_TOOLS/rustup" CARGO_HOME="$OHM_TOOLS/cargo"
    path_add "$CARGO_HOME/bin"
  fi
  # The pinned toolchain for this build only; the machine's default is left alone.
  export RUSTUP_TOOLCHAIN="$RUST_TOOLCHAIN"
  if ! rustup toolchain list | grep -q "^$RUST_TOOLCHAIN"; then
    if [ "$OHM_CHECK" = 1 ]; then
      missing "rust toolchain $RUST_TOOLCHAIN"
      return 0
    fi
    note "installing rust $RUST_TOOLCHAIN"
    rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal >/dev/null 2>&1
  fi
  ok "rust $(rustc --version | cut -d' ' -f2)"

  have_targets=$(rustup target list --installed 2>/dev/null || true)
  for target in "$@"; do
    grep -qx "$target" <<<"$have_targets" || missing_targets+=("$target")
  done
  if [ ${#missing_targets[@]} -gt 0 ]; then
    if [ "$OHM_CHECK" = 1 ]; then
      missing "rust targets ${missing_targets[*]}"
    else
      note "adding rust targets ${missing_targets[*]}"
      rustup target add "${missing_targets[@]}" >/dev/null 2>&1
    fi
  else
    ok "rust targets $*"
  fi

  if cargo ndk --version 2>/dev/null | grep -q "$CARGO_NDK_VERSION"; then ndk_ok=1; fi
  if [ "$ndk_ok" = 1 ]; then
    ok "cargo-ndk $CARGO_NDK_VERSION"
  elif [ "$OHM_CHECK" = 1 ]; then
    missing "cargo-ndk $CARGO_NDK_VERSION"
  else
    note "installing cargo-ndk $CARGO_NDK_VERSION (compiled, a few minutes)"
    cargo install cargo-ndk --locked --version "$CARGO_NDK_VERSION" --jobs "${OHM_JOBS:-1}" >/dev/null 2>&1 || die "cargo install cargo-ndk failed (run: cargo install cargo-ndk --locked --version $CARGO_NDK_VERSION)"
  fi
}
