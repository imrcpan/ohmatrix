#!/usr/bin/env bash
# Formats the C# files of this solution by the rules of .editorconfig (see code-style.md).
#   ./format.sh           rewrite the files
#   ./format.sh --check   rewrite nothing: exit 1 and list the files that are not formatted
set -euo pipefail
cd "$(dirname "$0")"

dotnet tool restore

format() {
    # A namespace becomes file-scoped, and the usings nothing uses are removed (Directory.Build.props lets the analyzer see them).
    dotnet format style OhMatrix.slnx --diagnostics IDE0161 IDE0005 --severity error
    # Then braces and statements are split, then ReSharper lays the rest out.
    dotnet format whitespace OhMatrix.slnx
    dotnet jb cleanupcode OhMatrix.slnx --profile='Built-in: Reformat Code' --no-build \
        --properties:DefineConstants=OHMATRIX_NATIVE_SDK
}

if [ "${1:-}" != "--check" ]; then
    format
    exit 0
fi

# Format a copy of the sources and compare, so that nothing in the working tree is touched.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sources="$(find . -type f -name '*.cs' -not -path '*/bin/*' -not -path '*/obj/*')"
files="$sources
./.editorconfig
./Directory.Build.props
./dotnet-tools.json
./format.sh
./OhMatrix.slnx"
for p in $(find . -name '*.csproj' -not -path '*/bin/*' -not -path '*/obj/*'); do files="$files
$p"; done
echo "$files" | cpio -pdm --quiet "$work"
(cd "$work" && ./format.sh)
bad=""
for f in $sources; do
    cmp -s "$f" "$work/$f" || bad="$bad$f"$'\n'
done
if [ -n "$bad" ]; then
    echo "Not formatted (run ./format.sh):"
    printf '%s' "$bad"
    exit 1
fi
