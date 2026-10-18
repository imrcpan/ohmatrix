# shellcheck shell=bash
# The version of a release build and where the finished files go.

OHM_RELEASE_DIR="${OHM_RELEASE_DIR:-$HOME/release}"

# validate_version A.B.C: digits only, with the limits apps/mobile/version.cjs has (the Android version code gives the minor and the
# patch two digits each). The two must agree: apps/mobile/src/version.test.ts holds the cases for that side.
validate_version() {
  local v=$1
  [[ $v =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || die "the version must look like a.b.c (digits only), not '$v'"
  [ "${#BASH_REMATCH[1]}" -le 4 ] || die "in a.b.c the a is at most 9999, not '$v'"
  [ "$((10#${BASH_REMATCH[2]}))" -le 99 ] && [ "$((10#${BASH_REMATCH[3]}))" -le 99 ] || die "in a.b.c the b and c are at most 99, not '$v'"
}

# A release build needs a version, and gets it from --version (or OHM_VERSION). Checking the tools (--check) does not.
require_version() {
  if [ -z "${OHM_VERSION:-}" ]; then
    [ "$OHM_CHECK" = 1 ] && return 0
    die "say which version this is: --version a.b.c"
  fi
  validate_version "$OHM_VERSION"
}
