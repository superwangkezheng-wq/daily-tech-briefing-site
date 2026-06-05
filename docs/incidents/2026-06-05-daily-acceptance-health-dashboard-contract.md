# Incident: DailyAcceptance And HealthDashboard Authority Drift

Date: 2026-06-05

## Summary

The 11:05 read-only monitor reported DailyAcceptance as failed even though BusinessSmoke was healthy and ProductionGuard had a fresh `ok` status with only one cron warning.

The failure came from conflicting inspection authority:

- DailyAcceptance treated `com.lenovo.openclaw.production-guard` launchd `lastExit=1` as a hard scheduler error.
- The fresh ProductionGuard status file already said `result=ok`, `errors=0`, `warnings=1`.
- HealthDashboard had been generated before the later DailyAcceptance run and still showed the previous daily acceptance state.

## Impact

- DailyAcceptance reported `fail` with one error.
- HealthDashboard looked stale relative to the latest DailyAcceptance run.
- Follow-up monitors saw contradictory evidence from launchd, status files, and dashboard snapshots.

## Root Causes

- Scheduled one-shot LaunchAgents retain old `lastExit` values until that exact LaunchAgent runs again.
- DailyAcceptance did not reconcile stale scheduled `lastExit` with fresh subsystem status files.
- HealthDashboard was not refreshed after DailyAcceptance wrote its final status.
- The 1+N guide described files and checks, but did not yet state a clear authority order for conflicts.

## Fix

- Updated local DailyAcceptance logic so a fresh subsystem `ok` status overrides a stale scheduled LaunchAgent non-zero `lastExit`.
- Added local regression coverage for that contract.
- Updated local HealthDashboard logic to use the same scheduled-job status override instead of reporting old `lastExit` values as ambiguous health.
- Updated DailyAcceptance so a completed live run refreshes HealthDashboard after writing the final acceptance status.
- Recorded the authority order in the public 1+N guide.

## Verification

Validated on the reference production machine:

- ProductionGuard LaunchAgent completed with `lastExit=0`.
- DailyAcceptance LaunchAgent completed with `lastExit=0`.
- DailyAcceptance latest status: `result=ok`, `errors=0`, `warnings=0`.
- HealthDashboard regenerated after DailyAcceptance and reported `errors=0`.
- Release gate latest status: `ok`.
- Operational freshness latest status: `ok`.
- BusinessSmoke latest status: `ok`.

## Prevention

- Treat status files as business truth when they are fresh and schema-compatible.
- Treat launchd as schedule/load evidence, not as the only source of business health for one-shot jobs.
- Treat HealthDashboard as a timestamped snapshot, not an eternal source of truth.
- If a post-acceptance monitor reads HealthDashboard, verify `generatedAt` is newer than the DailyAcceptance `finishedAt`.
