#!/usr/bin/env bash
# pre-commit: checks the format of the C# in src/avalonia, but only when a commit touches it (the check takes about 20 seconds).
set -euo pipefail
cd "$(dirname "$0")/.."

git diff --cached --name-only --diff-filter=ACMR | grep -qE '^src/avalonia/.*(\.cs|\.editorconfig|dotnet-tools\.json|format\.sh)$' || exit 0
exec src/avalonia/format.sh --check
