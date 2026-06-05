# Configuration

Configuration is read from environment variables. For local development, copy `.env.example` to `.env`.

## Required For Production

| Variable | Purpose |
| --- | --- |
| `NEWS_ARCHIVE_DIR` | Markdown report directory. |
| `FEEDBACK_DIR` | Reader feedback output directory. |
| `FEEDBACK_DIGEST_DIR` | Feedback digest output directory. |
| `MAINTENANCE_DIR` | Local operational logs and status directory. |
| `MAINTENANCE_TOKEN` | Token for maintenance page and local maintenance APIs. |

## Optional Channel Push

| Variable | Purpose |
| --- | --- |
| `OPENCLAW_BIN` | OpenClaw CLI command. Defaults to `openclaw`. |
| `FEISHU_ACCOUNT` | OpenClaw Feishu account name. Defaults to `default`. |
| `FEISHU_TARGET` | User-provided Feishu open_id or target accepted by your OpenClaw setup. |
| `OPENCLAW_RUNTIME_ENV_FILE` | Optional env file loaded before sending messages. |

If `FEISHU_TARGET` is empty, local site and feedback features still work. Push attempts fail clearly and are logged.

## Schedule And Refresh Follow-Up

The collector itself is scheduled by OpenClaw or your own scheduler. Keep that external schedule aligned with these site settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DAILY_COLLECTION_SLOTS` | `morning` | Comma-separated daily slots, such as `morning` or `morning,afternoon`. This controls how many daily slots the launchd installer should follow by default. |
| `MORNING_COLLECTION_TIME` | `09:40` | Reference morning collection time. |
| `MORNING_REFRESH_LAG_MINUTES` | `20` | Delay after collection before the website starts checking for the generated report. |
| `MORNING_REFRESH_MAX_ATTEMPTS` | `36` | Number of morning refresh checks before alerting. |
| `MORNING_REFRESH_RETRY_DELAY_MINUTES` | `10` | Delay between morning refresh checks. |
| `AFTERNOON_COLLECTION_TIME` | `15:00` | Optional afternoon collection time. |
| `AFTERNOON_REFRESH_LAG_MINUTES` | `20` | Optional afternoon refresh lag. |
| `AFTERNOON_REFRESH_MAX_ATTEMPTS` | `6` | Optional afternoon refresh attempts. |
| `AFTERNOON_REFRESH_RETRY_DELAY_MINUTES` | `5` | Optional afternoon retry delay. |
| `EVENING_COLLECTION_TIME` | `20:00` | Optional evening collection time. |
| `EVENING_REFRESH_LAG_MINUTES` | `20` | Optional evening refresh lag. |
| `EVENING_REFRESH_MAX_ATTEMPTS` | `6` | Optional evening refresh attempts. |
| `EVENING_REFRESH_RETRY_DELAY_MINUTES` | `5` | Optional evening retry delay. |

The default production rhythm is morning-only: collect at `09:40`, start website refresh monitoring at `10:00`, then check up to 36 times at 10-minute intervals. This keeps web publishing close to collection while allowing late reports to land automatically.

## Optional Feedback Summarization

`SUMMARIZE_WRAPPER` may point to a shell command that accepts stdin and returns text suggestions on stdout.

If it is not set, `scripts/digest-feedback.js` uses deterministic fallback summarization.

## Optional Cloudflare Tunnel

Create `.env.tunnel` from `.env.tunnel.example`:

```bash
CLOUDFLARED_TUNNEL_TOKEN=replace-with-cloudflare-tunnel-token
```

Never commit the real `.env.tunnel`.

## Optional qmd Refresh

Set `WIKI_SOURCE_DIR` before running `npm run install:launchd` if you want qmd refresh installed as a LaunchAgent.

You may also override:

- `QMD_BIN`
- `KB_ALIAS_DIR`
- `WIKI_DIR`
- `QMD_COLLECTION_NAME`
- `QMD_CONTEXT_TEXT`

If `QMD_CONTEXT_TEXT` contains spaces, quote it in shell env files:

```bash
QMD_CONTEXT_TEXT='Your collection context text'
```

When `WIKI_SOURCE_DIR` is not set, `npm run install:launchd` removes any stale qmd refresh LaunchAgent so old failures do not keep reporting as current health.
