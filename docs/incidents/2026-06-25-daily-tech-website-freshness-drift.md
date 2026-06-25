# Incident: Daily-Tech Website Freshness Drift

Date: 2026-06-25

## Summary

The morning collection completed and pushed through the notification channel, but the live website was still serving an older snapshot. The health receipt also reported an even older refresh state, making the system look healthy while it was reading the wrong status surface.

## Impact

- The live local site at `http://localhost:4321` served stale content until the production cache was rebuilt.
- The feedback-health receipt reported stale refresh metadata instead of the real production support cache state.
- Existing checks accepted HTTP `200` from the site as health, which did not prove that the latest daily report had been published.

## Root Cause

- The production web service uses `~/Library/Application Support/daily-tech-site/cache`, while local/manual commands use the project `.cache` directory.
- The 10:15 feedback-health wrapper did not pin itself to the production support cache, so it could read local project status instead of the live site status.
- The launchd-installed refresh/qmd wrappers directly sourced `.env` files. Runtime `.env` copies carrying macOS provenance metadata can fail under launchd with `operation not permitted`.
- Production checks verified that the site endpoint returned `200`, but did not verify the age of `/api/snapshots.latest`.

## Fix

- Rebuilt the production support cache; the live API now reports `2026-06-25 上午版`.
- Updated launchd installer wrappers to load env files defensively and preserve the ops-policy refresh pause check.
- Removed runtime `.env` copies during launchd install so production reads the private support `site.env` instead of a provenance-tainted duplicate.
- Updated the feedback-health wrapper to use the production support cache/status paths.
- Added latest snapshot freshness checks to BusinessSmoke, ProductionGuard, and HealthDashboard.
- Extended `test-schedule-contract.js` to guard the installer, qmd wrapper, and feedback-health wrapper behavior.

## Verification

- `node scripts/test-schedule-contract.js`
- `npm run check:syntax`
- `zsh scripts/install-launchd.sh`
- Manual production refresh: `2026-06-25 上午版`
- Feedback-health dry-run: `最近检查：2026-06-25 上午版 / ok`
- HealthDashboard: `errors=0`, `daily-tech latest snapshot freshness=OK`
- ProductionGuard: `result=ok`, `daily tech latest snapshot freshness=2026-06-25 上午版`
- BusinessSmoke: `Business smoke OK`, website freshness `2026-06-25 上午版`

## Prevention

Do not treat a website `200` as publishing health. Publishing health requires an endpoint check plus a content freshness check against the latest business snapshot.

## 2026-06-25 Ops Closure

Additional OpenClaw operations hardening was applied after the first fix:

- `openclaw_upgrade_availability.py` now checks `/api/snapshots` freshness in post-upgrade availability, so unified upgrades can no longer pass on HTTP `200` alone.
- Availability probes are split by channel: Feishu live outbound remains a hard postflight gate because it protects the known Feishu ABI regression class; Weixin live outbound records a warning when OpenClaw blocks the route as a private/internal target.
- `openclaw_upgrade_guard.py` now refreshes post-upgrade availability before rebuilding the ops status index, preventing stale `upgradeAvailability` blockers from making a newer successful postflight fail.
- Freshness gates honor `daily-tech-publishing` pause policy: active publishing requires a fresh latest snapshot; paused publishing skips freshness while still checking that the site can serve the last good page.
- `openclaw_health_dashboard.sh` is now managed by the AssetSync manifest, alongside BusinessSmoke, ProductionGuard, UpgradeGuard, and UpgradeAvailability, so weekly unified upgrades do not overwrite these runtime fixes.

Final verification:

- `openclaw_upgrade_guard.py postflight --json`: `ok=true`
- `openclaw_upgrade_availability.py`: Feishu outbound `ok`, Weixin outbound `warn`, OpenDesign/model/summary/site/runtime `ok`
- `openclaw_business_smoke.sh`: `Business smoke OK`, latest site snapshot `2026-06-25 上午版`
- `openclaw_production_guard.sh --repair --json`: `result=ok`, latest snapshot freshness `2026-06-25 上午版`
- `openclaw_health_dashboard.sh`: `errors=0`
- AssetSync dry-run: failures `0`, file overlays include `health_dashboard`
