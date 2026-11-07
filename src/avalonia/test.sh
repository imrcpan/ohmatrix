#!/usr/bin/env bash
# Runs only the tests that are asked for (see test-all.sh for all of them).
#   ./test.sh ChatPaneTests               every test of a class
#   ./test.sh ChatPaneTests RoomListTests several classes
#   ./test.sh -m The_gallery_page_shows   the tests of a method (a name or a part of it)
set -euo pipefail
cd "$(dirname "$0")"

if [ "$#" -eq 0 ]; then
    echo "usage: $0 [-m method] ClassName..." >&2
    exit 2
fi

filters=()
while [ "$#" -gt 0 ]; do
    case "$1" in
    -m)
        [ "$#" -ge 2 ] || { echo "-m needs a method name" >&2; exit 2; }
        filters+=(--filter-method "*$2*")
        shift 2
        ;;
    *)
        filters+=(--filter-class "*$1")
        shift
        ;;
    esac
done

# A sheet of screenshots is only made when a test is asked to.
unset OHMATRIX_CHAT_SHEET
dotnet test OhMatrix.Tests -- "${filters[@]}"
