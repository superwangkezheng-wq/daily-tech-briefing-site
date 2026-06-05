# Operations

## Checks

Run before committing:

```bash
npm run check
npm run smoke
npm run audit:schedule
```

## Refresh Contract

Reference production report windows are configurable through `.env`:

| Slot | Source Window | Check Time |
| --- | --- | --- |
| morning | `00:00-09:40` | `MORNING_COLLECTION_TIME + MORNING_REFRESH_LAG_MINUTES` |
| afternoon | optional / disabled by default | `AFTERNOON_COLLECTION_TIME + AFTERNOON_REFRESH_LAG_MINUTES` |
| evening | optional / disabled by default | `EVENING_COLLECTION_TIME + EVENING_REFRESH_LAG_MINUTES` |

Default production values are morning-only: `DAILY_COLLECTION_SLOTS=morning`, `MORNING_COLLECTION_TIME=09:40`, `MORNING_REFRESH_LAG_MINUTES=20`, `MORNING_REFRESH_MAX_ATTEMPTS=36`, and `MORNING_REFRESH_RETRY_DELAY_MINUTES=10`.

This means the web publishing layer follows collection closely, but starts monitoring with a small automatic delay at `10:00`. If a report lands late, the refresh monitor keeps checking instead of requiring manual intervention.

Afternoon and evening refresh agents are not installed unless `DAILY_COLLECTION_SLOTS` includes those slots or `INSTALL_AFTERNOON_REFRESH=1` / `INSTALL_EVENING_REFRESH=1` is set.

launchd services use the support cache at `~/Library/Application Support/daily-tech-site/cache`. The project `.cache` directory is for local/manual runs.

## 2026-06-03 Runtime Notes

- If your network makes `argotunnel` DNS discovery unreliable, prefer the user-level `http2` tunnel path and pin Cloudflare edge IPs instead of relying on the default discovery flow.
- The feedback-health receipt should report both the current installed OpenClaw version and the latest automated unified-upgrade record. These are intentionally different concepts.
- Missing `FEISHU_TARGET` should not be solved by hardcoding a personal open_id into the public package. Prefer the local environment or an active OpenClaw cron contract as the source of truth.

## 2026-06-05 Runtime Notes

- launchd templates live under `launchd/templates`; installed plists are rendered runtime artifacts.
- qmd refresh must run from the support wrapper with an explicit working directory.
- The launchd installer reads both project `.env` and private support `site.env` when present.
- Optional qmd refresh must be explicitly enabled with `WIKI_SOURCE_DIR`; otherwise stale qmd LaunchAgents are removed.
- Cron contract health is three-state: missing, disabled, or schedule drift is `FAIL`; recent execution errors are `WARN`; clean state is `OK`.
- Scheduled one-shot LaunchAgents retain old `lastExit` values. Acceptance checks must reconcile them with fresh subsystem status files instead of treating `lastExit` alone as business truth.
- HealthDashboard must be generated after DailyAcceptance when it is used as a post-acceptance health snapshot.
- Read [1+N System Guide](1n-system-guide.md) before changing schedule, qmd, launchd, tunnel, or health-report behavior.
- Record incidents under `docs/incidents/` whenever production-facing checks fail.

## Feedback Digest

```bash
npm run digest -- --no-push
```

Without `--no-push`, the digest script attempts channel push through OpenClaw. Configure `FEISHU_TARGET` first.

## Privacy Gate

```bash
npm run audit:privacy
```

The privacy gate blocks known private path, token, hostname, and Feishu open_id patterns. It is intentionally conservative and should run before pushing to a public remote.
