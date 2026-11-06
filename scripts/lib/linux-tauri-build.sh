# shellcheck shell=bash disable=SC2154,SC2153
# Sourced by build-linux-tauri-<arch>.sh, which sets `here` (this folder) and `ARCH` (the CPU the script builds for).
set -euo pipefail
# shellcheck source=lib/common.sh
source "$here/lib/common.sh"
source "$here/lib/versions.sh"
source "$here/lib/privilege.sh"
source "$here/lib/resources.sh"
source "$here/lib/release.sh"
source "$here/lib/args.sh"
source "$here/setup/apt.sh"
source "$here/setup/node.sh"
source "$here/setup/rust.sh"

ohm_parse_common "$@"
[ ${#OHM_REST[@]} -eq 0 ] || die "unknown option: ${OHM_REST[0]} (see the top of $0)"
require_version
rust_target=$(tauri_rust_target_of "$ARCH") || die "unknown architecture '$ARCH'"
[ "$(uname -m)" = "$ARCH" ] || die "this builds for $ARCH and must run on a $ARCH machine (this one is $(uname -m)): the web view it links against comes from the machine's own packages"

resources_init
resources_summary
resources_require tauri 3072 6 10

if [ "$OHM_SKIP_SETUP" = 0 ]; then
  step "tools"
  setup_apt "${APT_BASE[@]}" "${APT_TAURI[@]}"
  setup_node
  setup_pnpm
  setup_rust "$rust_target"
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
for tool in node pnpm cargo; do have "$tool" || die "$tool is needed (run without --skip-setup)"; done

cd "$OHM_ROOT"
# CI=true, not 1: the tauri command line takes only true or false.
export CI=true CARGO_BUILD_JOBS="$OHM_JOBS" CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$OHM_OUT/cargo-target-linux-tauri}"
# The version goes into the packages (tauri's own setting) and into the JavaScript (Settings shows it). A build in a container has no
# FUSE, which the AppImage tools use to run themselves: they unpack instead.
export VITE_APP_VERSION="$OHM_VERSION" NODE_OPTIONS="--max-old-space-size=$OHM_NODE_HEAP_MB" APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true

run_step "install dependencies" pnpm install --frozen-lockfile --filter '@ohmatrix/tauri...'
run_step "app icon from logo/colorful/1.svg" pnpm --filter @ohmatrix/tauri icons
bundles=(deb rpm appimage)
run_step "Tauri build ($ARCH, ${bundles[*]})" pnpm --filter @ohmatrix/tauri exec tauri build --bundles "$(IFS=,; echo "${bundles[*]}")" --config "{\"version\":\"$OHM_VERSION\"}"

step "collect the result"
bundle_dir="$CARGO_TARGET_DIR/release/bundle"
dir="$OHM_RELEASE_DIR/linux_tauri"
mkdir -p "$dir"
for kind in "deb:deb" "rpm:rpm" "appimage:AppImage"; do
  folder=${kind%%:*}
  extension=${kind##*:}
  built=$(find "$bundle_dir/$folder" -maxdepth 1 -name "*.$extension" -type f 2>/dev/null | head -n1)
  [ -n "$built" ] || die "tauri finished but there is no .$extension in $bundle_dir/$folder"
  grep -q "$OHM_VERSION" <<<"$(basename "$built")" || die "$(basename "$built") does not carry the version $OHM_VERSION"
  name="OhMatrix_linux_tauri_${OHM_VERSION}_${ARCH}.$extension"
  cp "$built" "$dir/$name"
  ok "$dir/$name ($(du -h "$dir/$name" | cut -f1), sha256 $(sha256sum "$dir/$name" | cut -d' ' -f1))"
done
step "done"
