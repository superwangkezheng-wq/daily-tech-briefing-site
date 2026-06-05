# Changelog

## 1.1.8 - 2026-06-05

- Documented the unified inspection contract across status files, scheduled LaunchAgents, DailyAcceptance, and HealthDashboard.
- Clarified that fresh subsystem status files override stale scheduled LaunchAgent non-zero `lastExit` values in acceptance logic.
- Added the requirement that DailyAcceptance refresh HealthDashboard after writing its final status so dashboards do not present a stale pre-acceptance snapshot.
- Added release contract coverage for the 1+N operational health guidance.

## 1.1.7 - 2026-06-05

- Changed the feedback health report cron section to distinguish structural schedule failures from recent execution warnings.
- Kept cron contract drift as `FAIL` while showing recent OpenClaw execution errors as `WARN` so daily health receipts do not overstate stale or already-triaged cron noise.

## 1.1.6 - 2026-06-05

- Fixed qmd refresh LaunchAgent startup by loading the support/runtime environment and PATH before resolving the `qmd` binary.
- Made qmd refresh installation honor the private support `site.env` and remove stale qmd LaunchAgents when the optional wiki source is not configured.
- Added an explicit qmd refresh LaunchAgent working directory so dry-run and reboot audits share the same runtime contract.
- Preserved the morning-only refresh contract while keeping optional qmd refresh explicit and reproducible after reboot.

## 1.1.5 - 2026-06-04

- Added configurable daily collection slots, collection time, web refresh lag, refresh attempts, and retry intervals.
- Made the default production contract morning-only while keeping afternoon and evening slots opt-in.
- Extended morning refresh to follow late reports automatically through a configurable long monitoring window.
- Updated launchd installation so refresh agents follow `DAILY_COLLECTION_SLOTS` and keep afternoon/evening disabled by default.
- Updated public documentation and schedule contract tests for the configurable refresh model.

## 1.1.4 - 2026-06-03

- Hardened the public tunnel launch path around `http2` and fixed-edge startup guidance for unstable `argotunnel` discovery environments.
- Improved launchd installation by moving runtime-sensitive execution through support wrappers under `~/Library/Application Support/daily-tech-site`.
- Updated the health receipt wording so it separates the current installed OpenClaw version from the latest automated unified-upgrade record.
- Made the feedback health wrapper more resilient by recovering the Feishu target from the active OpenClaw cron contract when available.
- Synced the Juya YouTube required-source fallback fix and regression coverage used by the collector side.
