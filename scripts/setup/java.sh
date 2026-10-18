# shellcheck shell=bash
# A JDK for Gradle. One that is already there (JAVA_HOME, or on PATH) and in range is used; otherwise the distribution's
# JDK $JDK_INSTALL_MAJOR when it has one, otherwise Temurin's, unpacked under OHM_TOOLS.

# The major version of the java at $1, or nothing.
_java_major() {
  "$1" -version 2>&1 | awk -F'"' '/version/ {split($2, a, "."); print (a[1] == "1") ? a[2] : a[1]; exit}'
}

# Whether apt knows a version of package $1 it could install.
_apt_has() { apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ {print $2}' | grep -qv '(none)'; }

# Use the JDK whose home is $1.
_use_jdk() {
  JAVA_HOME=$1
  export JAVA_HOME
  path_add "$JAVA_HOME/bin"
}

setup_java() {
  local candidate major home dir arch pkg
  for candidate in "${JAVA_HOME:+$JAVA_HOME/bin/java}" "$OHM_TOOLS"/jdk-*/bin/java "$(command -v java || true)"; do
    [ -n "$candidate" ] && [ -x "$candidate" ] || continue
    major=$(_java_major "$candidate" || true)
    if [ -n "$major" ] && [ "$major" -ge "$JDK_MIN_MAJOR" ] && [ "$major" -le "$JDK_MAX_MAJOR" ]; then
      home=$(dirname "$(dirname "$(readlink -f "$candidate")")")
      [ -x "$home/bin/javac" ] || continue # a JRE cannot compile
      _use_jdk "$home"
      ok "jdk $major (in $home)"
      return 0
    fi
  done
  if [ "$OHM_CHECK" = 1 ]; then
    missing "a JDK between $JDK_MIN_MAJOR and $JDK_MAX_MAJOR (would install $JDK_INSTALL_MAJOR)"
    return 0
  fi
  pkg="openjdk-$JDK_INSTALL_MAJOR-jdk-headless"
  if have apt-get; then
    _apt_has "$pkg" || as_root apt-get update -qq || true
    if _apt_has "$pkg"; then
      note "installing $pkg"
      DEBIAN_FRONTEND=noninteractive as_root apt-get install -y -qq --no-install-recommends "$pkg"
      home=$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")
      _use_jdk "$home"
      ok "jdk $JDK_INSTALL_MAJOR (installed, $home)"
      return 0
    fi
  fi
  arch=$(host_arch)
  [ "$arch" = arm64 ] && arch=aarch64
  dir="$OHM_TOOLS/jdk-$JDK_INSTALL_MAJOR"
  note "this system has no $pkg: downloading Temurin $JDK_INSTALL_MAJOR"
  mkdir -p "$dir"
  download "https://api.adoptium.net/v3/binary/latest/$JDK_INSTALL_MAJOR/ga/linux/$arch/jdk/hotspot/normal/eclipse" "$dir/jdk.tar.gz"
  tar -xzf "$dir/jdk.tar.gz" -C "$dir" --strip-components=1
  rm -f "$dir/jdk.tar.gz"
  _use_jdk "$dir"
  ok "jdk $(_java_major "$dir/bin/java") (Temurin, in $dir)"
}
