# shellcheck shell=bash disable=SC2154
# Sourced by build-android-<abi>.sh, which sets `here` (this folder) and `ABI` (the one ABI the script builds).
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
source "$here/setup/java.sh"
source "$here/setup/rust.sh"
source "$here/setup/android-sdk.sh"

variant=release
save_disk=auto
ohm_parse_common "$@"
set -- "${OHM_REST[@]+"${OHM_REST[@]}"}"
while [ $# -gt 0 ]; do
  case "$1" in
    --release) variant=release ;;
    --debug) variant=debug ;;
    --google-services)
      [ $# -ge 2 ] || die "--google-services needs a file"
      export OHM_GOOGLE_SERVICES=$2
      shift
      ;;
    --google-services=*) export OHM_GOOGLE_SERVICES=${1#--google-services=} ;;
    --save-disk) save_disk=1 ;;
    --no-save-disk) save_disk=0 ;;
    *) die "unknown option: $1 (see the top of $0)" ;;
  esac
  shift
done
require_version
rust_target=$(rust_target_of "$ABI") || die "unknown ABI '$ABI'"

resources_init
if [ "$save_disk" = auto ]; then
  if [ "$OHM_DISK_GB" -lt 30 ]; then save_disk=1; else save_disk=0; fi
fi
resources_summary
[ "$save_disk" = 1 ] && note "saving disk: the Rust build output is deleted once the library is built"
# What a build takes, from a bare machine (measured in a container): about 19 GB of disk, or about 14 GB when the Rust output is deleted
# along the way. Memory: after shrinkBinding the biggest compile is 1.8 GB, Gradle holds about 2.4 GB and the Kotlin daemon about 1.2 GB;
# the most the programs held in a run was 5.7 GB (in a container held to 8 GB with no swap, where it passed). The minimum is set to 6 GB
# on that: it is not tested below 8 GB.
if [ "$save_disk" = 1 ]; then resources_require android 6144 15 18; else resources_require android 6144 20 24; fi

if [ "$OHM_SKIP_SETUP" = 0 ]; then
  step "tools"
  setup_apt "${APT_BASE[@]}" "${APT_ANDROID[@]}"
  setup_node
  setup_pnpm
  setup_java
  setup_rust "$rust_target"
  setup_cargo_ndk
  setup_android_sdk
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
for tool in node pnpm java cargo; do have "$tool" || die "$tool is needed (run without --skip-setup)"; done
[ -n "${ANDROID_NDK_HOME:-}" ] || die "ANDROID_NDK_HOME is not set (run without --skip-setup, or set ANDROID_HOME)"

cd "$OHM_ROOT"
export CI=1 CARGO_BUILD_JOBS="$OHM_JOBS" CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$OHM_OUT/cargo-target}"
# The version goes into the APK (app.config.js: versionName and versionCode) and into the JavaScript (Settings shows it).
export EXPO_PUBLIC_NATIVE_SELFTEST=0 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=$OHM_NODE_HEAP_MB" EXPO_PUBLIC_APP_VERSION="$OHM_VERSION"

run_step "install dependencies" pnpm install --frozen-lockfile --filter '@ohmatrix/mobile...'

# The app icon is drawn from the SVG logo here and never kept in the repository.
run_step "app icon from logo/colorful-full/1.svg" bash -c 'cd src/apps/mobile && node scripts/makeIcons.mjs'

# The NDK set up above is the one React Native asks for; if it asks for another, Gradle would fetch that one itself.
rn_dir=$(cd src/apps/mobile && node -p "require('path').dirname(require.resolve('react-native/package.json'))") || die "cannot find react-native in the installed dependencies"
rn_ndk=$(awk -F'"' '/^ndkVersion/ {print $2}' "$rn_dir/gradle/libs.versions.toml")
[ "$rn_ndk" = "$ANDROID_NDK" ] || die "react-native wants NDK $rn_ndk but scripts/lib/versions.sh pins $ANDROID_NDK: update ANDROID_NDK there"
ok "react-native's NDK ($rn_ndk) is the one installed"

jni_libs=src/packages/engine-rust/android/src/main/jniLibs
task=":app:assemble$(tr '[:lower:]' '[:upper:]' <<<"${variant:0:1}")${variant:1}"
# ubrn takes the profile by name (and it wins over --release); the library ends up in target/<triple>/<profile>.
engine_flags=()
if [ "$variant" = release ]; then
  engine_flags+=(--profile "$RUST_RELEASE_PROFILE")
  profile_var="CARGO_PROFILE_$(tr '[:lower:]-' '[:upper:]_' <<<"$RUST_RELEASE_PROFILE")_CODEGEN_UNITS"
  export "$profile_var=$RUST_RELEASE_CODEGEN_UNITS"
fi
suffix=""
[ "$variant" = debug ] && suffix="_debug"

# What the aapt of the SDK says an APK is: name, version, and which ABIs have native code. Stops if it is not what was asked for.
check_apk() {
  local apk=$1 abi=$2 aapt badging code want_code
  aapt=$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort -V | tail -n1)
  [ -n "$aapt" ] || die "no aapt in the Android SDK's build-tools"
  badging=$("$aapt" dump badging "$apk")
  want_code=$(node -p "require('./src/apps/mobile/version.cjs').versionCodeOf('$OHM_VERSION', '$abi')")
  grep -q "versionName='$OHM_VERSION'" <<<"$badging" || die "$(basename "$apk"): its version name is not $OHM_VERSION"
  grep -q "versionCode='$want_code'" <<<"$badging" || die "$(basename "$apk"): its version code is not $want_code"
  [ "$(grep '^native-code:' <<<"$badging")" = "native-code: '$abi'" ] || die "$(basename "$apk"): its native code is not only $abi ($(grep '^native-code:' <<<"$badging"))"
  code=$want_code
  # The JavaScript must hold the Rust engine: with the engine's files missing (an old Metro cache), the app starts, but on the mock.
  # `RustEngineCore` is the engine's class (packages/engine-rust/src/engine.ts); Hermes keeps such names as text. (Not `installRustCrate`:
  # that one is in a file of the package that was packed even in the broken build.)
  # (Counted, not `grep -q`: that stops at the first match, unzip then dies of the closed pipe, and pipefail calls it a failure.)
  [ "$(unzip -p "$apk" assets/index.android.bundle | grep -ac RustEngineCore)" -gt 0 ] || die "$(basename "$apk"): its JavaScript has no Rust engine (RustEngineCore is not in it): the app would run on the mock engine"
  ok "$(basename "$apk"): version $OHM_VERSION, code $code, native code $abi only, with the Rust engine"
}

build_abi() {
  local abi=$1 triple apk dir name lib
  triple=$rust_target
  step "== $abi, version $OHM_VERSION"
  export OHM_ABI=$abi

  # The Rust Matrix SDK, its bindings and the TurboModule (the existing script does the checkout, the patch and ubrn).
  run_step "Rust library and bindings ($abi, $variant${engine_flags[1]:+, profile ${engine_flags[1]}})" bash -c 'cd src/packages/engine-rust && ./scripts/build-android.sh "$@"' _ --targets "$abi" "${engine_flags[@]+"${engine_flags[@]}"}"
  # This APK takes the libraries of this ABI only: the ones of an ABI built before are not packed into it.
  for lib in "$jni_libs"/*/; do
    [ -d "$lib" ] || continue
    [ "$(basename "$lib")" = "$abi" ] || rm -rf "$lib"
  done
  if [ "$save_disk" = 1 ]; then
    rm -rf "${CARGO_TARGET_DIR:?}/$triple"
    note "free disk $(free_disk_gb) GB after deleting the Rust build output of $abi"
  fi

  run_step "generate the Android project ($abi)" bash -c 'cd src/apps/mobile && pnpm exec expo prebuild --platform android --no-install --clean'


  # Metro's cache of an earlier build (in the temporary folder, outside the build folder) must not be used: it keeps the JavaScript of
  # files as they were then, so a build that follows a change of the sources (a new file in a package) can pack an app that lacks it.
  # This once packed the app without the Rust engine (1009 modules instead of 1027), and the app ran on the in-memory mock.
  rm -rf "${TMPDIR:-/tmp}"/metro-cache "${TMPDIR:-/tmp}"/metro-file-map-*

  # shellcheck disable=SC2016 # the variables are read by the inner shell, which has them from the environment
  run_step "Gradle $task ($abi)" bash -c 'cd src/apps/mobile/android && ./gradlew --no-daemon \
    "-Dorg.gradle.jvmargs=-Xmx${OHM_GRADLE_XMX_MB}m -XX:MaxMetaspaceSize=512m" \
    "-Dkotlin.daemon.jvm.options=-Xmx${OHM_KOTLIN_XMX_MB}m" \
    "-Dorg.gradle.workers.max=${OHM_GRADLE_WORKERS}" "-PreactNativeArchitectures=$1" "$0" -x lint' "$task" "$abi"

  apk="$OHM_ROOT/src/apps/mobile/android/app/build/outputs/apk/$variant/app-$variant.apk"
  [ -f "$apk" ] || die "Gradle finished but there is no $apk"
  check_apk "$apk" "$abi"
  dir="$OHM_RELEASE_DIR/android"
  name="OhMatrix_android_${OHM_VERSION}_${abi}${suffix}.apk"
  mkdir -p "$dir"
  cp "$apk" "$dir/$name"
  ok "$dir/$name ($(du -h "$dir/$name" | cut -f1), sha256 $(sha256sum "$dir/$name" | cut -d' ' -f1))"
}

build_abi "$ABI"

if [ "$save_disk" = 1 ] && [ -d "$OHM_TOOLS/cargo/registry" ]; then
  rm -rf "$OHM_TOOLS/cargo/registry" "$OHM_TOOLS/cargo/git"
  note "free disk $(free_disk_gb) GB after deleting the crates"
fi
step "done"
apk="$OHM_RELEASE_DIR/android/OhMatrix_android_${OHM_VERSION}_${ABI}${suffix}.apk"
note "$apk ($(du -h "$apk" | cut -f1))"
warn "signed with the debug key: fine to install, not to publish"
