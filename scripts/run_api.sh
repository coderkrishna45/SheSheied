#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root/api"
if command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
elif [[ -x "$project_root/.tools/runtime/node/bin/node" ]]; then
  node_bin="$project_root/.tools/runtime/node/bin/node"
else
  echo "Node.js is missing. Install Node.js 24 or restore .tools/runtime/node." >&2
  exit 1
fi
exec "$node_bin" --env-file-if-exists=.env src/server.js
