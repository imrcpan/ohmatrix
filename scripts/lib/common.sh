# shellcheck shell=bash
# Helpers shared by the build scripts. Source it; it does nothing on its own.

OHM_ROOT="${OHM_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OHM_TOOLS="${OHM_TOOLS:-$HOME/.ohmatrix-tools}" # what is installed here is only for this project, nothing goes into the system outside apt
OHM_OUT="${OHM_OUT:-$OHM_ROOT/build-out}"
OHM_CHECK="${OHM_CHECK:-0}" # 1: only report what is missing
OHM_MISSING=0

log() { printf '%s\n' "$*" >&2; }
step() { printf '\n==> %s [%s]\n' "$*" "$(date +%H:%M:%S)" >&2; }
ok() { printf '  ok       %s\n' "$*" >&2; }
note() { printf '  ..       %s\n' "$*" >&2; }
warn() { printf '  warning  %s\n' "$*" >&2; }
die() {
  printf '  error    %s\n' "$*" >&2
  exit 1
}
# A thing that is not there. In --check mode that is the report; otherwise the caller goes on to install it.
missing() {
  printf '  missing  %s\n' "$*" >&2
  OHM_MISSING=$((OHM_MISSING + 1))
}

have() { command -v "$1" >/dev/null 2>&1; }

# version_ge A B: A >= B, as dotted versions.
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

# Add a directory to the front of PATH once.
path_add() {
  case ":$PATH:" in *":$1:"*) ;; *) PATH="$1:$PATH" ;; esac
  export PATH
}

# download URL DEST [SHA256]: retries, and checks the checksum when one is given.
download() {
  local url=$1 dest=$2 sum=${3:-}
  mkdir -p "$(dirname "$dest")"
  curl --fail --location --silent --show-error --retry 5 --retry-delay 3 --retry-connrefused --output "$dest" "$url" || die "could not download $url"
  if [ -n "$sum" ]; then
    echo "$sum  $dest" | sha256sum -c --status - || die "checksum of $(basename "$dest") does not match (wanted $sum)"
  fi
}

# Memory the programs hold right now, in MB: what is allocated, not the file cache (the kernel takes that back when it is needed, so it
# says nothing about what a build requires). From the cgroup when the system has one (a container, a CI job), else the whole machine.
used_mem_mb() {
  if [ -r /sys/fs/cgroup/memory.stat ]; then
    awk '/^anon / {printf "%d", $2 / 1048576}' /sys/fs/cgroup/memory.stat
  elif [ -r /sys/fs/cgroup/memory/memory.stat ]; then
    awk '/^total_rss / {printf "%d", $2 / 1048576}' /sys/fs/cgroup/memory/memory.stat
  else
    awk '/^MemTotal:/ {t = $2} /^MemAvailable:/ {a = $2} END {printf "%d", (t - a) / 1024}' /proc/meminfo
  fi
}

# mem_watch FILE: until it is killed, keeps the highest used_mem_mb seen in FILE.
mem_watch() {
  local max=0 now
  while :; do
    now=$(used_mem_mb)
    if [ -n "$now" ] && [ "$now" -gt "$max" ]; then
      max=$now
      echo "$max" >"$1"
    fi
    sleep 1
  done
}

# Free disk space in GB where the build happens (or at the path given).
free_disk_gb() { df -Pk "${1:-$OHM_OUT}" | awk 'NR == 2 {print int($4 / 1024 / 1024)}'; }

# Run a command with a timer: run_step "what" cmd args...  It says how long it took, how much disk is left, and the most memory
# the programs held during it, so a run's log shows what each step needs (that is what the memory requirements are set from).
run_step() {
  local what=$1 start end status=0 watch_file watcher peak
  shift
  step "$what"
  watch_file=$(mktemp)
  echo 0 >"$watch_file"
  mem_watch "$watch_file" &
  watcher=$!
  start=$(date +%s)
  "$@" || status=$?
  end=$(date +%s)
  kill "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true
  peak=$(cat "$watch_file")
  rm -f "$watch_file"
  [ "$status" -eq 0 ] || return "$status"
  note "$what took $((end - start)) s; free disk $(free_disk_gb) GB; memory held, at most $peak MB"
}

# The machine's kind, in the words the download pages use.
host_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo x64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) die "unsupported machine type $(uname -m)" ;;
  esac
}
