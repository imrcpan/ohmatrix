# shellcheck shell=bash
# Node and pnpm. A Node new enough that is already there is used as it is.

setup_node() {
  local dir="$OHM_TOOLS/node-$NODE_VERSION" major hostarch arch file sums
  if [ -x "$dir/bin/node" ]; then
    path_add "$dir/bin"
    ok "node $("$dir/bin/node" -v) (in $dir)"
    return 0
  fi
  if have node; then
    major=$(node -p 'process.versions.node.split(".")[0]')
    if [ "$major" -ge "$NODE_MIN_MAJOR" ]; then
      ok "node $(node -v) (found)"
      return 0
    fi
    note "node $(node -v) is older than $NODE_MIN_MAJOR"
  fi
  if [ "$OHM_CHECK" = 1 ]; then
    missing "node >= $NODE_MIN_MAJOR (would install $NODE_VERSION)"
    return 0
  fi
  hostarch=$(host_arch)
  arch=linux-$hostarch
  file="node-v$NODE_VERSION-$arch.tar.xz"
  note "installing node $NODE_VERSION"
  sums=$(mktemp)
  download "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" "$sums"
  local sum
  sum=$(awk -v f="$file" '$2 == f {print $1}' "$sums")
  rm -f "$sums"
  [ -n "$sum" ] || die "no checksum for $file in nodejs.org's list"
  mkdir -p "$dir"
  download "https://nodejs.org/dist/v$NODE_VERSION/$file" "$dir/$file" "$sum"
  tar -xJf "$dir/$file" -C "$dir" --strip-components=1
  rm -f "$dir/$file"
  path_add "$dir/bin"
  ok "node $(node -v)"
}

setup_pnpm() {
  local dir="$OHM_TOOLS/pnpm-$PNPM_VERSION"
  if [ -x "$dir/bin/pnpm" ]; then
    path_add "$dir/bin"
    ok "pnpm $(pnpm -v) (in $dir)"
    return 0
  fi
  if have pnpm && [ "$(pnpm -v 2>/dev/null | cut -d. -f1)" = "${PNPM_VERSION%%.*}" ]; then
    ok "pnpm $(pnpm -v) (found)"
    return 0
  fi
  if [ "$OHM_CHECK" = 1 ]; then
    missing "pnpm ${PNPM_VERSION%%.*}.x (would install $PNPM_VERSION)"
    return 0
  fi
  have npm || die "pnpm needs npm, which comes with node: set up node first"
  note "installing pnpm $PNPM_VERSION"
  npm install --global --silent --prefix "$dir" "pnpm@$PNPM_VERSION"
  path_add "$dir/bin"
  ok "pnpm $(pnpm -v)"
}
