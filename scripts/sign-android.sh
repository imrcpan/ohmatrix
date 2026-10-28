#!/usr/bin/env bash
# Signs built APKs with the release key, after the build: the build never sees the key. Each APK is aligned (zipalign), signed
# (apksigner, schemes v2 and v3; whatever signature it had is replaced), and then checked: its signing certificate's SHA-256 must be the
# one you give. Nothing is installed and nothing is built; it needs the Android SDK's build-tools and a JDK.
#
#   scripts/sign-android.sh --keystore FILE --key-alias ALIAS --expect-sha256 FINGERPRINT [--out-dir DIR] APK...
#
#   --keystore       the release keystore (kept outside the repository)
#   --key-alias      the key's alias in it
#   --expect-sha256  the SHA-256 of the release certificate, as `keytool -list -v` prints it (with or without the colons). A signed APK
#                    with any other certificate is deleted and the script fails: it is how a wrong key, or the debug key, is caught
#   --out-dir        where the signed APKs go, under their own names (default: a folder "signed" next to each APK). The input is not changed
#
# The passwords are read from the environment, never from the command line (which others can see in the process list):
#   OHM_KEYSTORE_PASSWORD   the keystore's password
#   OHM_KEY_PASSWORD        the key's password (default: the keystore's, which is what a PKCS12 keystore has)
# The SDK is found from ANDROID_HOME / ANDROID_SDK_ROOT or in OHM_TOOLS (where the build-android scripts install it).
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$here/lib/common.sh"
source "$here/lib/versions.sh"

keystore=
alias_=
expect=
out_dir=
apks=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keystore)
      [ $# -ge 2 ] || die "--keystore needs a file"
      keystore=$2
      shift
      ;;
    --keystore=*) keystore=${1#--keystore=} ;;
    --key-alias)
      [ $# -ge 2 ] || die "--key-alias needs an alias"
      alias_=$2
      shift
      ;;
    --key-alias=*) alias_=${1#--key-alias=} ;;
    --expect-sha256)
      [ $# -ge 2 ] || die "--expect-sha256 needs a fingerprint"
      expect=$2
      shift
      ;;
    --expect-sha256=*) expect=${1#--expect-sha256=} ;;
    --out-dir)
      [ $# -ge 2 ] || die "--out-dir needs a directory"
      out_dir=$2
      shift
      ;;
    --out-dir=*) out_dir=${1#--out-dir=} ;;
    -h | --help)
      sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --*) die "unknown option: $1 (see the top of $0)" ;;
    *) apks+=("$1") ;;
  esac
  shift
done

[ -n "$keystore" ] || die "--keystore is required (there is no fallback to the debug key)"
[ -n "$alias_" ] || die "--key-alias is required"
[ -n "$expect" ] || die "--expect-sha256 is required: without it a wrong key could be signed with unnoticed"
[ ${#apks[@]} -gt 0 ] || die "no APK given"
[ -f "$keystore" ] || die "keystore not found: $keystore"
[ -n "${OHM_KEYSTORE_PASSWORD:-}" ] || die "OHM_KEYSTORE_PASSWORD is not set (the password is read from the environment, not from an option)"
export OHM_KEYSTORE_PASSWORD
export OHM_KEY_PASSWORD="${OHM_KEY_PASSWORD:-$OHM_KEYSTORE_PASSWORD}"

# The fingerprint, in one form: 64 upper case hex digits.
norm() { printf '%s' "$1" | tr -d ': \t' | tr 'a-f' 'A-F'; }
expect=$(norm "$expect")
[[ $expect =~ ^[0-9A-F]{64}$ ]] || die "--expect-sha256 is not a SHA-256 (64 hex digits, colons allowed)"

for a in "${apks[@]}"; do [ -f "$a" ] || die "APK not found: $a"; done
have java || die "java is needed by apksigner"

# The build-tools of the version the build uses, from the SDK that is there.
tools=
for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$OHM_TOOLS/android-sdk"; do
  if [ -n "$sdk" ] && [ -d "$sdk/build-tools/$ANDROID_BUILD_TOOLS" ]; then
    tools="$sdk/build-tools/$ANDROID_BUILD_TOOLS"
    break
  fi
done
[ -n "$tools" ] || die "no Android build-tools $ANDROID_BUILD_TOOLS (set ANDROID_HOME, or run a build-android script once to install the SDK)"
zipalign="$tools/zipalign"
apksigner="$tools/apksigner"
[ -x "$zipalign" ] || die "no zipalign in $tools"
[ -x "$apksigner" ] || die "no apksigner in $tools"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

signed=0
for apk in "${apks[@]}"; do
  name=$(basename "$apk")
  dir=${out_dir:-$(dirname "$apk")/signed}
  mkdir -p "$dir"
  out="$dir/$name"
  [ "$(cd "$dir" && pwd)/$name" != "$(cd "$(dirname "$apk")" && pwd)/$name" ] || die "the output would replace the input ($apk): choose another --out-dir"
  step "signing $name"

  # Aligned first, signed last: a change after the signature would break it.
  "$zipalign" -f -p 4 "$apk" "$work/aligned.apk" || die "zipalign failed on $apk"
  "$apksigner" sign \
    --ks "$keystore" --ks-key-alias "$alias_" \
    --ks-pass env:OHM_KEYSTORE_PASSWORD --key-pass env:OHM_KEY_PASSWORD \
    --v2-signing-enabled true --v3-signing-enabled true \
    --out "$work/signed.apk" "$work/aligned.apk" || die "apksigner could not sign $apk (wrong alias or password?)"

  certs=$("$apksigner" verify --verbose --print-certs "$work/signed.apk") || die "the signature of $name does not verify"
  got=$(printf '%s\n' "$certs" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -n1)
  [ -n "$got" ] || die "could not read the certificate's SHA-256 from apksigner's report"
  got=$(norm "$got")
  if [ "$got" != "$expect" ]; then
    die "$name is signed with certificate $got, not the expected $expect; nothing was written for it"
  fi
  if printf '%s\n' "$certs" | grep -q 'CN=Android Debug'; then die "$name is signed with the Android debug key; nothing was written for it"; fi

  rm -f "$out" "$out.idsig"
  mv "$work/signed.apk" "$out"
  rm -f "$work/aligned.apk"
  ok "$out (v2/v3, certificate SHA-256 $got)"
  signed=$((signed + 1))
done
log ""
log "signed $signed APK(s); the certificate is the expected one"
