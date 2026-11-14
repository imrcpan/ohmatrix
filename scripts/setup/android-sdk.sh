# shellcheck shell=bash
# The Android SDK pieces the build needs: the NDK, a platform, build tools, platform tools. An SDK that already has them
# (ANDROID_HOME, such as a CI runner's) is used as it is; one that lacks some gets them if we may write there; otherwise
# the SDK is our own, under OHM_TOOLS.

_sdk_complete() {
  [ -d "$1/ndk/$ANDROID_NDK" ] && [ -d "$1/platforms/android-$ANDROID_PLATFORM" ] && [ -d "$1/build-tools/$ANDROID_BUILD_TOOLS" ] && [ -d "$1/platform-tools" ] && [ -d "$1/cmake/$ANDROID_CMAKE" ]
}

_use_sdk() {
  export ANDROID_HOME="$1" ANDROID_SDK_ROOT="$1" ANDROID_NDK_HOME="$1/ndk/$ANDROID_NDK"
}

# The sdkmanager under $1, fetching the command line tools into it when there are none.
_sdkmanager() {
  local sdk=$1 found zip
  found=$(find "$sdk/cmdline-tools" -path '*/bin/sdkmanager' 2>/dev/null | head -n1 || true)
  if [ -z "$found" ]; then
    zip="$sdk/cmdline-tools.zip"
    note "downloading the Android command line tools $ANDROID_CMDLINE_TOOLS"
    download "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS}_latest.zip" "$zip" "$ANDROID_CMDLINE_TOOLS_SHA256"
    unzip -q "$zip" -d "$sdk/cmdline-tools-tmp"
    mkdir -p "$sdk/cmdline-tools"
    mv "$sdk/cmdline-tools-tmp/cmdline-tools" "$sdk/cmdline-tools/latest"
    rm -rf "$sdk/cmdline-tools-tmp" "$zip"
    found="$sdk/cmdline-tools/latest/bin/sdkmanager"
  fi
  printf '%s' "$found"
}

setup_android_sdk() {
  local sdk dir manager log
  [ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || die "the Android NDK has no build for this machine ($(uname -sm)); use an x86_64 Linux"
  for dir in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$OHM_TOOLS/android-sdk"; do
    if [ -n "$dir" ] && _sdk_complete "$dir"; then
      _use_sdk "$dir"
      ok "android sdk with ndk $ANDROID_NDK, platform $ANDROID_PLATFORM, build-tools $ANDROID_BUILD_TOOLS, cmake $ANDROID_CMAKE (in $dir)"
      return 0
    fi
  done
  if [ "$OHM_CHECK" = 1 ]; then
    missing "android sdk (ndk $ANDROID_NDK, platform $ANDROID_PLATFORM, build-tools $ANDROID_BUILD_TOOLS)"
    return 0
  fi
  # Where to put the missing parts: the SDK we were given if we can write to it, else our own.
  sdk="$OHM_TOOLS/android-sdk"
  if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME" ] && [ -w "$ANDROID_HOME" ]; then sdk=$ANDROID_HOME; fi
  mkdir -p "$sdk"
  have java || die "the Android SDK manager needs java: set up the JDK first"
  manager=$(_sdkmanager "$sdk")
  log="$OHM_OUT/logs/sdkmanager.log"
  mkdir -p "$(dirname "$log")"
  note "installing the Android SDK parts into $sdk (a large download)"
  (
    set +o pipefail
    yes | "$manager" --sdk_root="$sdk" --licenses >"$log" 2>&1
  ) || true
  "$manager" --sdk_root="$sdk" "ndk;$ANDROID_NDK" "platforms;android-$ANDROID_PLATFORM" "build-tools;$ANDROID_BUILD_TOOLS" "platform-tools" "cmake;$ANDROID_CMAKE" >>"$log" 2>&1 ||
    {
      tail -n 30 "$log" >&2
      die "sdkmanager failed (log: $log)"
    }
  _sdk_complete "$sdk" || die "the SDK in $sdk is still incomplete after installing (log: $log)"
  _use_sdk "$sdk"
  ok "android sdk installed in $sdk"
}
