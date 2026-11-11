#!/usr/bin/env bash
# pre-commit: formats the C# in src/avalonia in place and stages what the formatting changed, but only when a commit touches it (takes about 20 seconds).
set -euo pipefail
cd "$(dirname "$0")/.."

staged="$(git diff --cached --name-only --diff-filter=ACMR | grep -E '^src/avalonia/.*(\.cs|\.editorconfig|Directory\.Build\.props|dotnet-tools\.json|format\.sh)$' || true)"
[ -n "$staged" ] || exit 0
src/avalonia/format.sh
# Only the files the commit already holds are staged again; other changes stay out of it.
echo "$staged" | xargs git add --
