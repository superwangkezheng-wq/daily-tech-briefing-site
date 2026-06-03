# Changelog

## 1.1.4 - 2026-06-03

- Hardened the public tunnel launch path around `http2` and fixed-edge startup guidance for unstable `argotunnel` discovery environments.
- Improved launchd installation by moving runtime-sensitive execution through support wrappers under `~/Library/Application Support/daily-tech-site`.
- Updated the health receipt wording so it separates the current installed OpenClaw version from the latest automated unified-upgrade record.
- Made the feedback health wrapper more resilient by recovering the Feishu target from the active OpenClaw cron contract when available.
- Synced the Juya YouTube required-source fallback fix and regression coverage used by the collector side.
