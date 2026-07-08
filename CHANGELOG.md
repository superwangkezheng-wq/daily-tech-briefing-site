# Changelog

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
