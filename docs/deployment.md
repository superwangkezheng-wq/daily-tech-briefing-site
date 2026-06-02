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
- installs morning and afternoon refresh checks,
- skips evening refresh unless `INSTALL_EVENING_REFRESH=1`,
- skips tunnel unless `.env.tunnel` exists,
- skips qmd refresh unless `WIKI_SOURCE_DIR` is set.

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
