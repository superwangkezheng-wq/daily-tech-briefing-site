# Incident: OpenClaw Tunnel Degradation Guardrail

Date: 2026-06-26

## Summary

The 03:10 BusinessSmoke and 09:05 ProductionGuard receipts failed because the public Daily-Tech Cloudflare Tunnel returned `530 / error code: 1033`. The local Daily-Tech site and latest snapshot were healthy, but ProductionGuard treated the public tunnel failure as a hard production error. That stale BusinessSmoke failure was then read again by the later ProductionGuard run, causing one external tunnel degradation to cascade into multiple failed health receipts.

## Impact

- BusinessSmoke failed even though the local website, snapshot cache, model route, channel contracts, knowledge checks, and runtime dependencies were healthy.
- ProductionGuard later failed because it hard-referenced the stale BusinessSmoke failure status.
- The public entry `https://daily-tech.example.com` remained unavailable while `http://127.0.0.1:4321` served the current `2026-06-26 上午版` snapshot.

## Root Cause

- `dailytech_tunnel.sh` forced `cloudflared` to `--protocol http2` and a fixed set of edge addresses. When that edge path degraded, the public tunnel could not connect.
- Removing the fixed edges exposed a second local network issue: `cloudflared` SRV discovery used the system resolver `114.114.114.114`, which failed for Cloudflare Tunnel SRV lookups.
- QUIC also timed out on the current network path, and HTTP/2 to the tested Cloudflare edges returned TLS EOF. This indicates a current public tunnel egress problem rather than a Daily-Tech origin failure.
- ProductionGuard did not distinguish "origin service unavailable" from "public tunnel degraded while origin remains healthy."

## Fix

- Hardened `scripts/install-launchd.sh` tunnel wrapper generation:
  - load tunnel env files defensively instead of direct `source`;
  - allow `CLOUDFLARED_PROTOCOL` and `CLOUDFLARED_EDGE_ARGS` to be changed from env without editing scripts;
  - keep fixed edge fallback for environments where Cloudflare SRV discovery is unreliable;
  - support `CLOUDFLARED_EDGE_ARGS=auto` to return to Cloudflare discovery when DNS is healthy.
- Updated ProductionGuard so Daily-Tech tunnel endpoint failures are classified as warning-level public tunnel degradation when the local site and snapshot checks remain healthy.
- Synced the ProductionGuard change to default/work ops copies and the `openclaw_md_refresh` overlay.
- Refreshed BusinessSmoke status after the guardrail change so stale failure state no longer propagates.

## Verification

- `zsh -n scripts/install-launchd.sh`
- `zsh -n /Users/REDACTED/.openclaw/ops/openclaw_production_guard.sh`
- `zsh scripts/install-launchd.sh`
- Local site: `http://127.0.0.1:4321 => 200`
- Latest snapshot: `2026-06-26 上午版`
- Public tunnel: still degraded with `530 / 1033`, recorded as warning
- `openclaw_production_guard.sh --dry-run --skip-business-smoke-status --json`: `result=ok`, `errors=0`, `warnings=2`
- `openclaw_business_smoke.sh`: `Business smoke OK`, status refreshed at `2026-06-26T10:05:09+0800`
- `openclaw_production_guard.sh --repair --json`: `result=ok`, `errors=0`, `warnings=2`

## Prevention

Daily-Tech publishing health must be evaluated in layers:

1. Origin service and snapshot freshness are hard gates.
2. Public tunnel availability is a warning while the origin remains healthy and a self-heal kickstart has been attempted.
3. A stale BusinessSmoke failure must not be allowed to re-contaminate ProductionGuard after the current guard run proves the origin is healthy.
4. Cloudflare Tunnel protocol and edge selection must stay env-driven so operators can hot-switch between DNS discovery, fixed edges, QUIC, and HTTP/2 without patching OpenClaw code.
