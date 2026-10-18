# shellcheck shell=bash
# Packages from the distribution, only the ones that are missing.

setup_apt() {
  local pkg log_file missing_pkgs=()
  if ! have dpkg-query; then
    warn "not a Debian-based system: make sure these are installed: $*"
    return 0
  fi
  for pkg in "$@"; do
    dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed' || missing_pkgs+=("$pkg")
  done
  if [ ${#missing_pkgs[@]} -eq 0 ]; then
    ok "system packages ($#)"
    return 0
  fi
  if [ "$OHM_CHECK" = 1 ]; then
    missing "system packages: ${missing_pkgs[*]}"
    return 0
  fi
  note "installing ${missing_pkgs[*]}"
  export DEBIAN_FRONTEND=noninteractive
  log_file="$OHM_OUT/logs/apt.log"
  mkdir -p "$(dirname "$log_file")"
  # apt is chatty (dpkg redraws its progress): the output goes to a log, and is shown only when something fails.
  {
    as_root apt-get update -qq &&
      as_root apt-get install -y -qq --no-install-recommends -o Dpkg::Use-Pty=0 "${missing_pkgs[@]}"
  } >"$log_file" 2>&1 || {
    tail -n 30 "$log_file" >&2
    die "installing system packages failed (log: $log_file)"
  }
}
