# 1+N System Guide

This is the first file to read when maintaining Daily Tech Briefing Site.

## 1: Operating Spine

The operating spine is the shared contract across product, code, launchd, OpenClaw, and maintenance records:

```text
Upstream scheduled collector
  -> Markdown reports
  -> site cache build
  -> public web page
  -> reader feedback Markdown
  -> feedback digest and health receipt
  -> status files, smoke checks, and incident records
```

The website is a publishing and feedback layer. It must not silently become a crawler, a database-backed admin system, or a private-machine-only deployment bundle.

## N: Required Reading

| File | Role |
| --- | --- |
| `CONTEXT.md` | Project vocabulary, module map, and commercial readiness bar. |
| `README.md` / `README.zh-CN.md` | Public package overview and quick start. |
| `docs/architecture.md` | Runtime surfaces and data flow. |
| `docs/configuration.md` | Environment variables and optional integrations. |
| `docs/deployment.md` | Runtime, launchd, tunnel, and maintenance setup. |
| `docs/operations.md` | Checks, refresh contract, privacy gate, and operator notes. |
| `docs/openclaw-collector-pipeline.md` | Full upstream collection and product pipeline. |
| `docs/commercial-readiness-review.md` | Current commercial readiness assessment and repair plan. |
| `docs/incidents/` | Incident history, root cause, fix, verification, and prevention. |

## Change Discipline

Scheduling changes must update all of these together:

- upstream collector schedule,
- `DAILY_COLLECTION_SLOTS` and `*_COLLECTION_TIME`,
- web refresh lag/retry configuration,
- launchd templates and installer behavior,
- schedule contract tests,
- health-report expectations,
- operations docs and incident records when applicable.

launchd changes must update all of these together:

- template under `launchd/templates`,
- install/uninstall behavior,
- support wrapper behavior,
- local validation command,
- schedule or launchd contract test.

Optional integration changes must define the disabled state. A skipped optional qmd or tunnel job must not leave a stale installed LaunchAgent reporting old failures.

## Gates

Run before release:

```bash
npm run check
npm run smoke
npm run audit:schedule
```

For reference production environments, also run the local OpenClaw BusinessSmoke and ProductionGuard equivalents after installing launchd templates.

## Health Authority Contract

When inspection layers disagree, use this order:

1. Fresh subsystem status files are the business truth.
2. launchd state proves whether a job is loaded, scheduled, or currently running.
3. A scheduled one-shot LaunchAgent can retain an old non-zero `lastExit` after a newer direct repair or gate run. That old exit code must not override a fresh `ok` status file.
4. HealthDashboard is a snapshot. It is only current if its `generatedAt` is later than the upstream status timestamps it summarizes.
5. DailyAcceptance must refresh HealthDashboard after writing its final status so follow-up monitors do not read a pre-acceptance dashboard.

Hard failures:

- missing required LaunchAgent,
- disabled or drifted schedule,
- fresh subsystem status result is `fail`,
- missing or stale required status file,
- HealthDashboard generated before a newer DailyAcceptance result when a monitor is judging post-acceptance state.

Warnings:

- fresh subsystem status is `ok` with warnings,
- recent cron execution noise when the expected jobs, enabled state, and schedules are correct,
- partial notification-channel failure when at least one required delivery path succeeds and the business checks are healthy.

## Incident Rule

Every production-facing failure must leave:

- a public-safe package incident if the fix changes this repository,
- a private operator incident if the fix depends on local paths, services, or status files,
- a changelog entry when shipped,
- a test or explicit reason why no automated test is practical.
