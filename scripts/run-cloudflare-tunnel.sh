#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
ENV_FILE="$PROJECT_DIR/.env.tunnel"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

if ! command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1; then
  echo "cloudflared not found: $CLOUDFLARED_BIN" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]]; then
  echo "CLOUDFLARED_TUNNEL_TOKEN is missing. Create .env.tunnel first." >&2
  exit 1
fi

exec "$CLOUDFLARED_BIN" tunnel --no-autoupdate --protocol http2 run --token "$CLOUDFLARED_TUNNEL_TOKEN"
