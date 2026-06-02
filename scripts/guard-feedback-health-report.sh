#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
state_dir="${FEEDBACK_HEALTH_GUARD_STATE_DIR:-$HOME/Library/Application Support/OpenClaw/FeedbackHealthGuard}"
log_dir="${FEEDBACK_HEALTH_GUARD_LOG_DIR:-$HOME/Library/Logs/OpenClawFeedbackHealthGuard}"
lock_dir="$state_dir/guard.lock"
today="$(TZ=Asia/Shanghai date +%F)"
prev_day="$(TZ=Asia/Shanghai date -v-1d +%F)"
run_ts="$(TZ=Asia/Shanghai date +%Y%m%d%H%M%S)"
log_file="$log_dir/feedback-health-guard-$run_ts.log"
digest_file="${FEEDBACK_DIGEST_FILE:-$project_dir/data/feedback/_digest/$prev_day-修改建议汇总.md}"
status_file="$state_dir/latest-status.json"
health_report_status_file="${FEEDBACK_HEALTH_REPORT_STATUS_FILE:-$HOME/Library/Application Support/OpenClaw/FeedbackHealthReport/latest-status.json}"
cron_state_file="${OPENCLAW_CRON_STATE_FILE:-$HOME/.openclaw/cron/jobs-state.json}"
health_cron_job_id="${FEEDBACK_HEALTH_CRON_JOB_ID:-}"
notify_helper="${OPENCLAW_NOTIFY_HELPER:-$HOME/.openclaw/ops/openclaw_channel_notify.py}"
runtime_env="${OPENCLAW_RUNTIME_ENV:-$HOME/.openclaw/ops/openclaw_runtime_env.sh}"
python_bin="${PYTHON_BIN:-python3}"
dry_run=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)
      dry_run=1
      ;;
    *)
      printf 'unknown argument: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

log_stamp() {
  TZ=Asia/Shanghai date '+%Y-%m-%dT%H:%M:%S%z'
}

mkdir -p "$state_dir" "$log_dir"

if ! mkdir "$lock_dir" 2>/dev/null; then
  printf '[%s] guard already running\n' "$(log_stamp)" | tee -a "$log_file"
  exit 0
fi
trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

if [[ -f "$runtime_env" ]]; then
  source "$runtime_env"
fi

write_status() {
  local result="$1"
  local detail="$2"
  "$python_bin" - "$status_file" "$result" "$detail" "$log_file" "$digest_file" "$dry_run" <<'PY'
import json
import sys
from datetime import datetime, timezone

path, result, detail, log_file, digest_file, dry_run = sys.argv[1:7]
payload = {
    "result": result,
    "detail": detail,
    "dryRun": dry_run == "1",
    "finishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "logPath": log_file,
    "digestPath": digest_file,
}
with open(path, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
}

cutoff="$(TZ=Asia/Shanghai date -j -f '%Y-%m-%d %H:%M:%S' "$today 10:15:00" +%s)"
if "$python_bin" - "$health_report_status_file" "$status_file" "$cron_state_file" "$health_cron_job_id" "$cutoff" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

status_path = Path(sys.argv[1])
guard_status_path = Path(sys.argv[2])
cron_state_path = Path(sys.argv[3])
job_id = sys.argv[4]
cutoff = float(sys.argv[5])

def parse_time(value):
    if not value:
        return 0.0
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).timestamp()
    except Exception:
        return 0.0

def status_fresh(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if data.get("result") != "ok":
        return False
    if data.get("dryRun") is True:
        return False
    return max(parse_time(data.get("pushedAt")), parse_time(data.get("updatedAt"))) >= cutoff

def guard_status_fresh():
    try:
        data = json.loads(guard_status_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    if data.get("result") != "ok" or data.get("dryRun") is True:
        return False
    return parse_time(data.get("finishedAt")) >= cutoff

def cron_fresh():
    try:
        data = json.loads(cron_state_path.read_text(encoding="utf-8"))
    except Exception:
        return False
    state = data.get("jobs", {}).get(job_id, {}).get("state", {})
    if state.get("lastRunStatus") != "ok":
        return False
    return float(state.get("lastRunAtMs") or 0) / 1000.0 >= cutoff

sys.exit(0 if (status_fresh(status_path) or guard_status_fresh() or cron_fresh()) else 1)
PY
then
    printf '[%s] skip: health receipt already confirmed\n' "$(log_stamp)" | tee -a "$log_file"
    write_status "skipped" "health receipt already confirmed"
    exit 0
fi

printf '[%s] fallback run: health receipt not confirmed for %s\n' "$(log_stamp)" "$prev_day" | tee -a "$log_file"

set +e
if [[ "$dry_run" -eq 1 ]]; then
  zsh "$script_dir/run-feedback-health-report.sh" --dry-run >>"$log_file" 2>&1
else
  zsh "$script_dir/run-feedback-health-report.sh" >>"$log_file" 2>&1
fi
exit_code=$?
set -e

if [[ "$exit_code" -eq 0 ]]; then
  write_status "ok" "fallback health receipt sent"
  exit 0
fi

write_status "fail" "fallback wrapper exited $exit_code"

if [[ "$dry_run" -eq 0 && -x "$notify_helper" ]]; then
  msg_file="$state_dir/failure-message.txt"
  {
    printf 'OpenClaw 10:15 健康回执兜底失败\n\n'
    printf '日期：%s\n' "$today"
    printf '退出码：%s\n' "$exit_code"
    printf '日志：%s\n' "$log_file"
  } >"$msg_file"
  "$python_bin" "$notify_helper" --message-file "$msg_file" --wrapper-log "$log_file" --timeout 45 || true
fi

exit "$exit_code"
