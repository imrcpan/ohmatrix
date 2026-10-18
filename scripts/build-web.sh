#!/usr/bin/env bash
# Builds the web app into ~/release/web (the version is shown in Settings). On a bare Debian this is one command: it installs
# what is missing (system packages, Node, pnpm), then installs the dependencies and builds. What is already there is used as it is.
#
#   scripts/build-web.sh --version a.b.c [--release-dir DIR] [--check] [--skip-setup] [--jobs N]
#
#   --version     the version of this build, like 1.2.3 (required, except with --check)
#   --release-dir where the result goes: DIR/web (default ~/release)
#   --check       only report what is missing (and whether the machine is big enough); install and build nothing
#   --skip-setup  do not install anything, use what is on the machine
#   --jobs N      parallel jobs, instead of what the machine's CPUs and memory allow
#
# Environment: VITE_DEFAULT_HOMESERVER (the server offered on the sign-in screen), OHM_TOOLS (where tools are installed,
# default ~/.ohmatrix-tools), OHM_OUT (caches and logs, default build-out), OHM_RELEASE_DIR (default ~/release).
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$here/lib/common.sh"
source "$here/lib/versions.sh"
source "$here/lib/privilege.sh"
source "$here/lib/resources.sh"
source "$here/lib/release.sh"
source "$here/lib/args.sh"
source "$here/setup/apt.sh"
source "$here/setup/node.sh"

ohm_parse_common "$@"
[ ${#OHM_REST[@]} -eq 0 ] || die "unknown option: ${OHM_REST[0]} (see the top of $0)"
require_version

resources_init
resources_summary
resources_require web 2048 3 5

if [ "$OHM_SKIP_SETUP" = 0 ]; then
  step "tools"
  setup_apt "${APT_BASE[@]}"
  setup_node
  setup_pnpm
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
for tool in node pnpm; do have "$tool" || die "$tool is needed (run without --skip-setup)"; done

cd "$OHM_ROOT"
export CI=1 VITE_APP_VERSION="$OHM_VERSION"
run_step "install dependencies (web only)" pnpm install --frozen-lockfile --filter '@ohmatrix/web...'
run_step "build the web app" env NODE_OPTIONS="--max-old-space-size=$OHM_NODE_HEAP_MB" pnpm --filter @ohmatrix/web build

step "collect the result"
rm -rf "$OHM_RELEASE_DIR/web"
mkdir -p "$OHM_RELEASE_DIR"
cp -a "$OHM_ROOT/src/apps/web/dist" "$OHM_RELEASE_DIR/web"
grep -rqF "$OHM_VERSION" "$OHM_RELEASE_DIR/web/assets" || die "the version $OHM_VERSION is not in the built files: it would not show in Settings"
ok "$OHM_RELEASE_DIR/web, version $OHM_VERSION ($(du -sh "$OHM_RELEASE_DIR/web" | cut -f1))"
