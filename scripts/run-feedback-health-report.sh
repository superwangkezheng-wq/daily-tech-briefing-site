#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
support_dir="${DAILY_TECH_SUPPORT_DIR:-$HOME/Library/Application Support/daily-tech-site}"
support_site_env="$support_dir/site.env"

export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/opt/node@22/bin:$PATH"

load_env_file() {
  local file="$1" line key value content
  content="$(/bin/cat "$file" 2>/dev/null || true)"
  [[ -n "$content" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key##export }"
    [[ "$key" =~ '^[A-Za-z_][A-Za-z0-9_]*$' ]] || continue
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value[2,-2]}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value[2,-2]}"
    fi
    export "$key=$value"
  done <<< "$content"
}

openclaw_runtime_env="${OPENCLAW_RUNTIME_ENV:-$HOME/.openclaw/ops/openclaw_runtime_env.sh}"
if [[ -f "$openclaw_runtime_env" ]]; then
  source "$openclaw_runtime_env"
fi

load_env_file "$project_dir/.env"
load_env_file "$support_site_env"

export CACHE_DIR="${CACHE_DIR:-$support_dir/cache}"
export REPORTS_INDEX_FILE="${REPORTS_INDEX_FILE:-$support_dir/cache/snapshots.json}"
export LATEST_INDEX_FILE="${LATEST_INDEX_FILE:-$support_dir/cache/latest.json}"
export DETAIL_CACHE_DIR="${DETAIL_CACHE_DIR:-$support_dir/cache/snapshot-details}"
export OPS_STATUS_FILE="${OPS_STATUS_FILE:-$support_dir/cache/ops-status.json}"
export REFRESH_STATE_FILE="${REFRESH_STATE_FILE:-$support_dir/cache/refresh-state.json}"

if [[ -z "${FEISHU_TARGET:-}" ]]; then
  cron_jobs_json="${OPENCLAW_CRON_JOBS_JSON:-}"
  if [[ -z "$cron_jobs_json" ]]; then
    for candidate in "$HOME/.openclaw/cron/jobs.json.migrated" "$HOME/.openclaw/cron/jobs.json" "$HOME/.openclaw/cron/jobs.json.bak"; do
      if [[ -f "$candidate" ]]; then
        cron_jobs_json="$candidate"
        break
      fi
    done
  fi
  if [[ -f "$cron_jobs_json" ]]; then
    feishu_target_from_jobs="$(
      jq -r '
        .jobs[]
        | select(.name == "每日科技信息 网页反馈 & 系统健康回执 (10:15)" or .name == "每日科技信息 网页反馈 & 系统健康回执 (10:00)")
        | (
            ((.notifications // [])
              | map(select(.channel == "feishu" and (.to // "") != ""))
              | .[0].to)
            // (.delivery.failureDestination.to // empty)
          )
      ' "$cron_jobs_json" 2>/dev/null | head -n 1
    )"
    if [[ -n "$feishu_target_from_jobs" ]]; then
      export FEISHU_TARGET="$feishu_target_from_jobs"
    fi
  fi
fi

dry_run=0
skip_digest=0
digest_exit=0
forward_args=()

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      dry_run=1
      ;;
    --skip-digest)
      skip_digest=1
      ;;
    *)
      forward_args+=("$arg")
      ;;
  esac
done

if [[ "$skip_digest" -eq 0 ]]; then
  zsh "$script_dir/run-feedback-digest.sh" --no-push ${forward_args[@]+"${forward_args[@]}"} || digest_exit=$?
fi

health_args=(--digest-exit-code "$digest_exit")
if [[ "$dry_run" -eq 1 ]]; then
  health_args+=(--dry-run)
fi

cd "$project_dir"
exec node "$script_dir/send-feedback-health-report.js" "${health_args[@]}"
