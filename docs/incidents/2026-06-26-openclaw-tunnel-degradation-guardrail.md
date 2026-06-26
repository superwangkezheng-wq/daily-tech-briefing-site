# Incident: OpenClaw Tunnel Degradation Guardrail

Date: 2026-06-26

## Summary

The 03:10 BusinessSmoke and 09:05 ProductionGuard receipts failed because the public Daily-Tech Cloudflare Tunnel returned `530 / error code: 1033`. The local Daily-Tech site and latest snapshot were healthy, but ProductionGuard treated the public tunnel failure as a hard production error. That stale BusinessSmoke failure was then read again by the later ProductionGuard run, causing one external tunnel degradation to cascade into multiple failed health receipts.

## Impact

- BusinessSmoke failed even though the local website, snapshot cache, model route, channel contracts, knowledge checks, and runtime dependencies were healthy.
- ProductionGuard later failed because it hard-referenced the stale BusinessSmoke failure status.
- The public entry `https://daily-tech.example.com` remained unavailable while `http://127.0.0.1:4321` served the current `2026-06-26 上午版` snapshot.

## Root Cause

- The Daily-Tech origin and snapshot were healthy, but `cloudflared` could not keep the public tunnel registered, so Cloudflare returned `530 / 1033`.
- The historical proxy fix had been expressed as Clash Verge enhancement rules, but those rules were configured under `append`. Clash generated `MATCH,🐟漏网之鱼` before the OpenClaw Tunnel rules, so the tunnel-specific rules were never reached.
- After the rule order was corrected, `cloudflared` registered four Cloudflare edge connections and the public site returned `200`.
- A second class of runtime risk was found during verification: zsh treats the lowercase `path` variable as the array mirror of `PATH`. Any `for path in ...` or `local path=...` in zsh can make later commands disappear in the same script scope.
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
- Corrected Clash Verge OpenClaw Tunnel rule generation so `PROCESS-NAME,cloudflared`, `argotunnel.com`, `trycloudflare.com`, and fixed Cloudflare edge IP rules are inserted before the first `MATCH` / `FINAL` rule.
- Added `openclaw_zsh_path_safety_audit.py` to ProductionGuard and renamed zsh shell variables that used the reserved `path` name in default/work/deep-research maintenance scripts.

## Verification

- `zsh -n scripts/install-launchd.sh`
- `zsh -n /Users/REDACTED/.openclaw/ops/openclaw_production_guard.sh`
- `zsh scripts/install-launchd.sh`
- Local site: `http://127.0.0.1:4321 => 200`
- Latest snapshot: `2026-06-26 上午版`
- Public tunnel: `https://daily-tech.example.com => 200` after Clash rule ordering was repaired
- `openclaw_production_guard.sh --dry-run --skip-business-smoke-status --json`: `result=ok`, `errors=0`, `warnings=2`
- `openclaw_business_smoke.sh`: `Business smoke OK`, status refreshed at `2026-06-26T10:05:09+0800`
- `openclaw_production_guard.sh --repair --json`: `result=ok`, `errors=0`, `warnings=2`
- `openclaw_zsh_path_safety_audit.py --json`: `result=ok`, `errors=0`, `scanned=122`
- `openclaw_production_guard.sh --dry-run --skip-business-smoke-status --json`: `result=ok`, `errors=0`, `warnings=1`, including `zsh path safety audit = ok`

## Prevention

Daily-Tech publishing health must be evaluated in layers:

1. Origin service and snapshot freshness are hard gates.
2. Public tunnel availability is a warning while the origin remains healthy and a self-heal kickstart has been attempted.
3. A stale BusinessSmoke failure must not be allowed to re-contaminate ProductionGuard after the current guard run proves the origin is healthy.
4. Cloudflare Tunnel protocol and edge selection must stay env-driven so operators can hot-switch between DNS discovery, fixed edges, QUIC, and HTTP/2 without patching OpenClaw code.
5. zsh production scripts must not use `path` as a variable name. The guardrail is now part of ProductionGuard because this silently mutates `PATH`.
