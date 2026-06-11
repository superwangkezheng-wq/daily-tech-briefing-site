# Changelog

## 1.1.12 - 2026-06-11

- Documented the upstream OpenClaw dynamic model library and profile selector for hot-switching primary and fallback model routes.
- Added the next inspection design: unified ops status index, migrated cron path resolver, runtime patch registry, provider-health versus route-health split, one-command pause/resume, and L0-L3 notification levels.
- Standardized the weekly unified upgrade expectations around preflight, postflight, and rollback-plan guard phases.
- Clarified that unified upgrade coverage must include default/work features, plugins, skills, scripts, MCP registry, LaunchAgents, and runtime patches.

## 1.1.11 - 2026-06-11

- Documented the 2026-06-11 OpenClaw unified upgrade, health-check, model-route, and article-route closure.
- Added the current inspection surface covering scheduled upgrade, business smoke, production guard, acceptance, route, model, cron, action, module, and runtime audits.
- Clarified that paused collection should keep publishing refresh paused while the existing site and tunnel stay online.
- Added upstream optimization guidance for a shared ops status index, migrated-path resolver, runtime patch registry, provider-auth health split, and one-command pause/resume flow.

## 1.1.10 - 2026-06-07

- Documented the upstream OpenClaw ops override/policy as the single hot-switch source for daily collection, website publishing, feedback health, qmd refresh, and inspection expectations.
- Clarified that pausing all default daily collection slots should automatically pause website publishing and feedback/health receipts while keeping the existing served site and tunnel online.
- Added release-gate verification notes for the reference operator state where paused cron jobs and disabled LaunchAgents are expected healthy states.
- Kept model routing as a separate hot-switch contract so provider changes do not require edits across the website package.

## 1.1.9 - 2026-06-06

- Documented the upstream OpenClaw model-route contract as a separate operational concern from the website package.
- Clarified that chat/cron agent routes may use Kimi -> CodePlan -> local fallback, while direct summarize wrappers should only use HTTP-compatible summary models.
- Added guidance to audit default/work instances, cron payloads, plugin scripts, provider settings, and thinking/reasoning controls before swapping model APIs.
- Updated the collector pipeline docs so future model changes can be handled through a route contract instead of scattered script edits.

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
