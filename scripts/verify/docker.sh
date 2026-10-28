#!/usr/bin/env bash
# Runs the build scripts in a bare Debian container, from nothing: no cache is mounted, and the image has none of the tools
# (no curl, git, sudo, node, java). If the scripts get through here they need nothing from the machine, so a CI runner
# (GitHub's ubuntu-latest) will do too. The container's CPU and memory can be limited to see the scripts follow them.
#
#   scripts/verify/docker.sh [--entry ENTRY] [--version A.B.C] [--image IMAGE] [--cpus N] [--memory SIZE]
#                            [-- extra args for the build script]
#
#   --entry    which build to run: the name of a script without its build- and .sh, like web, android-arm64-v8a or
#              tauri-linux-x86_64; or both, web and android-arm64-v8a (default both)
#   --version  the version to build (default 9.9.9); the result is checked for it
#   --keep DIR keep what is built: DIR (on this machine) is where the container's release folder is written, instead of vanishing with it
#   --image    the base image (default debian:bookworm-slim, the older of the two current Debians)
#   --cpus     limit the container to this many CPUs  (GitHub's runners: 4 for public repositories, 2 for private)
#   --memory   limit its memory, e.g. 16g              (GitHub's runners: 16g for public repositories, 8g for private)
#
# For each build: --check on the bare system (it must name what is missing), the build, --check again (everything in place),
# and for the web build a second run (nothing installed again). The output ends with the disk the build used.
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)

entry=both
version=9.9.9
keep=
image=debian:bookworm-slim
cpus=
memory=
extra=()
while [ $# -gt 0 ]; do
  case "$1" in
    --entry)
      entry=$2
      shift
      ;;
    --version)
      version=$2
      shift
      ;;
    --keep)
      keep=$2
      shift
      ;;
    --image)
      image=$2
      shift
      ;;
    --cpus)
      cpus=$2
      shift
      ;;
    --memory)
      memory=$2
      shift
      ;;
    --)
      shift
      extra=("$@")
      break
      ;;
    *)
      echo "unknown option: $1 (see the top of $0)" >&2
      exit 2
      ;;
  esac
  shift
done
[ "$entry" = both ] || [ -f "$here/../build-$entry.sh" ] || {
  echo "--entry is both, or the name of a script here without build- and .sh (web, android-arm64-v8a, tauri-linux-x86_64...)" >&2
  exit 2
}
[ -z "$keep" ] || mkdir -p "$keep"
command -v docker >/dev/null || {
  echo "docker is not installed here" >&2
  exit 1
}

limits=()
[ -n "$cpus" ] && limits+=(--cpus "$cpus")
[ -n "$memory" ] && limits+=(--memory "$memory" --memory-swap "$memory") # no swap, so a shortage shows up as one

# What runs inside: unpack the source from stdin, then the steps above.
inside=$(
  cat <<'INNER'
set -eu
mkdir -p /work/repo
tar -x -C /work/repo
cd /work/repo
echo "### the bare system: $(. /etc/os-release && echo "$PRETTY_NAME"), bash $BASH_VERSION, user $(id -un)"
for t in curl git sudo unzip node java cargo; do command -v "$t" >/dev/null && echo "    has $t" || echo "    no $t"; done
df -h / | tail -1 | sed 's/^/    disk: /'
for e in $ENTRIES; do
  extra=""
  case "$e" in web) ;; *) extra="$EXTRA" ;; esac
  echo; echo "### build-$e.sh --check on the bare system (it must name what is missing)"
  bash "scripts/build-$e.sh" --check --version "$VERSION" $extra && echo "    (nothing missing: not a bare system?)" || echo "    exit $? : as expected"
  echo; echo "### build-$e.sh --version $VERSION"
  start=$(date +%s)
  bash "scripts/build-$e.sh" --version "$VERSION" $extra
  echo "### build-$e.sh took $(( $(date +%s) - start )) s"
  echo; echo "### build-$e.sh --check after the build (everything must be in place)"
  bash "scripts/build-$e.sh" --check --version "$VERSION" $extra
  if [ "$e" = web ]; then
    echo; echo "### build-web.sh again (it must not install anything again)"
    bash scripts/build-web.sh --version "$VERSION" 2>&1 | tee /tmp/second-run.log | tail -6
    if grep -qE 'installing|downloading' /tmp/second-run.log; then echo "!!! the second run installed something"; exit 1; fi
  fi
done
echo; echo "### disk used"
df -h / | tail -1
du -sh "$HOME/.ohmatrix-tools" "$HOME/release" /work/repo/build-out 2>/dev/null || true
echo; echo "### result: $HOME/release"
ls -la "$HOME/release/web/index.html" "$HOME/release/android/" "$HOME/release/tauri-linux/" 2>/dev/null || true
echo "### DONE"
INNER
)

entries=$entry
[ "$entry" = both ] && entries="web android-arm64-v8a"

echo "version $version, image $image, cpus ${cpus:-unlimited}, memory ${memory:-unlimited}, entries: $entries"
cd "$root"
tar -c \
  --exclude='./.git' --exclude='*/node_modules' --exclude='./node_modules' --exclude='./build-out' --exclude='*/dist' \
  --exclude='./src/packages/engine-rust/rust_modules' --exclude='./src/packages/engine-rust/target' \
  --exclude='./src/packages/engine-rust/cpp' --exclude='./src/packages/engine-rust/android' --exclude='./src/packages/engine-rust/ios' \
  --exclude='./src/packages/engine-rust/src/generated' --exclude='./src/apps/mobile/android' --exclude='./src/apps/mobile/ios' \
  --exclude='./src/dev/synapse/data' --exclude='./src/e2e/.out' \
  . |
  docker run --rm -i "${limits[@]}" ${keep:+-v "$keep:/out" -e OHM_RELEASE_DIR=/out} -e ENTRIES="$entries" -e VERSION="$version" -e EXTRA="${extra[*]}" "$image" bash -c "$inside"
