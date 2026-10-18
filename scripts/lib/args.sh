# shellcheck shell=bash
# The options every entry script takes. ohm_parse_common sets OHM_CHECK, OHM_SKIP_SETUP, OHM_JOBS, OHM_VERSION and
# OHM_RELEASE_DIR and puts what it does not know into OHM_REST, for the entry script to read.

OHM_SKIP_SETUP=0
OHM_REST=()

ohm_parse_common() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --check) OHM_CHECK=1 ;;
      --skip-setup) OHM_SKIP_SETUP=1 ;;
      --jobs)
        [ $# -ge 2 ] || die "--jobs needs a number"
        OHM_JOBS=$2
        shift
        ;;
      --jobs=*) OHM_JOBS=${1#--jobs=} ;;
      --version)
        [ $# -ge 2 ] || die "--version needs a version, like 1.2.3"
        OHM_VERSION=$2
        shift
        ;;
      --version=*) OHM_VERSION=${1#--version=} ;;
      --release-dir)
        [ $# -ge 2 ] || die "--release-dir needs a directory"
        OHM_RELEASE_DIR=$2
        shift
        ;;
      --release-dir=*) OHM_RELEASE_DIR=${1#--release-dir=} ;;
      *) OHM_REST+=("$1") ;;
    esac
    shift
  done
  if [ -n "${OHM_JOBS:-}" ]; then
    [[ $OHM_JOBS =~ ^[1-9][0-9]*$ ]] || die "--jobs wants a positive number, not '$OHM_JOBS'"
  fi
  if [ -n "${OHM_VERSION:-}" ]; then validate_version "$OHM_VERSION"; fi
  export OHM_CHECK OHM_SKIP_SETUP OHM_RELEASE_DIR
  if [ -n "${OHM_VERSION:-}" ]; then export OHM_VERSION; fi
}
