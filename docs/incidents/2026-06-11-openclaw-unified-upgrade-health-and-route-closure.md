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

## Additional Closure On 2026-06-18

The 2026-06-18 morning health failure was a real scheduled-run failure, not just an alerting false positive.

Root causes:

- The morning daily collection cron job still used the shared main agent session key. Under OpenClaw 2026.6.5 this can fail with `EmbeddedAttemptSessionTakeoverError` when another writer updates the same transcript while the embedded prompt lock is released.
- The live Gateway cron state and the local `jobs.json.migrated` snapshot diverged after manual cron edits. This made some audits read the fixed live state while other gates still read the stale file state.
- Natural-run acceptance checked Juya coverage only in the final Markdown report. The actual run proved Juya required-source coverage in the collection log via YouTube fallback, while the final Top20 did not necessarily include a Juya item.
- Some hotfixes were present only in the default runtime instance and had not been mirrored into the work instance, AssetSync source tree, and asset manifest.

Fixes:

- Daily collection and feedback cron jobs now use isolated sessions with stable keys:
  - `cron:daily-news:0930`
  - `cron:daily-news:1500`
  - `cron:daily-news:2000`
  - `cron:daily-tech-feedback:1015`
- Cron contract audit now checks `sessionTarget` and `sessionKey` as `sessionDrift` for both file and live Gateway state.
- The persisted `jobs.json.migrated` snapshot was reconciled with live Gateway cron state.
- Business smoke no longer hides oversized direct-channel sessions by raising the limit. It archives and resets oversized direct-channel sessions above the strict 200K threshold.
- Natural-run acceptance now accepts Juya coverage evidence from either the final report or the same-day OpenClawDailyNews collection log.
- AssetSync overlays now include the cron contract audit, natural-run acceptance, source manifest, and task audit waiver/policy files so weekly upgrades do not erase these fixes.

Verification:

- Manual morning collection rerun completed successfully with isolated session routing.
- Output landed in the local Obsidian raw collections directory as `2026-06-18-095607-资讯采集.md`.
- Obsidian save succeeded.
- Feishu push succeeded.
- WeChat gateway accepted the push.
- `summarize-pro` completed without local fallback.
- Cron file/live audits returned `ok`, `errors=0`, `warnings=0`, `sessionDrift=[]`.
- Natural-run acceptance returned `ok`, `errors=0`, `warnings=0`.
- Production guard returned `ok`, `errors=0`, `warnings=0`.
- Business smoke returned `Business smoke OK`.

## Zhihu Wiki Archive Route Closure On 2026-06-18

Later on 2026-06-18, a WeChat-channel request to save a Zhihu article to the local wiki failed with an anti-scraping explanation even though the dedicated Zhihu archive wrapper was capable of extracting and ingesting the article.

Root cause:

- The dedicated `web-article-archive` skill correctly required Zhihu URLs to use `workspace/scripts/zhihu_article_to_wiki_clipping.sh "<url>" "wiki"`.
- The top-level `AGENTS.md` still contained an older route that grouped "non-WeChat web pages / Zhihu" into the generic `web_article_to_wiki_clipping.sh` flow.
- The WeChat channel model followed that older top-level rule, attempted `web_fetch`, `curl`, and the generic archiver, and never invoked the channel-safe Zhihu wrapper.
- The previous morning validation proved the wrapper and one URL path, but it did not cover the full WeChat inbound route selection behavior.

Fixes:

- Default and work `AGENTS.md` now split the archive route explicitly:
  - WeChat official-account articles use `wechat_article_to_obsidian.sh`.
  - Zhihu / zhihu.com / zhuanlan.zhihu.com wiki saves must first use `zhihu_article_to_wiki_clipping.sh`.
  - Other web articles must first extract Markdown and then use `web_article_to_wiki_clipping.sh`.
- `AGENTS.shared.md` and the AssetSync source copy now carry the same Zhihu hard route.
- Business smoke now fails if top-level AGENTS collapses Zhihu saves back into the generic web archiver.
- Daily acceptance now checks the same top-level route contract.
- Daily acceptance also uses the same Juya coverage evidence semantics as natural-run acceptance: final report evidence or same-day OpenClawDailyNews log evidence is acceptable.

Verification:

- The failed article was recovered into the local wiki as `wiki/sources/zhuanlan-zhihu-com-p-2050523911419326680.md`.
- `wiki_ingest_verified` passed for the recovered source page.
- QMD embedding completed for the new source.
- `test_web_article_extract.py` passed: 5 tests OK.
- Business smoke passed.
- Daily acceptance passed with `errors=0`, `warnings=0`.

## Self-Improvement Closure On 2026-06-18

The OpenClaw self-improvement loop did run and did notice the failed Zhihu archive session. The failure was in what it learned.

Findings:

- `com.lenovo.openclaw.skill-evolution` was loaded, scheduled hourly, and exited successfully.
- The 15:00 run extracted the failed WeChat-channel Zhihu session into a candidate under `.learnings/workflow-skill-evolution/candidates/`.
- The generated candidate was overfit to the exact Zhihu URL and replayed the failed tool sequence (`web_fetch`, `curl`, generic archiver) instead of the existing `web-article-archive` skill.
- The evaluation layer treated session completion as task success and did not detect final-answer failure language such as "not written to the knowledge base" or "paste the body manually".

Fixes:

- `workflow_skill_autopilot.py` now rejects traces whose final answer indicates failure or manual fallback.
- It also rejects Zhihu wiki archive traces that bypass `zhihu_article_to_wiki_clipping.sh` or try direct/generic fetch before the dedicated wrapper.
- Valid Zhihu/wiki traces now canonicalize to `auto-workflow-web-article-wiki-archive` rather than a URL-specific skill name.
- `workflow_skill_pipeline.py` now uses target-success semantics, marks failed/manual-fallback traces as failed, and requires a clean safety review for evaluation pass.
- The bad URL-specific candidate was quarantined so it is preserved as evidence but cannot match, promote, or create recurring health warnings.
- AssetSync coverage now includes `workflow_skill_autopilot.py`, `openclaw_skill_evolution_autopilot.py`, and `openclaw_skill_evolution_health.py`.

Verification:

- The real failed session now returns `qualifies=False`, `candidate_completed=False`, and `evaluation_passed=False`.
- A synthetic positive Zhihu/wiki trace that first invokes `zhihu_article_to_wiki_clipping.sh` and emits `wiki_ingest_verified` returns `qualifies=True`, with slug `auto-workflow-web-article-wiki-archive`.
- Skill evolution health returns `status=ok` with no warnings or failures.
- Skill evolution dry-run returns `result=ok`.
- Business smoke returns `Business smoke OK`.

## Unified Web Wiki Router Commercial Closure On 2026-06-18

A later WeChat-channel Zhihu save request failed again with a stale anti-scraping answer. This was not a failure of the Zhihu extractor itself: the dedicated wrapper successfully extracted the same article through Jina Reader and saved it to the local LLM Wiki. The failure was an inbound route-selection problem.

Root causes:

- The active WeChat direct session reused an older transcript that already contained the failed anti-scraping answer. The new URL message did not trigger a fresh tool call and answered from stale context.
- `lossless-claw` was not the direct cause for this specific session: the failing direct session had no active LCM conversation and injected `runtimeContextChars=0`.
- Cross-session memory still contained an obsolete L1 instruction that routed non-WeChat web saves through the low-level `web_article_to_wiki_clipping.sh` path.
- Top-level workspace rules were temporarily overwritten while adding the unified route. Business smoke correctly caught the regression because required `AGENTS.md` snippets for summarize, task-state, and WeChat reader split disappeared.
- Directly running `openclaw_business_smoke.sh` printed success but did not update `BusinessSmoke/latest-status.json`; production guard and daily acceptance could therefore keep failing by reading an old status file even after the real smoke had passed.

Fixes:

- Added `workspace/scripts/web_url_to_wiki_clipping.sh` as the single channel-safe entry for saving any single webpage, WeChat official-account article, or Zhihu article to the wiki.
- The wrapper dispatches WeChat articles to the WeChat reader, Zhihu articles to the Zhihu extractor with partial fallback, and ordinary webpages through direct extraction, Jina Reader, and Scrapling before clipping/ingest.
- WeChat and Feishu inbound handling now short-circuits clear URL-to-wiki requests before the general model loop, so stale chat memory and model fallback cannot bypass the archive contract.
- The obsolete L1 memory instruction was deprecated and replaced with the unified URL-router instruction.
- The contaminated WeChat direct session was archived out of the active session index as an incident artifact.
- `workflow_skill_autopilot.py` and `workflow_skill_pipeline.py` now reject web/wiki traces that bypass the unified router or treat manual fallback language as success.
- `openclaw_business_smoke.sh` now writes `BusinessSmoke/latest-status.json` atomically on direct success or failure; the notify wrapper passes the active log path into the smoke script. This removes the wrapper/manual status split that caused stale-failure cascades.
- `openclaw_business_smoke_notify.sh` is now an AssetSync-managed overlay, so weekly upgrades preserve the log-path/status handoff.

Verification:

- `web_url_to_wiki_clipping.sh "https://zhuanlan.zhihu.com/p/2010662945907037379" wiki` saved the article to `raw/clippings/`, updated `wiki/sources/zhuanlan-zhihu-com-p-2010662945907037379.md`, and embedded 4 QMD chunks.
- `test_web_article_extract.py`: 7 tests OK, covering direct/Jina/Scrapling fallback selection.
- WeChat extension unit tests: 3 tests OK, covering Zhihu intent, non-persistence intent, and ordinary web URL intent.
- Node bundle syntax checks passed for the Feishu runtime patch and WeChat process-message bundle.
- Runtime patch audit returned `ok=true`, `errors=0`.
- Route violation audit returned `status=ok`, `errors=0`, `warnings=0`.
- Business smoke returned `Business smoke OK` and wrote `BusinessSmoke/latest-status.json` with `result=ok`.
- Production guard returned `result=ok`, `errors=0`, `warnings=0`.
- Daily acceptance returned `result=ok`, `errors=0`, `warnings=0`; release gate passed.
- Status schema returned `result=ok`, `errors=0`, `warnings=0`.
- Ops status index returned `ok=true`; remaining L1 status only reflects intentional paused features, not an outage.
- Default and work gateways were restarted through launchd and both `/health` probes returned `{"ok":true,"status":"live"}`.

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
