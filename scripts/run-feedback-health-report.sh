#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"

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

if [[ -z "${FEISHU_TARGET:-}" ]]; then
  cron_jobs_json="${OPENCLAW_CRON_JOBS_JSON:-$HOME/.openclaw/cron/jobs.json}"
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
