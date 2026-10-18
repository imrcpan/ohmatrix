# shellcheck shell=bash
# What this machine really has (a container's own limits count, not the host's), and the build settings that follow.
# resources_init sets: OHM_CPUS OHM_MEM_MB OHM_SWAP_MB OHM_DISK_GB and OHM_JOBS OHM_GRADLE_WORKERS OHM_GRADLE_XMX_MB OHM_KOTLIN_XMX_MB OHM_NODE_HEAP_MB.
OHM_NATIVE_PEAK_MB=2560 # the biggest single compile (see below), kept free for it before Gradle is given memory

# OHM_JOBS in the environment (or --jobs) wins over the computed number of parallel compile jobs.

# The first line of a file as a plain number, or nothing.
_number_in() {
  local v
  [ -r "$1" ] || return 0
  v=$(head -n1 "$1" 2>/dev/null | tr -dc '0-9') || true
  printf '%s' "$v"
}

# CPUs the build may use: the machine's, cut down to the cgroup quota when there is one (docker --cpus, a CI limit).
detect_cpus() {
  local n quota period max
  n=$(nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)
  if [ -r /sys/fs/cgroup/cpu.max ]; then # cgroup v2: "<quota|max> <period>"
    read -r max period </sys/fs/cgroup/cpu.max || true
    if [[ ${max:-max} =~ ^[0-9]+$ ]] && [[ ${period:-0} =~ ^[0-9]+$ ]] && [ "${period:-0}" -gt 0 ]; then
      quota=$(((max + period - 1) / period))
      if [ "$quota" -lt "$n" ]; then n=$quota; fi
    fi
  elif [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ]; then # cgroup v1; the quota is -1 when there is none
    quota=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us)
    period=$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us)
    if [ "$quota" -gt 0 ] && [ "$period" -gt 0 ]; then
      quota=$(((quota + period - 1) / period))
      if [ "$quota" -lt "$n" ]; then n=$quota; fi
    fi
  fi
  if [ "$n" -lt 1 ]; then n=1; fi
  echo "$n"
}

# Memory the build may use, in MB: what is available, cut down to the cgroup limit when there is one.
detect_mem_mb() {
  local kb mb limit f
  kb=$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)
  if [ -z "$kb" ]; then kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo); fi
  mb=$((kb / 1024))
  for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do # v2, v1 (a huge number or "max" means no limit)
    limit=$(_number_in "$f")
    if [ -n "$limit" ] && [ "${#limit}" -le 18 ]; then
      limit=$((limit / 1024 / 1024))
      if [ "$limit" -lt "$mb" ]; then mb=$limit; fi
    fi
  done
  echo "$mb"
}

# Swap the build may use, in MB: what is free, cut down to the cgroup's swap limit when there is one (docker --memory-swap equal to
# --memory means none). Swap makes a compile that does not fit in memory finish, slowly.
detect_swap_mb() {
  local kb mb limit
  kb=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)
  mb=$(((${kb:-0}) / 1024))
  limit=$(_number_in /sys/fs/cgroup/memory.swap.max) # cgroup v2; "max" has no digits and so means no limit
  if [ -n "$limit" ]; then
    limit=$((limit / 1024 / 1024))
    if [ "$limit" -lt "$mb" ]; then mb=$limit; fi
  fi
  echo "$mb"
}

# Free disk space in GB where the build happens.
detect_disk_gb() { free_disk_gb "$1"; }

# clamp VALUE MIN MAX
clamp() {
  local v=$1
  if [ "$v" -lt "$2" ]; then v=$2; fi
  if [ "$v" -gt "$3" ]; then v=$3; fi
  echo "$v"
}

resources_init() {
  local by_mem
  OHM_CPUS=$(detect_cpus)
  OHM_MEM_MB=$(detect_mem_mb)
  mkdir -p "$OHM_OUT"
  OHM_SWAP_MB=$(detect_swap_mb)
  OHM_DISK_GB=$(detect_disk_gb "$OHM_OUT")

  # A rustc job takes about 2 GB at its peak: more jobs than that in memory would end in the kernel killing one.
  by_mem=$(clamp $((OHM_MEM_MB / 2048)) 1 1024)
  if [ -z "${OHM_JOBS:-}" ]; then OHM_JOBS=$((OHM_CPUS < by_mem ? OHM_CPUS : by_mem)); fi
  OHM_GRADLE_WORKERS=$((OHM_JOBS < 4 ? OHM_JOBS : 4))
  # The biggest single compile is the C++ the Matrix SDK bindings are generated into (matrix_sdk_ffi.cpp): 1.8 GB after
  # engine-rust/scripts/shrinkBinding.mjs (it was 7.3 GB before), measured. That much is kept free for the native compilers
  # before Gradle's JVMs are given the rest; Gradle itself holds about 2.4 GB and the Kotlin daemon about 1.2 GB (measured).
  OHM_GRADLE_XMX_MB=$(clamp $(((OHM_MEM_MB - OHM_NATIVE_PEAK_MB) * 60 / 100)) 1024 4096)
  OHM_KOTLIN_XMX_MB=$(clamp $((OHM_GRADLE_XMX_MB / 2)) 512 2048)
  OHM_NODE_HEAP_MB=$(clamp $((OHM_MEM_MB * 30 / 100)) 1024 4096)
  export OHM_CPUS OHM_MEM_MB OHM_SWAP_MB OHM_DISK_GB OHM_JOBS OHM_GRADLE_WORKERS OHM_GRADLE_XMX_MB OHM_KOTLIN_XMX_MB OHM_NODE_HEAP_MB
}

resources_summary() {
  step "resources"
  note "cpus $OHM_CPUS, memory $OHM_MEM_MB MB, swap $OHM_SWAP_MB MB, free disk $OHM_DISK_GB GB"
  note "compile jobs $OHM_JOBS; gradle workers $OHM_GRADLE_WORKERS, heap ${OHM_GRADLE_XMX_MB} MB (kotlin ${OHM_KOTLIN_XMX_MB} MB); node heap ${OHM_NODE_HEAP_MB} MB"
}

# resources_require WHAT MIN_MEM_MB MIN_DISK_GB WARN_DISK_GB: stops (or, with --check, reports) when the machine is too small.
# Memory counts what is free plus the swap; a build that has to use swap is slow, and says so.
resources_require() {
  local what=$1 min_mem=$2 min_disk=$3 warn_disk=$4 problem='' have_mb=$((OHM_MEM_MB + OHM_SWAP_MB))
  if [ "$have_mb" -lt "$min_mem" ]; then
    problem="memory is $OHM_MEM_MB MB and swap $OHM_SWAP_MB MB, the $what build needs $min_mem MB between them (use a machine with more memory, or add swap)"
  fi
  if [ "$OHM_DISK_GB" -lt "$min_disk" ]; then problem="${problem:+$problem; }free disk is $OHM_DISK_GB GB, the $what build needs at least $min_disk GB"; fi
  if [ -n "$problem" ]; then
    if [ "$OHM_CHECK" = 1 ]; then
      missing "enough resources: $problem"
      return 0
    fi
    die "$problem"
  fi
  if [ "$OHM_MEM_MB" -lt "$min_mem" ]; then warn "memory is $OHM_MEM_MB MB, less than the $min_mem MB the $what build wants: it will swap, and be slow"; fi
  if [ "$OHM_DISK_GB" -lt "$warn_disk" ]; then warn "free disk is $OHM_DISK_GB GB; $warn_disk GB leaves room, with less the build may run out"; fi
  ok "resources are enough for the $what build"
}
