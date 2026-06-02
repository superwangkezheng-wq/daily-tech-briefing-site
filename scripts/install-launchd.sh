#!/bin/zsh
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
project_dir="$(cd "$script_dir/.." && pwd -P)"
template_dir="$project_dir/launchd/templates"
target_dir="${LAUNCHD_TARGET_DIR:-$HOME/Library/LaunchAgents}"
runtime_dir="${DAILY_TECH_LOG_DIR:-$HOME/Library/Logs/daily-tech-site}"
alias_dir="${DAILY_TECH_SITE_ALIAS:-$HOME/.daily-tech-site}"
wiki_alias_dir="${DAILY_TECH_WIKI_ALIAS:-$HOME/.daily-tech-site-wiki}"
support_dir="${DAILY_TECH_SUPPORT_DIR:-$HOME/Library/Application Support/daily-tech-site}"
support_qmd_wrapper="$support_dir/dailytech_qmd_refresh.sh"
uid="$(id -u)"
env_file="$project_dir/.env"

if [[ -f "$env_file" ]]; then
  set -a
  source "$env_file"
  set +a
fi

mkdir -p "$target_dir"
mkdir -p "$runtime_dir"
mkdir -p "$support_dir"
ln -sfn "$project_dir" "$alias_dir"

if [[ -n "${WIKI_SOURCE_DIR:-}" ]]; then
  ln -sfn "$WIKI_SOURCE_DIR" "$wiki_alias_dir"
fi

cp "$script_dir/run-qmd-refresh.sh" "$support_qmd_wrapper"
chmod +x "$support_qmd_wrapper"

escape_sed() {
  printf '%s' "$1" | sed 's/[\/&]/\\&/g'
}

render_template() {
  local source_plist="$1"
  local target_plist="$2"
  local project_escaped log_escaped support_escaped
  project_escaped="$(escape_sed "$project_dir")"
  log_escaped="$(escape_sed "$runtime_dir")"
  support_escaped="$(escape_sed "$support_dir")"
  sed \
    -e "s/__PROJECT_DIR__/$project_escaped/g" \
    -e "s/__LOG_DIR__/$log_escaped/g" \
    -e "s/__SUPPORT_DIR__/$support_escaped/g" \
    "$source_plist" > "$target_plist"
}

for source_plist in "$template_dir"/*.plist; do
  file_name="$(basename "$source_plist")"
  if [[ "$file_name" == "com.dailytech.site.refresh.evening.plist" && "${INSTALL_EVENING_REFRESH:-0}" != "1" ]]; then
    continue
  fi
  if [[ "$file_name" == "com.dailytech.site.tunnel.plist" && ! -f "$project_dir/.env.tunnel" ]]; then
    continue
  fi
  if [[ "$file_name" == "com.dailytech.qmd.refresh.plist" && -z "${WIKI_SOURCE_DIR:-}" ]]; then
    continue
  fi

  target_plist="$target_dir/$file_name"
  render_template "$source_plist" "$target_plist"

  label="${file_name%.plist}"
  launchctl bootout "gui/$uid" "$target_plist" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$uid" "$target_plist"
done

launchctl kickstart -k "gui/$uid/com.dailytech.site.web" >/dev/null 2>&1 || true

printf "launchd agents installed in %s\n" "$target_dir"

if [[ ! -f "$project_dir/.env.tunnel" ]]; then
  printf "cloudflare tunnel skipped: create %s/.env.tunnel first\n" "$project_dir"
fi

if [[ -z "${WIKI_SOURCE_DIR:-}" ]]; then
  printf "qmd refresh skipped: set WIKI_SOURCE_DIR in .env to enable it\n"
fi
