#!/bin/zsh
set -euo pipefail

target_dir="$HOME/Library/LaunchAgents"
alias_dir="$HOME/.daily-tech-site"
wiki_alias_dir="${DAILY_TECH_WIKI_ALIAS:-$HOME/.daily-tech-site-wiki}"
uid="$(id -u)"

for label in \
  com.dailytech.site.web \
  com.dailytech.site.refresh.morning \
  com.dailytech.site.refresh.afternoon \
  com.dailytech.site.refresh.evening \
  com.dailytech.site.digest \
  com.dailytech.qmd.refresh \
  com.dailytech.site.tunnel; do
  plist_path="$target_dir/$label.plist"
  launchctl bootout "gui/$uid" "$plist_path" >/dev/null 2>&1 || true
  rm -f "$plist_path"
done

rm -f "$alias_dir"
rm -f "$wiki_alias_dir"

printf "launchd agents removed from %s\n" "$target_dir"
