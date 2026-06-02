#!/bin/zsh
set -euo pipefail

CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"
TARGET_URL="${1:-http://localhost:4321}"

if ! command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1; then
  echo "cloudflared not found: $CLOUDFLARED_BIN" >&2
  exit 1
fi

exec "$CLOUDFLARED_BIN" tunnel --protocol http2 --url "$TARGET_URL"
