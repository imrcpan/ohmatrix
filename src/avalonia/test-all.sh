#!/usr/bin/env bash
# Runs all the tests of the solution. To run only some of them use test.sh.
set -euo pipefail
cd "$(dirname "$0")"

# A sheet of screenshots is only made when a test is asked to.
unset OHMATRIX_CHAT_SHEET
dotnet test OhMatrix.Tests
