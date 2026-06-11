# 2026-06-11 OpenClaw Dynamic Model Routing and Inspection Upgrade

## Summary

OpenClaw model selection and fallback routing should be treated as a first-class ops capability. New model APIs can be added to the model library, then selected through a route profile without editing every feature, plugin, or cron payload.

## Implemented Upstream Pattern

- Dynamic model library for model metadata, provider classes, supported consumers, and route profiles.
- Route selector for listing profiles, switching active profile, and creating new profiles.
- Model health split into provider health and route health.
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

## Coverage Contract

The weekly unified upgrade must cover default and work instances, plugins, skills, scripts, MCP registry, LaunchAgents, runtime package patches, model route contracts, and operational policy overlays.
