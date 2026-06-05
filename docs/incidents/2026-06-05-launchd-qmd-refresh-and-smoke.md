# Incident: qmd Refresh And Business Smoke Launchd Drift

Date: 2026-06-05

## Summary

Reference production BusinessSmoke failed because OpenClaw operator checks still expected old launchd template locations. ProductionGuard then reported qmd refresh failure, business smoke schedule failure, stale business smoke status, and stale qmd refresh log.

## Impact

- BusinessSmoke failed before reaching full business validation.
- ProductionGuard reported errors for qmd refresh and business smoke.
- qmd refresh stdout stopped updating until the LaunchAgent was repaired.
- A stale failed BusinessSmoke LaunchAgent exit code had to be cleared by running the LaunchAgent successfully.

## Root Causes

- Public launchd templates had moved under `launchd/templates`, but local operator checks still looked for templates directly under `launchd`.
- qmd refresh resolved the `qmd` binary before adding the launchd-safe PATH.
- install-launchd skipped qmd when `.env` did not contain `WIKI_SOURCE_DIR`, even when private support `site.env` did.
- install-launchd did not remove a stale qmd LaunchAgent when qmd was no longer configured.
- qmd LaunchAgent template did not declare a working directory, while local dry-run checks treated it as a runtime contract.

## Fix

- Updated local operator checks to understand `launchd/templates` and rendered placeholders.
- Updated qmd wrapper to load runtime/support env and PATH before resolving `qmd`.
- Updated installer to read support `site.env`.
- Updated installer to remove stale qmd LaunchAgents when qmd is disabled.
- Added qmd LaunchAgent `WorkingDirectory`.
- Added schedule contract coverage for qmd template and installer behavior.
- Bumped package version to 1.1.6.

## Verification

Ran:

```bash
npm run check
npm run smoke
npm run audit:schedule
npm run install:launchd
```

Reference production validation also passed after launchd reinstall and successful BusinessSmoke kick:

- qmd refresh LaunchAgent last exit code: `0`
- BusinessSmoke latest status: `ok`
- BusinessSmoke LaunchAgent last exit code: `0`
- ProductionGuard result: `ok`, errors: `0`

## Prevention

- Keep `docs/1n-system-guide.md` as the first maintenance entry.
- Keep incident records for every production-facing failure.
- Do not change launchd template layout without updating operator checks and tests.
- Treat optional integrations as two-state contracts: explicitly enabled or explicitly removed.
- Prefer behavior checks over brittle string checks where template rendering can change quoting.
