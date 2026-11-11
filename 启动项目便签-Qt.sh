#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -x qt/build/projectnote ]]; then
  ./qt/build.sh
fi
exec ./qt/build/projectnote "$@"
