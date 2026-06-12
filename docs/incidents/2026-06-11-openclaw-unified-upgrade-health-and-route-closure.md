# 2026-06-11 OpenClaw Unified Upgrade, Health, and Route Closure

## Summary

OpenClaw unified upgrade and health checks were closed after several upstream issues were fixed in the local OpenClaw ops layer. The default reference instance now has morning collection active, afternoon/evening paused, and publishing refresh active because it follows the active morning slot. The existing web service and tunnel remain online.

2026-06-12 update: the closure was hardened to a commercial handoff standard. The post-upgrade gate now performs real availability checks for Feishu/Weixin outbound delivery, OpenDesign, model routing, summary quality, the local/public site, and runtime dependencies. Shared status semantics now prevent stale scheduled `lastExit` values from cascading through otherwise healthy checks.

## What Changed Upstream

- The OpenClaw asset manifest now treats shared/local skill roots as managed assets, including shared skill helpers and article archive skills.
- OpenClaw runtime post-update patching now reapplies the task-flow `completed` status compatibility patch after package updates.
- The model route remains a standalone hot-switch contract. The current dynamic model route is `volcengine-codeplan-local`: `volcengine-plan/ark-code-latest -> codex/gpt-5.5 -> local-summary/qwen3.5-9b-q8` for chat/cron, with summarize using `volcengine-plan/ark-code-latest -> local-summary/qwen3.5-9b-q8`.
- `summarize-pro` now treats leaked reasoning, self-checking text, and character-count output as candidate failure so dynamic fallback can protect downstream plugins and feedback digests.
- `summarize-pro` also rejects hesitation and inner-monologue markers such as `Hmm` and `but I'm`, which were observed in a work-instance smoke run.
- OpenClaw operational checks now share a single freshness and scheduled-service semantics module instead of each script interpreting `fresh`, `stale`, `superseded`, `paused`, and `lastExit` independently.
- Upgrade postflight now runs an availability gate that sends live channel probes when enabled, checks OpenDesign, verifies the model-route contract, checks summary output quality, and validates the daily-tech site.
- Feishu operational notifications now load the existing instance app secret from the local Lark CLI secret file before invoking one-shot OpenClaw message broadcasts. This fixes the false-positive state where the Feishu account was running but the real outbound send failed with a missing access token.
- The default and work OpenClaw instances both use ops policy derived pause state for collection, publishing, feedback health, site refresh, and qmd refresh.
- The default daily collection policy is now a `1+3` switch: master plus morning, afternoon, and evening. Publishing pauses only when the master is paused or all three slots are paused.
- Manual single-article saves to "my wiki knowledge base" route to `raw/clippings`; scheduled collection and batch collection remain the only routes to `raw/collections`.

## Verification

- Unified asset sync completed successfully, including workspace skill audits and runtime post-update patches.
- Production guard dry-run returned `ok` with zero errors and zero warnings.
- Business smoke returned `OK`, and its scheduled LaunchAgent last exit code was reset to `0`.
- Cron contract audit accepted the paused collection/publishing state as healthy.
- The 2026-06-11 real morning collection saved report `2026-06-11-134750-资讯采集.md`, pushed to Feishu successfully, and was accepted by the WeChat gateway.
- Natural run acceptance returned `ok` with 36 items and Juya coverage present.
- Route violation audit and tool-route harness accepted the WeChat/web article route split.
- Default task audit returned zero errors, zero warnings, and no stderr.

Additional 2026-06-12 verification:

- Upgrade availability returned `ok`, `errors=0`, with live Feishu and Weixin outbound probes enabled.
- Feishu live outbound returned `ok=true`; Weixin live outbound returned `ok=true`.
- OpenDesign returned `open-design 0.10.0` and health `ok`.
- Upgrade postflight returned `ok=true` with the availability gate embedded.
- Production guard returned `result=ok`, `errors=0`, `warnings=0`.
- Business smoke returned `Business smoke OK` after covering notification transport and summary/model chain.
- Daily acceptance returned `result=ok`, `errors=0`, `warnings=0`.
- Ops status index returned `ok=true`, `level=L1`; L1 only reflects intentional policy pauses, not an outage.
- Default and work summary smoke tests preserved the expected OpenAI/Codex content and did not leak reasoning text.

## Current Inspection Surface

Scheduled checks:

- Daily business smoke at 03:10.
- Weekly unified asset sync/upgrade on Monday at 03:40.
- Daily production guard at 09:05.
- Daily acceptance at 10:45.
- Post-reboot recovery at login/startup.
- Hourly skill-evolution health.
- Daily log rotation and monthly cache cleanup.

Manual and release-gate checks:

- Production guard.
- Business smoke.
- Upgrade availability.
- System dry run.
- State drift audit.
- Runtime dependency audit.
- Cron contract audit.
- Model-route contract audit.
- Route violation audit.
- Tool-route harness.
- Module and action contract audits.
- Skeleton topology audit.
- Status schema audit.
- Natural run acceptance.
- Doctor noise audit.
- Session archive audit.
- Process deduplication audit.

## Optimization Plan

- Keep the OpenClaw ops status index as the single status integration point so health dashboard, business smoke, production guard, acceptance checks, and upgrade postflight read the same freshness and supersession model.
- Move migrated-path resolution into a shared resolver so cron, task, plugin, and future state migrations do not require every audit script to guess file names.
- Convert runtime post-update patches into a small patch registry with match, guard, patch, verify, and rollback metadata.
- Split provider authentication health from route health so a primary provider auth failure can be reported without claiming the whole fallback route is down.
- Add one pause/resume command that edits the upstream ops policy, reconciles launchd/cron state, and runs a quick guard after changing collection or publishing state.
- Treat real channel delivery, OpenDesign availability, model-route drift, and summary quality as minimum post-upgrade gates before declaring a weekly upgrade healthy.
- Keep public website docs focused on the contract and incident summary; keep machine paths and private state files in local Obsidian runbooks.

## Package Boundary

No public website runtime code changed in this incident. This package records the operational contract because the website publishing layer depends on the upstream OpenClaw pause and health policy, but the authoritative implementation remains in the local OpenClaw ops layer.
