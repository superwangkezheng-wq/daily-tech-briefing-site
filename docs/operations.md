# Operations

## Checks

Run before committing:

```bash
npm run check
npm run smoke
npm run audit:schedule
```

## Refresh Contract

Reference production report windows:

| Slot | Source Window | Check Time |
| --- | --- | --- |
| morning | `00:00-09:40` | `10:00` |
| afternoon | optional / disabled by default | opt in only |
| evening | optional / disabled by default | opt in only |

Morning refresh retries up to 36 times with 10-minute spacing. Afternoon and evening refresh agents are not installed unless `INSTALL_AFTERNOON_REFRESH=1` or `INSTALL_EVENING_REFRESH=1` is set.

launchd services use the support cache at `~/Library/Application Support/daily-tech-site/cache`. The project `.cache` directory is for local/manual runs.

## 2026-06-03 Runtime Notes

- If your network makes `argotunnel` DNS discovery unreliable, prefer the user-level `http2` tunnel path and pin Cloudflare edge IPs instead of relying on the default discovery flow.
- The feedback-health receipt should report both the current installed OpenClaw version and the latest automated unified-upgrade record. These are intentionally different concepts.
- Missing `FEISHU_TARGET` should not be solved by hardcoding a personal open_id into the public package. Prefer the local environment or an active OpenClaw cron contract as the source of truth.

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
