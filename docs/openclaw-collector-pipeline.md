# OpenClaw Collector Pipeline / OpenClaw 采集与产品逻辑

This document explains the intended product logic, source layering, model chain, plugin dependencies, push mechanism, and operational gates for Daily Tech Briefing Site.

本文说明每日科技信息站的项目目的、业务逻辑、采集源分层、功能实现、模型链、插件依赖、绑定 channel 推送，以及巡检门禁。

## 1. Purpose / 项目目的

Daily technology news is noisy. A useful briefing system should not only fetch links; it should separate source types, keep the publication window explicit, dedupe repeated stories, summarize only selected items, expose a readable web page, collect feedback, and report health.

每天的科技资讯噪声很高。一个可交付的资讯系统不应该只是“抓链接”，而应该做到：

- 明确新闻范围：默认 AI + ICT + 半导体，可替换为其他领域。
- 分层采集源头：网页、官方博客、公众号、视频、播客、Builder 动态分开处理。
- 只保留发布时间可证、与主题相关的内容。
- 先筛选、去重、排序，再对最终入选条目调用模型摘要，节省 token 和成本。
- 将日报发布为网页，而不是只发一堆消息。
- 允许读者反馈，再把反馈变成次日可执行改进建议。
- 通过巡检门禁确认采集、刷新、推送和缓存状态。

## 2. Product Scope / 新闻范围

The reference setup monitors AI, ICT, cloud infrastructure, data centers, chips, semiconductors, edge AI, enterprise AI tooling, developer workflow, and related business signals.

参考配置关注：

- AI 模型、Agent、RAG、开发者工具、AI 应用。
- ICT 基础设施、云、数据中心、网络、企业软件。
- 芯片、GPU/NPU/TPU、HBM、半导体产业链。
- 端侧智能、硬件工程和模型部署。
- 产业合作、融资、并购、产品发布、监管变化。

This scope is configurable. Replace the OpenClaw source manifest, keyword weights, and source pools to target another domain.

这个范围可以替换。使用者可以改 OpenClaw 的源 manifest、关键词权重、源池和推送时间，把它变成医疗、金融、机器人、汽车、能源等领域的资讯系统。

## 3. Business Logic / 业务逻辑

The reference workflow is:

```text
Source pools
  -> layered fetch and fallback
  -> publication-date gate
  -> relevance gate
  -> dedupe
  -> ranking
  -> final selection
  -> summarize-pro summary and industry impact
  -> Markdown report
  -> website cache
  -> web page
  -> feedback
  -> feedback digest and channel push
  -> health receipt and gates
```

参考流程是：

```text
源池
  -> 分层抓取与兜底
  -> 发布日期门禁
  -> 相关性门禁
  -> 去重
  -> 排序
  -> 最终入选
  -> summarize-pro 摘要和产业影响
  -> Markdown 日报
  -> 网页缓存
  -> 网页阅读
  -> 用户反馈
  -> 反馈汇总与 channel 推送
  -> 健康回执与巡检门禁
```

The collection layer intentionally comes before the website layer. This repository can run with sample Markdown, but production collection depends on OpenClaw.

采集层先于网页层。本仓库用示例 Markdown 可以直接跑通网页，但生产级采集依赖 OpenClaw。

## 4. Dependency Matrix / 依赖清单

This project has two layers of dependencies:

1. This repository: website publishing, feedback, cache, local gates, optional channel push.
2. OpenClaw upstream: source collection, scraping, summarization, channel binding, and production cron orchestration.

本项目有两层依赖：

1. 本仓库：网页发布、反馈、缓存、本地门禁、可选 channel 推送。
2. OpenClaw 上游：源头采集、网页抓取、摘要、channel 绑定、生产 cron 编排。

### 4.1 This Repository / 本仓库依赖

| Dependency | Required | Used by | Notes |
| --- | --- | --- | --- |
| Node.js | Yes | `server.js`, `scripts/*.js` | Uses Node built-ins only; there are no npm package dependencies in `package.json`. |
| zsh | Optional but recommended | run scripts and launchd wrappers | Needed for `scripts/run-*.sh` and macOS launchd templates. |
| macOS launchd | Optional | scheduled web service / refresh checks | Templates are in `launchd/templates`; other platforms can use cron/systemd/PM2. |
| Cloudflare `cloudflared` | Optional | external HTTPS tunnel | Required only for `npm run run:tunnel` or tunnel launchd template. |
| OpenClaw CLI | Optional for website, required for push | `src/feishu.js`, feedback digest push, alert push | Local page rendering and feedback work without OpenClaw. |
| qmd | Optional | `scripts/run-qmd-refresh.sh` | Used only if you enable local knowledge index refresh. |

| 依赖 | 是否必需 | 用途 | 说明 |
| --- | --- | --- | --- |
| Node.js | 必需 | `server.js`、`scripts/*.js` | 只使用 Node 内置模块；`package.json` 没有 npm 依赖包。 |
| zsh | 可选但推荐 | 运行脚本、launchd wrapper | `scripts/run-*.sh` 和 macOS launchd 模板需要。 |
| macOS launchd | 可选 | 常驻网页服务 / 刷新检查 | 模板在 `launchd/templates`；其他系统可换 cron/systemd/PM2。 |
| Cloudflare `cloudflared` | 可选 | 外网 HTTPS tunnel | 只有 `npm run run:tunnel` 或 tunnel launchd 需要。 |
| OpenClaw CLI | 网页非必需，推送必需 | `src/feishu.js`、反馈汇总推送、告警推送 | 只看网页和提交反馈不需要 OpenClaw。 |
| qmd | 可选 | `scripts/run-qmd-refresh.sh` | 只有启用本地知识库索引刷新时需要。 |

### 4.2 OpenClaw Collector Dependencies / OpenClaw 采集层依赖

These are not bundled in this repository. They are part of the reference OpenClaw operator environment.

这些不捆绑在本仓库里，属于参考 OpenClaw 采集运行环境。

| Dependency / plugin | Required for full collector | Used for |
| --- | --- | --- |
| OpenClaw runtime and cron | Yes | Running scheduled collector, channel binding, health receipts. |
| `daily_news_v10.py` collector | Yes | AI / ICT / semiconductor source collection and Markdown report generation. |
| Source manifest `ai_ict_news_sources_v10.json` | Recommended | Configures source pools, buckets, required sources, fallback metadata, slots. |
| `scrapling` / `scrapling-official` | Yes for reference web fetch | Primary normal-page fetcher. |
| Python `urllib` | Yes | Fast fallback, RSS/feed fetch, SSL-policy fallback. |
| `beautifulsoup4` | Yes | HTML parsing, source-specific extraction, generic extraction. |
| Steel.dev / browser tooling | Optional but important | High-friction pages, JS-rendered pages, browser fallback. |
| `wechat-article-for-ai` | Optional but important | Script/cron extraction for WeChat article Markdown. |
| `wechat-mp-reader` | Optional | Dialogue/manual WeChat extraction route. |
| `miku_ai` / WeChat search tooling | Optional | WeChat official-account discovery by query. |
| `yt-dlp` | Optional but important | YouTube/Bilibili/channel metadata fallback. |
| video-source-parser / video probe | Optional | Platform-specific video feed probing before `yt-dlp`. |
| Follow Builders | Optional but important for Builder pool | X / podcast Builder feeds through `feed-x.json`, `feed-podcasts.json`, `prepare-digest.js`. |
| X API token | Optional | Only needed if generating Follow Builders feed locally through X API. |
| `summarize-pro` | Strongly recommended | Final selected item summary and industry impact generation. |
| Kimi / OpenAI-compatible / local model | Recommended | Backing model for `summarize-pro`. |
| Feishu / WeChat channel plugins | Optional | Channel push through OpenClaw bindings. |

| 依赖 / 插件 | 完整采集是否需要 | 用途 |
| --- | --- | --- |
| OpenClaw runtime 和 cron | 需要 | 定时采集、channel 绑定、健康回执。 |
| `daily_news_v10.py` 采集器 | 需要 | AI / ICT / 半导体源头采集与 Markdown 日报生成。 |
| 源 manifest `ai_ict_news_sources_v10.json` | 推荐 | 配置源池、bucket、必收源、fallback 元数据、slot。 |
| `scrapling` / `scrapling-official` | 参考网页抓取需要 | 普通网页主抓取器。 |
| Python `urllib` | 需要 | 快速 fallback、RSS/feed 抓取、SSL 策略 fallback。 |
| `beautifulsoup4` | 需要 | HTML 解析、站点专用抽取、通用抽取。 |
| Steel.dev / browser tooling | 可选但重要 | 高摩擦页面、JS 渲染页面、浏览器兜底。 |
| `wechat-article-for-ai` | 可选但重要 | 脚本 / cron 场景的公众号 Markdown 抽取。 |
| `wechat-mp-reader` | 可选 | 对话 / 手动公众号抽取路线。 |
| `miku_ai` / 微信检索工具 | 可选 | 按 query 做公众号发现。 |
| `yt-dlp` | 可选但重要 | YouTube/Bilibili/channel 元数据 fallback。 |
| video-source-parser / video probe | 可选 | 在 `yt-dlp` 前做平台专用视频源探测。 |
| Follow Builders | 可选但重要 | 通过 `feed-x.json`、`feed-podcasts.json`、`prepare-digest.js` 提供 Builder feed。 |
| X API token | 可选 | 只有本地生成 Follow Builders X feed 时需要。 |
| `summarize-pro` | 强烈推荐 | 对最终入选条目生成摘要和产业影响。 |
| Kimi / OpenAI-compatible / 本地模型 | 推荐 | 作为 `summarize-pro` 背后的模型。 |
| 飞书 / 微信 channel 插件 | 可选 | 通过 OpenClaw 绑定 channel 推送。 |

### 4.3 Dependency Boundary / 依赖边界

If you only want to run the website, use:

```bash
cp .env.example .env
npm run build:cache
npm run dev
```

No OpenClaw, Kimi, Scrapling, Steel, WeChat tooling, Follow Builders, or yt-dlp is required for this basic mode.

如果你只想运行网页：

```bash
cp .env.example .env
npm run build:cache
npm run dev
```

这个基础模式不需要 OpenClaw、Kimi、Scrapling、Steel、微信公众号工具、Follow Builders 或 yt-dlp。

If you want production collection, you need OpenClaw plus the collector dependencies above.

如果要生产级采集，则需要 OpenClaw 和上表采集依赖。

## 5. Source Layering / 源头分层采集

The reference OpenClaw V10 collector currently uses these source families:

| Layer | Reference count | Purpose |
| --- | ---: | --- |
| Main news / official sites | 32 | AI, ICT, cloud, data center, official blogs, semiconductor news. |
| WeChat mirrors | 5 | Stable website mirrors for selected official-account content. |
| WeChat discovery | 13 | Search-based official-account discovery with account and title gates. |
| Experimental WeChat discovery | 4 | Optional discovery sources, enabled only when fallback is allowed. |
| WeChat direct seeds | 2 | Known direct links for sources that cannot be reliably searched. |
| Video / podcast creators | 14 | YouTube, Bilibili, podcast, and creator updates. |
| Builder sources | 25 | AI builders and practitioner feeds. |

参考 OpenClaw V10 采集器当前使用这些源族：

| 层级 | 参考数量 | 目的 |
| --- | ---: | --- |
| 主新闻 / 官方网站 | 32 | AI、ICT、云、数据中心、官方博客、半导体新闻。 |
| 公众号镜像 | 5 | 为部分公众号提供稳定网页镜像补源。 |
| 公众号发现 | 13 | 通过检索发现公众号文章，并做账号、标题、日期门禁。 |
| 实验公众号发现 | 4 | 可选发现源，仅在配置允许时启用。 |
| 公众号直链种子 | 2 | 对搜索不稳定的公众号提供已知直链种子。 |
| 视频 / 播客创作者 | 14 | YouTube、Bilibili、播客和创作者更新。 |
| Builder 源 | 25 | AI Builder、实践者和行业观察者动态。 |

### 5.1 Web and Official Sites / 网页与官方站点

For normal web pages, the reference collector uses two fallback ladders: one for source listing pages and one for article-body context used by summarization.

普通网页有两条 fallback 链：一条用于源站列表页，一条用于给摘要模型补正文上下文。

#### Source listing page fallback / 源站列表页 fallback

Normal non-feed source:

```text
Scrapling
  -> urllib with SSL policy
  -> Steel.dev / browser fallback
  -> source-specific parser
  -> generic BeautifulSoup parser
```

普通非 feed 源：

```text
Scrapling
  -> 带 SSL 策略的 urllib
  -> Steel.dev / browser fallback
  -> 站点专用 parser
  -> 通用 BeautifulSoup parser
```

Feed / RSS / Atom source:

```text
urllib
  -> urllib retry
  -> Scrapling
  -> Steel.dev / browser fallback
  -> feed parser or source parser
```

Feed / RSS / Atom 源：

```text
urllib
  -> urllib retry
  -> Scrapling
  -> Steel.dev / browser fallback
  -> feed parser 或 source parser
```

Source configured as `fetchMode=steel_first`:

```text
Steel.dev / browser fallback
  -> Scrapling
  -> urllib
  -> source parser
```

配置为 `fetchMode=steel_first` 的高摩擦源：

```text
Steel.dev / browser fallback
  -> Scrapling
  -> urllib
  -> source parser
```

The collector does not stop at "HTTP success". It continues fallback when parsing returns zero items, titles are unusable/garbled, or no publication-time evidence is found.

采集器不会在“HTTP 成功”后就停止。如果解析 0 条、标题乱码/不可用，或没有发布时间证据，会继续切换下一个抓取器。

#### Article context fallback for summarize-pro / 摘要正文上下文 fallback

For selected candidates, the collector may fetch the article body again to give `summarize-pro` cleaner context:

```text
urllib
  -> Scrapling
  -> Steel.dev / browser fallback
  -> source-specific body selectors
  -> meta description
  -> article/main/content generic extraction
```

对于最终候选，采集器会再次补正文给 `summarize-pro`：

```text
urllib
  -> Scrapling
  -> Steel.dev / browser fallback
  -> 站点专用正文 selector
  -> meta description
  -> article/main/content 通用正文抽取
```

For WeChat article URLs in this context, it first uses the WeChat reader route instead of generic HTML.

如果正文 URL 是微信公众号文章，则优先走微信公众号 reader 路线，而不是普通 HTML 抓取。

### 5.2 WeChat Official Accounts / 微信公众号

WeChat is not treated as a generic web page. It has its own route:

1. Mirror-first when a stable web mirror exists.
2. Discovery search through `miku_ai` / WeChat search tooling.
3. Account-name gate and optional source mismatch policy.
4. Title/date pattern gate for date-based roundups.
5. Direct seed fallback when discovery is not stable.
6. Content extraction through `wechat-article-for-ai` or `wechat-mp-reader`.

公众号不是普通网页，参考链路是：

1. 有稳定镜像时，先走镜像。
2. 没有镜像或镜像不够新时，通过 `miku_ai` / 微信检索工具做 discovery。
3. 检查账号名，必要时才允许 source mismatch。
4. 对按日期滚动的汇总型公众号，检查标题和日期信号。
5. discovery 不稳定时使用直链种子兜底。
6. 正文抽取使用 `wechat-article-for-ai` 或 `wechat-mp-reader`。

### 5.3 Video and Podcast Pool / 视频与播客池

Video and podcast sources are separated from article sites because they need different parsing and freshness signals. The reference setup uses creator pools and video tooling such as `yt-dlp` / video source probes where applicable.

视频和播客源与网页源分开，因为它们的发布时间、正文提取和标题噪声不同。参考实现中视频池包括 YouTube、Bilibili 和播客创作者，并在需要时使用 `yt-dlp` / video source parser 之类工具做补充解析。

Reference video fallback order:

```text
video-source-parser / video probe
  -> YouTube channel RSS when applicable
  -> yt-dlp flat playlist
  -> Bilibili detail enrichment when applicable
  -> Bilibili HTML fallback: Steel.dev -> Scrapling -> urllib
```

参考视频 fallback 顺序：

```text
video-source-parser / video probe
  -> YouTube 频道 RSS（适用时）
  -> yt-dlp flat playlist
  -> Bilibili detail enrichment（适用时）
  -> Bilibili HTML fallback：Steel.dev -> Scrapling -> urllib
```

### 5.4 Follow Builders / Builder 池

The Builder pool uses Follow Builders instead of scraping `x.com` pages directly.

Builder 池不直接抓 `x.com` 页面，而是使用 Follow Builders 的聚合 feed。

Reference order:

1. Try remote `feed-x.json`.
2. If enabled and `X_BEARER_TOKEN` exists, generate feed through the X API.
3. Try `prepare-digest.js`.
4. Fall back to local `feed-x.json`.
5. For podcasts, try remote `feed-podcasts.json`, then local cache.

参考顺序：

1. 优先拉远程 `feed-x.json`。
2. 如果开启 `FOLLOW_BUILDERS_ENABLE_X_API_FALLBACK=1` 且配置了 `X_BEARER_TOKEN`，用 X API 本地生成 feed。
3. 再尝试 `prepare-digest.js`。
4. 最后回退本地 `feed-x.json`。
5. 播客池先拉远程 `feed-podcasts.json`，再回退本地缓存。

## 6. Selection Logic / 入选逻辑

The V10 reference collector targets a compact daily output:

- Main pool first: top AI / ICT / semiconductor items.
- Builder pool: practitioner and AI builder signals.
- Target shape: main pool around Top 15, Builder around Top 5, with automatic backfill when one pool is short.
- Morning can use a controlled recent backfill window when sources publish slightly after midnight.
- All candidates pass relevance, freshness, dedupe, and source coverage gates before summarization.

V10 参考采集器的日报不是无限堆料，而是紧凑输出：

- 主池优先：AI / ICT / 半导体主新闻。
- Builder 池：实践者、AI Builder、行业观察者动态。
- 目标形态：主池约 Top 15，Builder 约 Top 5；某池不足时自动补位。
- 上午版允许受控的近期补位，处理部分源发布时间稍晚的问题。
- 所有候选先过相关性、新鲜度、去重和源覆盖门禁，再进入摘要。

## 7. Model Chain and summarize-pro / 模型链与 summarize-pro

The reference OpenClaw setup uses:

- Summary adapter: `summarize-pro` through `summarize-openclaw.sh`.
- Primary summary model: `moonshot/kimi-k2.6`.
- Thinking disabled.
- Temperature: `0.6`.
- Configured fallbacks: `openai/gpt-5.5`, local `qwen3.5-9b-q8`.
- Policy: summarize only selected/final items, not every raw candidate.

参考 OpenClaw 配置使用：

- 摘要适配器：通过 `summarize-openclaw.sh` 调用 `summarize-pro`。
- 主摘要模型：`moonshot/kimi-k2.6`。
- 关闭 thinking。
- temperature：`0.6`。
- fallback：`openai/gpt-5.5`、本地 `qwen3.5-9b-q8`。
- 策略：只对最终入选条目做摘要，不对所有候选原文滥用模型。

The generation flow is:

1. Build context from title, source, snippet, body, and optional transcript.
2. Generate a summary-only block.
3. Generate an industry-impact block separately.
4. If output is too long or label format drifts, run strict compression / sentence-level repair.
5. If summarize-pro fails repeatedly, fall back to local deterministic rules.

生成流程：

1. 从标题、来源、摘要片段、正文、转录文本等拼上下文。
2. 先生成 summary-only。
3. 再单独生成产业影响。
4. 如果输出过长或标签漂移，做严格压缩 / 分句级修复。
5. summarize-pro 连续失败时，降级到本地规则摘要。

### What if I do not have Kimi? / 没有 Kimi 怎么办？

You can still run this website package without Kimi. The website can parse Markdown, serve pages, save feedback, and run gates without any model.

没有 Kimi 也可以运行本网站包。网页解析、缓存、反馈、门禁都不需要 Kimi。

For upstream collection quality, choose one of these:

1. Configure `summarize-pro` to an OpenAI-compatible model you have access to.
2. Use a local summary model such as Qwen, but expect shorter context, more conservative prompts, and more fallback hits.
3. Reduce selected item count before summarization to control cost and latency.
4. Add stricter source snippets or article body extraction so weaker models receive cleaner context.
5. Keep the local deterministic fallback enabled so the pipeline still produces a report when model calls fail.

上游采集质量可以这样替代：

1. 把 `summarize-pro` 配成你可用的 OpenAI-compatible 模型。
2. 使用本地 Qwen 等摘要模型，但要预期上下文更短、提示词更保守、fallback 更多。
3. 摘要前减少最终入选条目，控制成本和延迟。
4. 强化正文抽取和 source snippet，让较弱模型拿到更干净上下文。
5. 保留本地规则兜底，确保模型失败时仍能产生日报。

## 8. Functional Logic in This Repository / 本仓库功能逻辑

This repository consumes generated Markdown reports. It does not bundle private OpenClaw cron jobs or private source lists.

本仓库消费生成后的 Markdown 日报，不捆绑私有 OpenClaw cron 任务或私有源列表。

Main modules:

- `src/report-parser.js`: parses report front matter, sections, sources, links, summaries, and impacts.
- `src/site-index.js`: builds `.cache` summaries and details.
- `server.js`: serves static pages and APIs.
- `src/feedback-store.js`: saves feedback Markdown.
- `src/ops-store.js`: writes maintenance logs and status JSON.
- `scripts/digest-feedback.js`: clusters feedback and produces suggestions.
- `src/feishu.js`: sends optional OpenClaw Feishu broadcast.
- `launchd/templates`: macOS operator templates.

主要模块：

- `src/report-parser.js`：解析日报标题、时间、快照、来源、链接、摘要和产业影响。
- `src/site-index.js`：构建 `.cache` 摘要索引和详情缓存。
- `server.js`：提供静态网页和 API。
- `src/feedback-store.js`：保存反馈 Markdown。
- `src/ops-store.js`：写维护日志和状态 JSON。
- `scripts/digest-feedback.js`：聚类反馈并生成修改建议。
- `src/feishu.js`：可选调用 OpenClaw 飞书广播。
- `launchd/templates`：macOS 运行模板。

## 9. Channel Binding and Push / 绑定 channel 推送

Push is intentionally not hardcoded. The reference implementation calls:

```text
openclaw message broadcast --channel feishu --account <account> --targets <target> --message <message> --json
```

推送不写死在代码里。参考实现通过 OpenClaw channel broadcast：

```text
openclaw message broadcast --channel feishu --account <account> --targets <target> --message <message> --json
```

In this package:

- `OPENCLAW_BIN` selects the OpenClaw CLI.
- `FEISHU_ACCOUNT` selects the bound account.
- `FEISHU_TARGET` is provided by the user.
- `OPENCLAW_RUNTIME_ENV_FILE` can load runtime secrets without committing them.

在本包中：

- `OPENCLAW_BIN` 指定 OpenClaw CLI。
- `FEISHU_ACCOUNT` 指定绑定账号。
- `FEISHU_TARGET` 由使用者自己配置。
- `OPENCLAW_RUNTIME_ENV_FILE` 可加载运行密钥，不入库。

To support other channels, adapt `src/feishu.js` or add another sender module using OpenClaw's channel abstraction.

如果要支持其他 channel，可改 `src/feishu.js` 或新增 sender module，继续复用 OpenClaw 的 channel 抽象。

## 10. Schedules / 推送时间与次数

Reference production snapshots:

- Morning snapshot: around `09:40`.
- Afternoon snapshot: around `15:00`.
- Evening snapshot: around `20:00`.
- Website refresh checks: `10:00`, `15:20`, `20:20`.
- Feedback and health receipt: around `10:15`.

参考生产排期：

- 上午版：约 `09:40`。
- 下午版：约 `15:00`。
- 晚间版：约 `20:00`。
- 网页刷新检查：`10:00`、`15:20`、`20:20`。
- 反馈与健康回执：约 `10:15`。

The times and number of pushes are configurable. Change OpenClaw cron schedules for collection, and change `REFRESH_SLOTS` / launchd templates for website refresh checks.

时间和次数都可以定制。采集时间改 OpenClaw cron，网页刷新检查改 `REFRESH_SLOTS` 和 launchd templates。

## 11. Inspection Gates / 巡检门禁

This package includes:

- `npm run check`: JavaScript syntax, plist lint, privacy scan.
- `npm run smoke`: cache build + sample snapshot + feedback write.
- `npm run audit:schedule`: public schedule contract.
- `npm run audit:privacy`: private path, token, hostname, and Feishu open_id scan.

本包内置：

- `npm run check`：JS 语法、plist lint、隐私扫描。
- `npm run smoke`：缓存构建、示例快照、反馈写入。
- `npm run audit:schedule`：公开排期合同。
- `npm run audit:privacy`：个人路径、token、hostname、飞书 open_id 扫描。

Reference OpenClaw production also runs broader health checks: cron state, channel push result, qmd refresh, feedback digest, route audit, action contract audit, and release gates. Those are part of the OpenClaw operator environment, not bundled here.

参考 OpenClaw 生产环境还会跑更完整的健康检查：cron 状态、channel 推送结果、qmd 刷新、反馈汇总、路由审计、动作合同审计、发布门禁。这些属于 OpenClaw 运维环境，本仓库不直接捆绑。

## 12. Community Contribution / 共同优化

Contributions are welcome:

- Add new AI / ICT / semiconductor sources.
- Add source manifests for other domains.
- Improve WeChat extraction routes.
- Improve video and podcast parsing.
- Improve model prompts and fallback strategies.
- Add more channel senders.
- Add dashboards, metrics, or deployment recipes.

欢迎共同优化：

- 增加 AI / ICT / 半导体新闻源。
- 增加其他领域的 source manifest。
- 改进公众号抽取路线。
- 改进视频和播客解析。
- 改进模型提示词和 fallback 策略。
- 增加更多 channel 推送方式。
- 增加仪表盘、指标和部署方案。
