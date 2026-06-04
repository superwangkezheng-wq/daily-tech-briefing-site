# Deployment

## Local Node Process

```bash
cp .env.example .env
npm run build:cache
npm run dev
```

## Production Node Process

Use a process manager of your choice. The only hard requirement is that the process runs from the project root or receives absolute paths in `.env`.

```bash
npm run build:cache
npm run start
```

## macOS launchd

The installer renders templates from `launchd/templates` into `~/Library/LaunchAgents`.

```bash
npm run install:launchd
```

The installer:

- creates a project alias at `~/.daily-tech-site`,
- creates log and support directories,
- installs the web service,
- installs the morning refresh check,
- skips afternoon refresh unless `DAILY_COLLECTION_SLOTS` includes `afternoon` or `INSTALL_AFTERNOON_REFRESH=1`,
- skips evening refresh unless `DAILY_COLLECTION_SLOTS` includes `evening` or `INSTALL_EVENING_REFRESH=1`,
- skips tunnel unless `.env.tunnel` exists,
- skips qmd refresh unless `WIKI_SOURCE_DIR` is set.

The installed web service and refresh wrapper use `~/Library/Application Support/daily-tech-site/cache` by default. The project `.cache` directory is only the local/manual default.

Set collection times and web refresh follow-up behavior in `.env`; for example `MORNING_COLLECTION_TIME=09:40` plus `MORNING_REFRESH_LAG_MINUTES=20` starts monitoring at `10:00`.

Uninstall:

```bash
npm run uninstall:launchd
```

## Cloudflare Tunnel

Temporary tunnel:

```bash
npm run run:tunnel:quick
```

Named tunnel:

```bash
cp .env.tunnel.example .env.tunnel
# edit .env.tunnel
npm run run:tunnel
```

## Maintenance Page

The maintenance page is only authorized from loopback addresses. Use:

```text
http://localhost:4321/maintenance.html?token=YOUR_TOKEN
```
