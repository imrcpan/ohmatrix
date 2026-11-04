#!/usr/bin/env bash
# Prints the notes of one version from CHANGELOG.md: the lines under its heading `## [1.2.3]` (a date after it is fine), up to the next `## `
# heading, without the blank lines around them. Prints nothing, and exits with 1, when the version has no section or it is empty.
#
#   scripts/release-notes.sh 1.2.3 [CHANGELOG.md]
set -euo pipefail
version=${1:?usage: release-notes.sh VERSION [FILE]}
file=${2:-$(dirname "${BASH_SOURCE[0]}")/../CHANGELOG.md}
[ -f "$file" ] || exit 1
notes=$(awk -v v="$version" '
  /^## / { if (on) exit; on = (index($0, "## [" v "]") == 1) ; next }
  on { print }
' "$file" | sed -e :a -e '/^[[:space:]]*$/{$d;N;ba' -e '}' | sed '/./,$!d')
[ -n "$notes" ] || exit 1
printf '%s\n' "$notes"
