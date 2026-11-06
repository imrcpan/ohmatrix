# shellcheck shell=bash disable=SC2154,SC2153
# Sourced by build-mac-tauri-<arch>.sh, which sets `here` (this folder) and `ARCH` (the CPU the script builds for). Runs on macOS with its
# own tools (bash 3.2, BSD utilities), so it uses none of the Linux-only helpers (/proc, apt, sha256sum).
set -euo pipefail
# shellcheck source=lib/common.sh
source "$here/lib/common.sh"
source "$here/lib/versions.sh"
source "$here/lib/release.sh"
source "$here/lib/args.sh"

# macOS has shasum, not sha256sum.
have sha256sum || sha256sum() { shasum -a 256 "$@"; }

ohm_parse_common "$@"
[ ${#OHM_REST[@]} -eq 0 ] || die "unknown option: ${OHM_REST[0]} (see the top of $0)"
require_version
[ "$(uname -s)" = Darwin ] || die "this builds the macOS app and must run on a Mac (this is $(uname -s))"
case "$ARCH" in
  aarch64) rust_target=aarch64-apple-darwin node_arch=arm64 ;;
  x86_64) rust_target=x86_64-apple-darwin node_arch=x64 ;;
  *) die "unknown architecture '$ARCH'" ;;
esac
OHM_JOBS="${OHM_JOBS:-$(sysctl -n hw.ncpu)}"

step "tools"
have xcrun && xcrun --find clang >/dev/null 2>&1 && ok "Xcode command line tools" || missing "Xcode command line tools (run: xcode-select --install)"
path_add "$OHM_TOOLS/cargo/bin"

# Node: one that is installed and new enough is reused, or the pinned one is unpacked into the tools folder (the Mac's own CPU: it runs the build).
host=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)
node_dir="$OHM_TOOLS/node-$NODE_VERSION"
if [ -x "$node_dir/bin/node" ]; then
  path_add "$node_dir/bin"
  ok "node $(node -v) (in $node_dir)"
elif have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MIN_MAJOR" ]; then
  ok "node $(node -v) (found)"
elif [ "$OHM_SKIP_SETUP" = 1 ] || [ "$OHM_CHECK" = 1 ]; then
  missing "node >= $NODE_MIN_MAJOR (would install $NODE_VERSION)"
else
  file="node-v$NODE_VERSION-darwin-$host.tar.gz"
  note "installing node $NODE_VERSION"
  sums=$(mktemp)
  download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$sums"
  sum=$(awk -v f="$file" '$2 == f {print $1}' "$sums")
  rm -f "$sums"
  [ -n "$sum" ] || die "no checksum for $file in nodejs.org's list"
  mkdir -p "$node_dir"
  download "https://nodejs.org/dist/v$NODE_VERSION/$file" "$node_dir/$file"
  [ "$(shasum -a 256 "$node_dir/$file" | cut -d' ' -f1)" = "$sum" ] || die "checksum of $file does not match (wanted $sum)"
  tar -xzf "$node_dir/$file" -C "$node_dir" --strip-components=1
  rm -f "$node_dir/$file"
  path_add "$node_dir/bin"
  ok "node $(node -v)"
fi

# pnpm: the pinned version, from npm into the tools folder when the installed one is another.
pnpm_dir="$OHM_TOOLS/pnpm-$PNPM_VERSION"
if [ -x "$pnpm_dir/bin/pnpm" ]; then
  path_add "$pnpm_dir/bin"
  ok "pnpm $(pnpm -v) (in $pnpm_dir)"
elif have pnpm && [ "$(pnpm -v 2>/dev/null | cut -d. -f1)" = "${PNPM_VERSION%%.*}" ]; then
  ok "pnpm $(pnpm -v) (found)"
elif [ "$OHM_SKIP_SETUP" = 1 ] || [ "$OHM_CHECK" = 1 ]; then
  missing "pnpm ${PNPM_VERSION%%.*}.x (would install $PNPM_VERSION)"
else
  have npm || die "pnpm needs npm, which comes with node"
  npm install --global --silent --prefix "$pnpm_dir" "pnpm@$PNPM_VERSION"
  path_add "$pnpm_dir/bin"
  ok "pnpm $(pnpm -v)"
fi

# Rust: the pinned toolchain with the target of the CPU asked for (the other CPU of a Mac is a cross build).
if [ -x "$OHM_TOOLS/cargo/bin/rustup" ]; then
  export RUSTUP_HOME="$OHM_TOOLS/rustup" CARGO_HOME="$OHM_TOOLS/cargo"
elif ! have rustup; then
  if [ "$OHM_SKIP_SETUP" = 1 ] || [ "$OHM_CHECK" = 1 ]; then
    missing "rustup, rust $RUST_TOOLCHAIN, target $rust_target"
  else
    note "installing rustup and rust $RUST_TOOLCHAIN"
    export RUSTUP_HOME="$OHM_TOOLS/rustup" CARGO_HOME="$OHM_TOOLS/cargo"
    curl --proto '=https' --tlsv1.2 -fsSL --retry 5 https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain "$RUST_TOOLCHAIN" --no-modify-path >/dev/null
    path_add "$CARGO_HOME/bin"
  fi
fi
if have rustup; then
  export RUSTUP_TOOLCHAIN="$RUST_TOOLCHAIN"
  if ! rustup toolchain list | grep -q "^$RUST_TOOLCHAIN"; then
    if [ "$OHM_SKIP_SETUP" = 1 ] || [ "$OHM_CHECK" = 1 ]; then missing "rust toolchain $RUST_TOOLCHAIN"; else rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal >/dev/null 2>&1; fi
  fi
  if rustup target list --installed 2>/dev/null | grep -qx "$rust_target"; then
    ok "rust $RUST_TOOLCHAIN for $rust_target"
  elif [ "$OHM_SKIP_SETUP" = 1 ] || [ "$OHM_CHECK" = 1 ]; then
    missing "rust target $rust_target"
  else
    rustup target add "$rust_target" >/dev/null 2>&1
    ok "rust $RUST_TOOLCHAIN for $rust_target"
  fi
fi

if [ "$OHM_CHECK" = 1 ]; then
  step "result"
  if [ "$OHM_MISSING" -eq 0 ]; then
    ok "everything is in place"
    exit 0
  fi
  log "  $OHM_MISSING thing(s) missing: run without --check to install them"
  exit 1
fi
[ "$OHM_MISSING" -eq 0 ] || die "$OHM_MISSING thing(s) missing (run without --skip-setup to install them)"
for tool in node pnpm cargo; do have "$tool" || die "$tool is needed (run without --skip-setup)"; done

cd "$OHM_ROOT"
# CI=true, not 1: the tauri command line takes only true or false.
export CI=true CARGO_BUILD_JOBS="$OHM_JOBS" CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$OHM_OUT/cargo-target-mac-tauri}"
# The version goes into the app (tauri's own setting) and into the JavaScript (Settings shows it).
export VITE_APP_VERSION="$OHM_VERSION"

run() {
  step "$1"
  shift
  "$@"
}
run "install dependencies" pnpm install --frozen-lockfile --filter '@ohmatrix/tauri...'
run "app icon from logo/colorful/1.svg" pnpm --filter @ohmatrix/tauri icons
run "Tauri build ($ARCH, dmg)" pnpm --filter @ohmatrix/tauri exec tauri build --target "$rust_target" --bundles dmg --config "{\"version\":\"$OHM_VERSION\"}"

step "collect the result"
built=$(find "$CARGO_TARGET_DIR/$rust_target/release/bundle/dmg" -maxdepth 1 -name "*.dmg" -type f 2>/dev/null | head -n1)
[ -n "$built" ] || die "tauri finished but there is no .dmg in $CARGO_TARGET_DIR/$rust_target/release/bundle/dmg"
case "$(basename "$built")" in *"$OHM_VERSION"*) ;; *) die "$(basename "$built") does not carry the version $OHM_VERSION" ;; esac
# The program inside has to be for the CPU asked for.
exe="$CARGO_TARGET_DIR/$rust_target/release/ohmatrix-tauri"
lipo -archs "$exe" | grep -qw "$([ "$ARCH" = aarch64 ] && echo arm64 || echo x86_64)" || die "ohmatrix-tauri is for $(lipo -archs "$exe"), not for $ARCH"
ok "ohmatrix-tauri is a $ARCH program"
dir="$OHM_RELEASE_DIR/mac_tauri"
mkdir -p "$dir"
name="OhMatrix_mac_tauri_${OHM_VERSION}_${ARCH}.dmg"
cp "$built" "$dir/$name"
ok "$dir/$name ($(du -h "$dir/$name" | cut -f1), sha256 $(shasum -a 256 "$dir/$name" | cut -d' ' -f1))"
step "done"
