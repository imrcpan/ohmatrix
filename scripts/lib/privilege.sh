# shellcheck shell=bash
# Running a command as root: directly when we are root, through sudo otherwise.

as_root() {
  if [ "$(id -u)" = 0 ]; then
    "$@"
  elif have sudo; then
    sudo -n "$@" || die "sudo needs a password; run as root or give this user passwordless sudo"
  else
    die "this step needs root (installing packages) and there is no sudo: run as root, or install these yourself: $*"
  fi
}
