#!/usr/bin/env bash
# Build Frameling in one step. Run ./build.sh for a menu, or name what to build:
#   ./build.sh this | all | windows | mac | linux   (add --test to run the tests first)
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Frameling needs Node.js 22 or newer to build. Get it from https://nodejs.org and run this again."
  exit 1
fi
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "Frameling needs Node.js 22 or newer to build (this computer has $(node -v)). Get it from https://nodejs.org."
  exit 1
fi

exec node scripts/build-menu.mjs "$@"
