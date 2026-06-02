#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
project_dir="$(cd "$script_dir/.." && pwd -P)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/node@22/bin:$PATH"

openclaw_runtime_env="${OPENCLAW_RUNTIME_ENV:-$HOME/.openclaw/ops/openclaw_runtime_env.sh}"
if [[ -f "$openclaw_runtime_env" ]]; then
  source "$openclaw_runtime_env"
fi

if [[ -f "$project_dir/.env" ]]; then
  set -a
  source "$project_dir/.env"
  set +a
fi

cd "$project_dir"
exec node "$script_dir/check-refresh.js" --slot "${1:-morning}"
