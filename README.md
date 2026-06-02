# Daily Tech Briefing Site

Daily Tech Briefing Site is a local-first Node.js web app for publishing scheduled technology briefings from Markdown files, collecting reader feedback, and optionally sending operational alerts to a configured channel.

The public package contains no private tokens, no personal paths, and no bundled runtime state. Users provide their own report directory, feedback directory, maintenance token, channel target, and tunnel token.

## What It Does

- Reads scheduled Markdown briefing files from `NEWS_ARCHIVE_DIR`.
- Builds a cache for a clean web reading experience.
- Serves a public briefing site and a local-only maintenance page.
- Saves reader feedback as Markdown.
- Summarizes feedback with a configured model wrapper, or falls back to deterministic rule-based suggestions.
- Optionally sends refresh alerts or feedback digests through OpenClaw Feishu broadcast when `FEISHU_TARGET` is configured.
- Provides launchd templates for macOS operators.

## Quick Start

```bash
cp .env.example .env
npm run build:cache
npm run dev
```

Open:

```text
http://localhost:4321
```

The repository includes one sample report in `data/collections`, so the site can run immediately after clone.

## Configuration

Edit `.env` before production use:

```bash
PORT=4321
HOST=0.0.0.0
SITE_TITLE=每日科技信息
FIXED_SITE_URL=http://localhost:4321
NEWS_ARCHIVE_DIR=./data/collections
FEEDBACK_DIR=./data/feedback
FEEDBACK_DIGEST_DIR=./data/feedback/_digest
MAINTENANCE_DIR=./data/maintenance
CACHE_DIR=./.cache
SUMMARIZE_WRAPPER=
OPENCLAW_BIN=openclaw
FEISHU_ACCOUNT=default
FEISHU_TARGET=
MAINTENANCE_TOKEN=replace-with-a-local-maintenance-token
```

Required for production:

- `NEWS_ARCHIVE_DIR`: directory containing Markdown reports named like `YYYY-MM-DD-HHMMSS-资讯采集.md`.
- `FEEDBACK_DIR`: directory where reader feedback Markdown files are written.
- `MAINTENANCE_DIR`: directory where runtime logs and status notes are written.
- `MAINTENANCE_TOKEN`: token required for the maintenance page and local maintenance APIs.

Optional integrations:

- `SUMMARIZE_WRAPPER`: a shell wrapper that accepts prompt text on stdin and returns feedback suggestions on stdout.
- `OPENCLAW_BIN`, `FEISHU_ACCOUNT`, `FEISHU_TARGET`: channel push through OpenClaw Feishu broadcast.
- `.env.tunnel`: Cloudflare Tunnel token for `npm run run:tunnel`.

## Report Format

The parser expects files named:

```text
YYYY-MM-DD-HHMMSS-资讯采集.md
```

Each file should include:

```markdown
# 每日科技信息

*生成时间: 2026-06-02 09:30:00*
*快照版本: 上午版 (00:00-09:40)*
*总计: 主新闻 3 条 / 视频播客 1 条 / AI 资讯博主 1 条*

## 📰 主新闻

#### 1. 标题

**来源**: Source Name  
**链接**: https://example.com/article  

**摘要**: ...

**产业影响**：...
```

Supported sections:

- `## 📰 主新闻`
- `## 🎬 视频 / 播客`
- `## 👤 AI 资讯博主`

## Scripts

```bash
npm run build:cache       # Build site cache from Markdown reports
npm run dev               # Start local server
npm run check             # Syntax, plist, and privacy checks
npm run smoke             # Build cache and verify sample end-to-end flow
npm run audit:schedule    # Verify public schedule contract
npm run digest -- --no-push
npm run run:tunnel:quick  # Temporary Cloudflare URL
npm run run:tunnel        # Named Cloudflare Tunnel, requires .env.tunnel
```

## macOS launchd

The public repo commits templates under `launchd/templates`. Running:

```bash
npm run install:launchd
```

generates real plists into `~/Library/LaunchAgents` using your current project path and log directory. It does not require or contain any private path from the original machine.

Before installing launchd:

1. Create `.env`.
2. Set `MAINTENANCE_TOKEN`.
3. Set `FEISHU_TARGET` if you want push alerts.
4. Create `.env.tunnel` only if you want Cloudflare Tunnel.
5. Set `WIKI_SOURCE_DIR` only if you want the optional qmd refresh job.

## Privacy Boundary

The repository intentionally ignores:

- `.env`, `.env.*`, except examples.
- `.env.tunnel`.
- `.cache/`.
- `data/feedback/`.
- `data/maintenance/`.
- logs, dependencies, and build outputs.

Run before publishing:

```bash
npm run audit:privacy
```

## License

MIT
