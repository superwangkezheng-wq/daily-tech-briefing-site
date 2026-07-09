# Changelog

## 1.2.39 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Live Synthesis Adapter Evidence shadow interface.
- Recorded `--live-synthesis-evidence` CLI support, metadata-only recorded live-provider audit evidence, draft-count mismatch fail-closed behavior, and dry-run readiness with all non-shadow requirements cleared.
- Re-ran default/work tests, compile checks, CLI live-synthesis evidence assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.38 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline V10 Content Parity Evidence shadow interface.
- Recorded `--v10-reference-markdown` CLI support, external V10 Markdown reference evidence, story-count mismatch fail-closed behavior, and dry-run readiness with V10 parity separated from live synthesis.
- Re-ran default/work tests, compile checks, CLI V10 reference assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.37 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Approval Gate dry-run policy interface.
- Recorded `--approval-policy` shadow CLI support, metadata-only approval traces, delivery-snapshot approval propagation, and dry-run readiness with publisher execution still blocked from real side effects.
- Re-ran default/work tests, compile checks, CLI approval dry-run assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.36 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Publisher Preflight Diagnostics Shadow module.
- Recorded `publisher_plan.preflight_checks` and `publisher_plan.preflight_summary`, plus readiness exposure of per-check publisher preflight results while keeping publication blocked.
- Re-ran default/work tests, compile checks, CLI preflight assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.35 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline publisher execution policy dry-run path.
- Recorded the new `--publisher-dry-run` shadow CLI switch, readiness semantics that distinguish configured execution policy from publish readiness, and fail-closed metadata-channel validation.
- Re-ran default/work tests, compile checks, CLI publisher dry-run assertions, side-effect invariants, and local adversarial review; scoped CodeRabbit review is queued by the free CLI rate limit.

## 1.2.34 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline publisher-target metadata dry-run path.
- Recorded explicit metadata-only target injection for shadow flow and CLI snapshots, keeping secrets/environment reads out of the contract while removing `publisher_target_metadata` from readiness blockers when configured.
- Re-ran default/work tests, compile checks, CLI metadata dry-run assertions, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.33 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline production-readiness report shadow gate.
- Recorded explicit canary and production-switch blockers for live synthesis, V10 content parity, delivery approval, publisher target metadata, publisher execution policy, and real publisher execution implementation.
- Re-ran default/work tests, compile checks, readiness shadow assertions, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.32 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline contract-index and health-signal cleanup.
- Recorded the ordered data-contract spine, added the `PublisherPlanResult` contract, and extended shadow health signals for delivery schema, publisher target/rendering/plan/execution, and healing controller gates.
- Re-ran default/work tests, compile checks, shadow JSON assertions, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.31 - 2026-07-08

- Recorded final CodeRabbit closure for the OpenClaw Intelligence Pipeline shadow spine after the Evidence Verifier, Publisher contracts, Delivery Snapshot Schema Gate, Publisher Target/Rendering/Execution gates, and Healing Controller updates.
- Fixed the CodeRabbit-raised Evidence Verifier maintainability issue by switching verified candidate rebuilding to `dataclasses.replace`.
- Re-ran default/work tests, compile checks, shadow JSON assertions, public package checks, and CodeRabbit review; final CodeRabbit review raised 0 issues.

## 1.2.30 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Healing Controller Shadow.
- Recorded the decision-only healing plan that maps QA, evidence, publisher target/rendering, publisher plan, and execution-gate signals into non-executing retry/degrade/disable/alert decisions without source-specific hardcoding.
- Noted that default/work tests, compile checks, shadow JSON assertions, and local adversarial review passed while CodeRabbit review remains queued due CLI rate limit.

## 1.2.29 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Publisher Execution Gate Shadow.
- Recorded the final side-effect gate for publisher preflight, including explicit execution switch, dry-run mode, idempotency key validation, zero side-effect budget, and blocked real execute mode.
- Noted that default/work tests, compile checks, shadow JSON assertions, and local adversarial review passed while CodeRabbit review remains queued due CLI rate limit.

## 1.2.28 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Publisher Rendering Contract Shadow.
- Recorded the side-effect-free artifact shape contract for Markdown report, website cache, channel payloads, and archive manifest, including no content payload return, no file writes, and no channel sends.
- Noted that default/work tests, compile checks, shadow JSON assertions, and local adversarial review passed while CodeRabbit review remains queued due CLI rate limit.

## 1.2.27 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Publisher Target Resolver / Channel Contract.
- Recorded the new metadata-only target contract for `web`, `feishu`, `wechat`, and `archive`, including required target fields, channel allowlist, no secret material, and Publisher fail-closed behavior when target metadata is missing.
- Noted that default/work tests, compile checks, shadow JSON assertions, and local adversarial review passed while CodeRabbit review remains queued due CLI rate limit.

## 1.2.26 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Delivery Snapshot Schema Gate.
- Recorded the new fail-closed schema preflight between delivery snapshot approval and Publisher Shadow Contract, covering required story/draft fields, story-count consistency, channel allowlist, and idempotency inputs.
- Noted that default/work tests, compile checks, shadow JSON assertions, and local adversarial review passed while CodeRabbit review remains queued due CLI rate limit.

## 1.2.25 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Publisher Shadow Contract.
- Recorded the side-effect-free publisher preflight plan with channels, idempotency key, approval/delivery blocked reasons, and no network/file/channel sends.
- Noted that local adversarial review passed while CodeRabbit review remains queued for the Evidence Verifier and Publisher shadow substeps due CLI rate limit.

## 1.2.24 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Evidence Verifier shadow contract.
- Recorded the new `Candidate -> verified candidate -> EventCluster` flow, moving primary-evidence filtering before Event Pool while keeping Selection as a backup gate.
- Noted that local adversarial tests passed, while CodeRabbit review for this substep was blocked by CLI rate limit and should be retried after reset or repository connection.

## 1.2.23 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Live Response Fallback Contract.
- Recorded decision-only fallback planning for QA-blocked live responses: no action, retry with fallback model, or degrade to shadow fixture while keeping network/model retries disabled.
- Captured the CodeRabbit review cycle for the new shadow pipeline, including follow-up hardening for fail-closed model profiles, primary-evidence enforcement, portable manifests, health status accuracy, and stable fallback schema.

## 1.2.22 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Live Response QA Handoff module.
- Recorded that send-shadow drafts now flow through the existing model-aware QA matrix, approval gate, and V10 parity checks without publishing.
- Clarified that polluted live-response drafts fail closed through QA while clean drafts remain blocked from publication by shadow approval and V10 parity.

## 1.2.21 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline HTTP Transport Send Contract Shadow module.
- Recorded the explicit `providerHttpSendEnabled` gate, injected fake HTTP client seam, non-network preflight, and sanitized response trace.
- Clarified that send shadow remains default-off, rejects network-marked clients, excludes Authorization/API keys/prompts/article text/source payload, and still does not publish or replace V10.

## 1.2.20 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline HTTP Transport Dry-Run Implementation.
- Recorded the dry-run request plan with method, URL, header allowlist, body schema hash, timeout, and retry budget while keeping provider calls at zero.
- Clarified that dry-run requires a metadata-only secret resolver and still excludes Authorization, API keys, prompts, article text, and source payload from traces.

## 1.2.19 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline HTTP Transport Implementation Contract Shadow.
- Recorded the metadata-only secret resolver interface, endpoint/retry contract, request/response redlines, and fail-closed audit when resolver or HTTP implementation is missing.
- Clarified that even with a resolver configured, the contract remains `http_transport_contract_only`: no HTTP client, no provider key read, no network, and no model call.

## 1.2.18 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Live Provider Transport Stub seam.
- Recorded the secret-free request envelope, stub response envelope, timeout/error mapping, and QA-checked draft path behind the real provider canary guard.
- Clarified that the transport stub still uses no real network, no provider key, and no model call; it only proves the adapter seam before a future audited live transport.

## 1.2.17 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Real Provider Canary Guard.
- Recorded explicit live-provider preflight gates for network/model switches, provider route allowlist, model allowlist, cost ceiling, timeout ceiling, and single-item canary limits.
- Clarified that a policy-passing guard still blocks with `real_provider_adapter_not_implemented`, so no real network or model call occurs until a separate audited adapter is added.

## 1.2.16 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Provider Adapter Harness Shadow module.
- Recorded the recorded-replay harness for provider-shaped responses, including response parsing, provider error classification, and safe audit traces.
- Clarified that provider replay remains inside the Synthesis Engine, uses no network or model calls by default, reuses QA gates, and does not publish or replace V10 production.

## 1.2.15 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Live Canary Execution Gate.
- Recorded that explicit `canaryExecutionEnabled` plus `canaryFixtureEnabled` can produce exactly one fixture canary draft while real network/model calls remain disabled.
- Clarified that the gate stays inside the Synthesis Engine boundary: it does not affect source health, event selection, publisher behavior, or V10 production.

## 1.2.14 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Live Synthesis Adapter Contract Shadow module.
- Recorded the live adapter contract fields for provider route, model profile, timeout, input/output limits, estimated cost ceiling, and failure modes.
- Clarified that the live contract remains fail-closed with `network_disabled`, `model_calls_disabled`, and `live_adapter_contract_only`; it does not call a model, fetch the network, publish, or replace V10.

## 1.2.13 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Real Synthesis Adapter Shadow module.
- Recorded the new `SynthesisAdapterAudit` contract and `fixture_canary` adapter seam between `SelectedStory` and `SynthesisDraft`.
- Clarified that QA now runs against the adapter-declared DS Flash model profile while the adapter remains zero-network, zero-model-call, and fail-closed behind `synthesis_adapter_not_live`.

## 1.2.12 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline V10 Parity Snapshot Shadow module.
- Recorded that the parity layer parses the V10 Markdown report contract and compares it with the new shadow `DeliverySnapshot` shape without network, model, or publishing side effects.
- Clarified the current conservative result: required V10 publishing fields pass schema parity, optional score remains missing, and content parity is intentionally blocked by `shadow_synthesis_stub` plus `delivery_snapshot_not_approved`.

## 1.2.11 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline DeliverySnapshot Approval Gate shadow module.
- Recorded that the approval gate aggregates source, candidate, event, selection, synthesis, QA, model trace, primary-evidence, and health signals into one read-only decision.
- Clarified that the current shadow gate is intentionally blocked by `shadow_mode`, `publishing_disabled`, and `delivery_snapshot_not_approved`, with no publishing side effects.

## 1.2.10 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Model-Aware QA Policy shadow module.
- Recorded that the QA gate now uses the 2026-07-08 model matrix: DS Flash, Doubao Seed 2.0 Pro, MiniMax3, Kimi 2.7, GLM5.2, DS Pro, LongCat, CodePlan/GPT-5.5, and the shadow stub profile.
- Added documentation for pollution taxonomy, model-matrix regression fixtures, bounded QA trace, and fail-closed behavior without model calls or publishing side effects.

## 1.2.9 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Synthesis Contract and QA Gate shadow module.
- Recorded the current shadow synthesis metrics: 20 deterministic drafts, 20 QA results, 0 QA blocks, no model calls, and no publishing side effects.
- Clarified that Phase 1E QA blocks prompt/reasoning pollution such as `Extract Key Facts`, `Analyze the Source Text`, `Company:`, `Product:`, `分析请求`, and `输入文本`.

## 1.2.8 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Selection Policy shadow module.
- Recorded the current shadow selection metrics: 97 sources, 96 probe signals, 96 raw artifacts, 96 candidates, 96 event clusters, 20 selected stories, 1 primary-evidence block, and no publishing side effects.
- Clarified that Phase 1D selected stories carry rank, slot, reason, coverage, and primary-evidence gate status while the V10 production path remains unchanged.

## 1.2.7 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Event Pool / dedupe shadow module.
- Recorded the current shadow event metrics: 97 sources, 96 probe signals, 96 raw artifacts, 96 candidates, 96 event clusters, and no selected stories or publishing side effects.
- Clarified that Phase 1C event keys deduplicate by defragmented URL with title fallback, while preserving evidence count, primary candidate URL, and source names.

## 1.2.6 - 2026-07-08

- Documented the OpenClaw Intelligence Pipeline Normalizer / Candidate Pool shadow module.
- Recorded the current shadow candidate metrics: 97 sources, 96 probe signals, 96 raw artifacts, 96 candidates, and no event clusters, selected stories, or publishing side effects.
- Clarified that Phase 1B candidates are contract-verification objects, not final news items, and still carry `shadow=true` plus `network_used=false` evidence.

## 1.2.5 - 2026-07-08

- Documented the first OpenClaw Intelligence Pipeline functional module: a read-only adapter seam plus probe and collector shadow flow.
- Recorded the current shadow flow metrics: 97 sources, 96 probe signals, 96 raw artifacts, and zero candidates, selected stories, or publishing side effects.
- Kept the Phase 1A module separate from OpenClaw operator maintenance and from the production V10 collector entry point.

## 1.2.4 - 2026-07-08

- Clarified that the OpenClaw Intelligence Pipeline covers information collection and publishing only, not the OpenClaw operator-maintenance plane.
- Documented the Phase 1 shadow skeleton contract: load the source manifest, map governed source profiles, and produce read-only snapshots with no network or publishing side effects.
- Explicitly separated AssetSync / unified upgrade, ProductionGuard, BusinessSmoke, DailyAcceptance, SkillEvolution, memory layers, model-route hot switching, status schema, and HealthDashboard into a later OpenClaw maintenance review track.

## 1.2.3 - 2026-07-08

- Added the upstream OpenClaw Intelligence Pipeline architecture contract covering source registry, probes, collectors, pools, selection, synthesis, QA, publishing, and healing.
- Updated the 1+N guide to make the new pipeline architecture a required maintenance document.
- Corrected the collector model-chain documentation so it follows the upstream route contract and the 2026-07-08 summary model matrix instead of an older fixed primary-model note.
- Kept the website package boundary explicit: the site consumes approved delivery snapshots and does not own source collection or source-selection decisions.

## 1.2.2 - 2026-07-08

- Documented the upstream OpenClaw summary model output contract as a publishing-boundary gate for reports, wiki sources, and website caches.
- Recorded the live model matrix: DS Flash as the preferred production summary model, Doubao Seed 2.0 Pro as the strongest backup, and CodePlan/GPT-5.5 as agent-only.
- Documented the safe summary trace contract: provider/model/response-model/status/reason/fallback metadata only, with no prompt text, source text, or secrets.
- Added the 2026-07-08 incident record for contaminated summary prevention, fallback behavior, validation, and future model onboarding rules.

## 1.2.1 - 2026-07-07

- Documented the upstream OpenClaw AGI HUNT provider closure: canary, cache, disabled-by-default source config, daily-news candidate seam, and primary-verification semantics.
- Documented new OpenClaw gate coverage for AGI HUNT in BusinessSmoke, ProductionGuard, Status Schema, and AssetSync contract audit.
- Recorded the AssetSync manifest coverage that prevents AGI HUNT provider, tests, `daily_news_v10.py`, and source manifest drift across default/work OpenClaw runtimes.
- Documented the Lark PromptScript skill refresh fix: refresh `~/.agents/skills` without global PromptScript installation and guard the scope through AssetSync contract audit.

## 1.2.0 - 2026-06-16

- **AI 评分与排序 (Horizon-inspired)**: `report-parser.js` 新增 `**AI 评分**:` 字段解析（向后兼容，旧数据 score=null）；`site-index.js` 按评分降序排列条目，支持 `AI_SCORE_THRESHOLD` 阈值过滤（默认 0=不过滤，向后兼容）；`site.js` 新增评分 Badge（绿≥8/黄≥6/灰<6）。
- **均衡分组 (Horizon-inspired)**: `site-index.js` 支持每个 section（techNews/videoItems/aiCreators）按评分排序后截取前 N 条，由 `CATEGORY_GROUP_TECHNEWS/VIDEO/CREATOR` 控制（默认 0=不限）。
- **背景补充 / Enrichment (Horizon-inspired)**: 新增 `scripts/enrich-worker.js` — 异步工作器，识别全大写缩写词和专有名词，可选 DuckDuckGo 搜索背景，结果写入 `.enrich` JSON。`check-refresh.js` 在发现新日报后自动异步触发 enrich worker。
- **MCP Server (Horizon-inspired)**: 新增 `src/mcp-server/server.js` — 7 个 MCP 工具（snapshot_list / snapshot_latest / snapshot_get / cache_rebuild / health_status / feedback_search / enrich_trigger），纯 stdio 协议（可 `--http` 切换测试模式），不暴露公网。
- **前端更新**: `index.html` 条目模板新增评分 Badge 和背景折叠区；`site.css` 新增 `.entry-score` 和 `.entry-background` 样式，支持三级颜色评分。
- **配置扩展**: `.env.example` 新增 `AI_SCORE_THRESHOLD`（评分阈值）、`CATEGORY_GROUP_*`（分类上限）、`ENRICH_ENABLED`（enrich 开关）、`ENRICH_DIR`（enrich 目录）；`src/config.js` 新增 `aiScoreThreshold`、`categoryGroupLimit`、`enrichEnabled`、`enrichDir` 四个配置项。
- **npm scripts 新增**: `enrich` / `enrich:search` / `mcp` / `mcp:http`。

- Documented the reference OpenClaw `1+3` daily collection switch: master plus morning, afternoon, and evening slot controls.
- Recorded the 2026-06-11 real morning collection verification: Obsidian save, Feishu push, WeChat gateway acceptance, and qmd/site refresh health.
- Clarified that website publishing follows the active collection slots through upstream ops policy instead of a hardcoded pause.
- Documented the `summarize-pro` dynamic route quality gate that rejects leaked reasoning or character-count output before falling back.

## 1.1.12 - 2026-06-11

- Documented the upstream OpenClaw dynamic model library and profile selector for hot-switching primary and fallback model routes.
- Added the next inspection design: unified ops status index, migrated cron path resolver, runtime patch registry, provider-health versus route-health split, one-command pause/resume, and L0-L3 notification levels.
- Standardized the weekly unified upgrade expectations around preflight, postflight, and rollback-plan guard phases.
- Clarified that unified upgrade coverage must include default/work features, plugins, skills, scripts, MCP registry, LaunchAgents, and runtime patches.

## 1.1.11 - 2026-06-11

- Documented the 2026-06-11 OpenClaw unified upgrade, health-check, model-route, and article-route closure.
- Added the current inspection surface covering scheduled upgrade, business smoke, production guard, acceptance, route, model, cron, action, module, and runtime audits.
- Clarified that paused collection should keep publishing refresh paused while the existing site and tunnel stay online.
- Added upstream optimization guidance for a shared ops status index, migrated-path resolver, runtime patch registry, provider-auth health split, and one-command pause/resume flow.

## 1.1.10 - 2026-06-07

- Documented the upstream OpenClaw ops override/policy as the single hot-switch source for daily collection, website publishing, feedback health, qmd refresh, and inspection expectations.
- Clarified that pausing all default daily collection slots should automatically pause website publishing and feedback/health receipts while keeping the existing served site and tunnel online.
- Added release-gate verification notes for the reference operator state where paused cron jobs and disabled LaunchAgents are expected healthy states.
- Kept model routing as a separate hot-switch contract so provider changes do not require edits across the website package.

## 1.1.9 - 2026-06-06

- Documented the upstream OpenClaw model-route contract as a separate operational concern from the website package.
- Clarified that chat/cron agent routes may use Kimi -> CodePlan -> local fallback, while direct summarize wrappers should only use HTTP-compatible summary models.
- Added guidance to audit default/work instances, cron payloads, plugin scripts, provider settings, and thinking/reasoning controls before swapping model APIs.
- Updated the collector pipeline docs so future model changes can be handled through a route contract instead of scattered script edits.

## 1.1.8 - 2026-06-05

- Documented the unified inspection contract across status files, scheduled LaunchAgents, DailyAcceptance, and HealthDashboard.
- Clarified that fresh subsystem status files override stale scheduled LaunchAgent non-zero `lastExit` values in acceptance logic.
- Added the requirement that DailyAcceptance refresh HealthDashboard after writing its final status so dashboards do not present a stale pre-acceptance snapshot.
- Added release contract coverage for the 1+N operational health guidance.

## 1.1.7 - 2026-06-05

- Changed the feedback health report cron section to distinguish structural schedule failures from recent execution warnings.
- Kept cron contract drift as `FAIL` while showing recent OpenClaw execution errors as `WARN` so daily health receipts do not overstate stale or already-triaged cron noise.

## 1.1.6 - 2026-06-05

- Fixed qmd refresh LaunchAgent startup by loading the support/runtime environment and PATH before resolving the `qmd` binary.
- Made qmd refresh installation honor the private support `site.env` and remove stale qmd LaunchAgents when the optional wiki source is not configured.
- Added an explicit qmd refresh LaunchAgent working directory so dry-run and reboot audits share the same runtime contract.
- Preserved the morning-only refresh contract while keeping optional qmd refresh explicit and reproducible after reboot.

## 1.1.5 - 2026-06-04

- Added configurable daily collection slots, collection time, web refresh lag, refresh attempts, and retry intervals.
- Made the default production contract morning-only while keeping afternoon and evening slots opt-in.
- Extended morning refresh to follow late reports automatically through a configurable long monitoring window.
- Updated launchd installation so refresh agents follow `DAILY_COLLECTION_SLOTS` and keep afternoon/evening disabled by default.
- Updated public documentation and schedule contract tests for the configurable refresh model.

## 1.1.4 - 2026-06-03

- Hardened the public tunnel launch path around `http2` and fixed-edge startup guidance for unstable `argotunnel` discovery environments.
- Improved launchd installation by moving runtime-sensitive execution through support wrappers under `~/Library/Application Support/daily-tech-site`.
- Updated the health receipt wording so it separates the current installed OpenClaw version from the latest automated unified-upgrade record.
- Made the feedback health wrapper more resilient by recovering the Feishu target from the active OpenClaw cron contract when available.
- Synced the Juya YouTube required-source fallback fix and regression coverage used by the collector side.
