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

export TUNNEL_TOKEN="$CLOUDFLARED_TUNNEL_TOKEN"
export NO_PROXY="${NO_PROXY:-127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16}"
unset CLOUDFLARED_TUNNEL_TOKEN HTTPS_PROXY HTTP_PROXY ALL_PROXY

edge_args=()
if [[ -n "${CLOUDFLARED_EDGE_ARGS:-}" ]]; then
  # shellcheck disable=SC2206
  edge_args=(${=CLOUDFLARED_EDGE_ARGS})
else
  edge_args=(
    --edge 198.41.192.27:7844
    --edge 198.41.192.47:7844
    --edge 198.41.200.73:7844
    --edge 198.41.200.113:7844
  )
fi

exec "$CLOUDFLARED_BIN" tunnel --no-autoupdate --metrics 127.0.0.1:20241 --protocol http2 "${edge_args[@]}" run
