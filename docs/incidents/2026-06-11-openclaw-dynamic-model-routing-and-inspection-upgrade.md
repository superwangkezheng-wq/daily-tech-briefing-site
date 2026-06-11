# 2026-06-11 OpenClaw Dynamic Model Routing and Inspection Upgrade

## Summary

OpenClaw model selection and fallback routing should be treated as a first-class ops capability. New model APIs can be added to the model library, then selected through a route profile without editing every feature, plugin, or cron payload.

Final operator state on 2026-06-11: the default instance uses `volcengine-codeplan-local`; the default daily collection policy uses a `1+3` switch with the master collection switch active, morning active, afternoon paused, and evening paused. Website publishing, feedback-health, qmd refresh, and site refresh derive their expected state from the policy.

## Implemented Upstream Pattern

- Dynamic model library for model metadata, provider classes, supported consumers, and route profiles.
- Route selector for listing profiles, switching active profile, and creating new profiles.
- Model health split into provider health and route health.
- Summarize route quality gate for rejecting leaked reasoning, self-checking text, and character-count output before falling back.
- Daily collection `1+3` ops switch: master switch plus morning, afternoon, and evening slot switches.
- Migrated cron path resolver for `jobs.json`, `jobs.json.migrated`, and fallback paths.
- Runtime patch registry for post-upgrade patch verification.
- Ops status index with L0-L3 notification classification.
- Pause/resume command for policy-based collection and publishing control.
- Unified upgrade guard phases: preflight, postflight, rollback-plan.
- Upgrade postflight no longer fails by observing its own in-progress AssetSync status; only the guarded postflight subprocess may ignore an active self-run.
- Post-reboot recovery now resolves migrated cron files through the shared path resolver instead of hardcoding `jobs.json` and `jobs-state.json`.

## Verification Expectations

Run the upstream checks before considering the system healthy:

```bash
openclaw_model_route_select.py list-profiles
openclaw_model_health.py --json
openclaw_runtime_patch_audit.py --json
openclaw_upgrade_guard.py preflight --json
openclaw_production_guard.sh --repair --json
openclaw_ops_status_index.py --json
openclaw_upgrade_guard.py postflight --json
openclaw_status_schema.py --json
test_openclaw_post_reboot_recovery.py
```

Expected state after pausing collection is `L1`, not `L3`, because paused collection/publishing is intentional operator policy while the served site can remain online.

Final local verification on 2026-06-11 completed with AssetSync `成功`, ProductionGuard `ok errors=0 warnings=0`, status schema `ok errors=0 warnings=0`, model route drift `[]`, and runtime patch errors `0`.

Additional final verification on 2026-06-11 14:14 +0800:

- Cron contract audit: `ok`, `expected=2`, morning active, afternoon/evening paused, publishing active.
- ProductionGuard dry-run: `ok errors=0 warnings=0`.
- BusinessSmoke: `Business smoke OK`; `summarize-pro dynamic route` passed after rejecting polluted `volcengine-plan/ark-code-latest` output and falling back cleanly.
- NaturalRunAcceptance: `ok`, morning report `2026-06-11-134750-资讯采集.md`, 36 items, Juya coverage present.
- Real delivery log: Obsidian saved, Feishu push success, WeChat gateway accepted with `all_success=True any_accepted=True`.

Additional Feishu inbound durability fix on 2026-06-11 15:50 +0800:

- Reproduced the failure as: Feishu gateway logged the user DM and `dispatching to agent`, but the target agent `sessions.json` was not updated and the conversation transcript did not contain the inbound text.
- Root cause: shared `recordInboundSession` launched `recordSessionMetaFromInbound(...)` as a background promise and returned before session metadata was durable. `onRecordError` only logged and swallowed errors, so dispatch could continue after a fake record success.
- Runtime fix: patch `session-*.js` so inbound session metadata is awaited and record failures are re-thrown before agent dispatch.
- Upgrade fix: add runtime patch registry entry `inbound_session_record_await`; AssetSync now tracks `RUNTIME_PATCH_CHANGED` and restarts OpenClaw gateways when runtime dist files are patched, even if `package.json` did not change.
- Added `openclaw_feishu_inbound_guard.py` plus LaunchAgent `com.lenovo.openclaw.feishu-inbound-guard`; every direct Feishu inbound event that reaches gateway dispatch must become durable in the agent session or be acknowledged and replayed once.
- Guard behavior changed from synchronous full-agent wait to async replay plus later durability confirmation, so a long deep-research flow cannot hold the guard process open.
- Added `FeishuInboundGuard/latest-status.json` with standard `result`, `checkedAt`, `observedRecent`, `replayed`, and `failed` fields.
- Wired Feishu inbound guard into `openclaw_ops_status_index.py`, `openclaw_production_guard.sh`, and `openclaw_status_schema.py`.
- Added regression coverage for gateway-log pairing and async replay process start.
- Recovered deep research task `personal-ontology-20260611-01`; the user reply `deep / full 7 categories / architecture + workflow diagrams` was replayed, became durable, and moved the run to Stage 2 KB alignment.
- Verification: runtime patch audit `ok`, guard status `result=ok`, LaunchAgent `last exit code=0`, gateway/work health `live`, ProductionGuard dry-run `ok errors=0 warnings=0`, status schema `ok errors=0 warnings=0`, and real Feishu callback message sent successfully.

## Coverage Contract

The weekly unified upgrade must cover default and work instances, plugins, skills, scripts, MCP registry, LaunchAgents, runtime package patches, model route contracts, and operational policy overlays.
