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
