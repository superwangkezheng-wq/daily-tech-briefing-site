# Operations

## Checks

Run before committing:

```bash
npm run check
npm run smoke
npm run audit:schedule
```

## Refresh Contract

Default report windows:

| Slot | Source Window | Check Time |
| --- | --- | --- |
| morning | `00:00-09:40` | `10:00` |
| afternoon | `09:40-15:00` | `15:20` |
| evening | `15:00-20:00` | `20:20` |

Morning refresh retries once after 10 minutes. Afternoon and evening refreshes retry up to six times with five-minute spacing.

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
