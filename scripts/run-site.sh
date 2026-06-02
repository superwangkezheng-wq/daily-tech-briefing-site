#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
project_dir="$(cd "$script_dir/.." && pwd -P)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/node@22/bin:$PATH"

if [[ -f "$project_dir/.env" ]]; then
  set -a
  source "$project_dir/.env"
  set +a
fi

if [[ "${REQUIRE_MAINTENANCE_TOKEN:-0}" == "1" && -z "${MAINTENANCE_TOKEN:-}" ]]; then
  echo "MAINTENANCE_TOKEN is required for launchd site service. Create .env before installing launchd." >&2
  exit 1
fi

cd "$project_dir"
exec node server.js
