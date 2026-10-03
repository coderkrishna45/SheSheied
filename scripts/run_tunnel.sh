#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
if command -v cloudflared >/dev/null 2>&1; then
  tunnel_bin="$(command -v cloudflared)"
elif [[ -x "$project_root/.tools/cloudflared" ]]; then
  tunnel_bin="$project_root/.tools/cloudflared"
else
  echo "cloudflared is missing. Install it or restore .tools/cloudflared." >&2
  exit 1
fi
exec "$tunnel_bin" tunnel --url http://127.0.0.1:8787 --protocol http2 --no-autoupdate
