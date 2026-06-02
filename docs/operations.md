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
