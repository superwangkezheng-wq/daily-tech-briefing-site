# 2026-06-11 OpenClaw Unified Upgrade, Health, and Route Closure

## Summary

OpenClaw unified upgrade and health checks were closed after several upstream issues were fixed in the local OpenClaw ops layer. The public site package remains paused for new publishing refreshes while the existing web service and tunnel keep serving the last known good site.

## What Changed Upstream

- The OpenClaw asset manifest now treats shared/local skill roots as managed assets, including shared skill helpers and article archive skills.
- OpenClaw runtime post-update patching now reapplies the task-flow `completed` status compatibility patch after package updates.
- The model route remains a standalone hot-switch contract. Chat and agent routes use Kimi first, CodePlan/Codex second, and local summary model last; summarize routes keep their own HTTP-compatible fallback chain.
- The default and work OpenClaw instances both use ops policy derived pause state for collection, publishing, feedback health, site refresh, and qmd refresh.
- Manual single-article saves to "my wiki knowledge base" route to `raw/clippings`; scheduled collection and batch collection remain the only routes to `raw/collections`.

## Verification

- Unified asset sync completed successfully, including workspace skill audits and runtime post-update patches.
- Production guard dry-run returned `ok` with zero errors and zero warnings.
- Business smoke returned `OK`, and its scheduled LaunchAgent last exit code was reset to `0`.
- Cron contract audit accepted the paused collection/publishing state as healthy.
- Route violation audit and tool-route harness accepted the WeChat/web article route split.
- Default task audit returned zero errors, zero warnings, and no stderr.

## Current Inspection Surface

Scheduled checks:

- Daily business smoke at 03:10.
- Weekly unified asset sync/upgrade on Monday at 03:40.
- Daily production guard at 09:05.
- Daily acceptance at 10:45.
- Post-reboot recovery at login/startup.
- Hourly skill-evolution health.
- Daily log rotation and monthly cache cleanup.

Manual and release-gate checks:

- Production guard.
- Business smoke.
- System dry run.
- State drift audit.
- Runtime dependency audit.
- Cron contract audit.
- Model-route contract audit.
- Route violation audit.
- Tool-route harness.
- Module and action contract audits.
- Skeleton topology audit.
- Status schema audit.
- Natural run acceptance.
- Doctor noise audit.
- Session archive audit.
- Process deduplication audit.

## Optimization Plan

- Add a single OpenClaw ops status index so health dashboard, business smoke, production guard, and acceptance checks read the same freshness and supersession model.
- Move migrated-path resolution into a shared resolver so cron, task, plugin, and future state migrations do not require every audit script to guess file names.
- Convert runtime post-update patches into a small patch registry with match, guard, patch, verify, and rollback metadata.
- Split provider authentication health from route health so a primary provider auth failure can be reported without claiming the whole fallback route is down.
- Add one pause/resume command that edits the upstream ops policy, reconciles launchd/cron state, and runs a quick guard after changing collection or publishing state.
- Keep public website docs focused on the contract and incident summary; keep machine paths and private state files in local Obsidian runbooks.

## Package Boundary

No public website runtime code changed in this incident. This package records the operational contract because the website publishing layer depends on the upstream OpenClaw pause and health policy, but the authoritative implementation remains in the local OpenClaw ops layer.
