#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER="${CXX:-g++}"
cmake --build build
echo "构建完成：$(pwd)/build/projectnote"
