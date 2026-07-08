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

### 3.1 Upstream Intelligence Pipeline Shadow Contract / 上游新采集骨架影子合同

The upstream OpenClaw Intelligence Pipeline is being rebuilt as a read-only shadow flow before it replaces the V10 collector. The current shadow chain is:

```text
SourceProfile
  -> ProbeSignal
  -> RawArtifact
  -> Candidate
  -> EventCluster
  -> SelectedStory
  -> SynthesisAdapterAudit
  -> SynthesisDraft
  -> QAGateResult
  -> DeliverySnapshot
  -> ApprovalGateResult
  -> V10ParityResult
  -> DeliverySnapshotSchemaGateResult
  -> PublisherTargetContractResult
  -> PublisherRenderingContractResult
  -> PublisherPlan
  -> PublisherExecutionGateResult
  -> HealingPlanResult
  -> ReadinessReportResult
```

The shadow flow is intentionally not a publisher. It loads the V10 source manifest, builds deterministic probe/raw/candidate/event/selection/synthesis/QA outputs, keeps `network_enabled=false`, keeps `publish_enabled=false`, and leaves `DeliverySnapshot.approved=false`.

上游 OpenClaw Intelligence Pipeline 正在以只读 shadow flow 方式重建，尚未替换 V10 采集器。当前 shadow 链路是：

```text
SourceProfile
  -> ProbeSignal
  -> RawArtifact
  -> Candidate
  -> EventCluster
  -> SelectedStory
  -> SynthesisAdapterAudit
  -> SynthesisDraft
  -> QAGateResult
  -> DeliverySnapshot
  -> ApprovalGateResult
  -> V10ParityResult
  -> DeliverySnapshotSchemaGateResult
  -> PublisherTargetContractResult
  -> PublisherRenderingContractResult
  -> PublisherPlan
  -> PublisherExecutionGateResult
  -> HealingPlanResult
  -> ReadinessReportResult
```

这个 shadow flow 不是发布器。它读取 V10 源 manifest，生成确定性的 probe/raw/candidate/event/selection/synthesis/QA 输出，同时保持 `network_enabled=false`、`publish_enabled=false`、`DeliverySnapshot.approved=false`。

Current audited shadow metrics:

| Metric | Value |
| --- | ---: |
| Source profiles | 97 |
| Probe signals | 96 |
| Raw artifacts | 96 |
| Candidates | 96 |
| Verified candidates | 95 |
| Evidence verification blocks | 1 |
| Event clusters | 95 |
| Selected stories | 20 |
| Synthesis adapter | fixture_canary |
| Synthesis adapter model profile | deepseek-v4-flash |
| Synthesis adapter model calls | 0 |
| Live synthesis contract | blocked / contract-only |
| Live canary execution gate | one fixture draft only, explicit switch |
| Provider adapter harness | recorded replay, explicit injection |
| Real provider canary guard | preflight only, adapter not implemented |
| Live provider transport stub | secret-free envelope, no real network |
| HTTP transport contract shadow | endpoint/retry/secret contract, fail-closed |
| HTTP transport dry-run | sanitized request plan, no send |
| HTTP transport send shadow | injected fake client only, default off |
| Live response QA handoff | model-aware QA + approval/V10 parity, no publish |
| Live response fallback contract | decision-only retry/degrade/alert plan |
| Publisher shadow contract | side-effect-free preflight, no channel send |
| Synthesis drafts | 20 |
| QA results | 20 |
| QA blocked | 0 |
| Primary-evidence blocks | 1 |
| Approval gate | blocked |
| V10 parity schema | passed |
| V10 parity result | blocked |

当前已审计 shadow 指标：

| 指标 | 数值 |
| --- | ---: |
| 源画像 | 97 |
| 探针信号 | 96 |
| 原始工件 | 96 |
| 候选 | 96 |
| verified candidate | 95 |
| Evidence verification blocks | 1 |
| 事件簇 | 95 |
| 入选故事 | 20 |
| Synthesis adapter | fixture_canary |
| Synthesis adapter 模型画像 | deepseek-v4-flash |
| Synthesis adapter 模型调用 | 0 |
| Live synthesis contract | blocked / 仅合同 |
| Live canary execution gate | 显式开关下仅 1 条 fixture draft |
| Provider adapter harness | 录制回放，显式注入 |
| Real provider canary guard | 仅预检，adapter 未实现 |
| Live provider transport stub | 无密钥 envelope，不触真实网络 |
| HTTP transport contract shadow | endpoint/retry/secret 合同，fail-closed |
| HTTP transport dry-run | 安全 request plan，不发送 |
| HTTP transport send shadow | 仅注入 fake client，默认关闭 |
| Live response QA handoff | 模型矩阵 QA + approval/V10 parity，不发布 |
| Live response fallback contract | 只生成 retry/degrade/alert 决策 |
| Publisher shadow contract | 仅发布预检，不写文件/不推渠道 |
| 摘要草稿 | 20 |
| QA 结果 | 20 |
| QA 拦截 | 0 |
| Primary evidence 拦截 | 1 |
| Approval gate | blocked |
| V10 parity schema | passed |
| V10 parity result | blocked |

The V10 parity layer is deliberately conservative. It proves that the new shadow delivery shape can supply V10's required publishing fields: title, source, link, and summary. It also reports optional field gaps such as score, and it blocks content parity until the synthesis adapter switches from `fixture_canary` to an audited live adapter, the delivery snapshot is approved, and a production cutover gate explicitly permits publishing.

V10 parity 层故意保守：它证明新 shadow delivery 形态可以提供 V10 发布必需字段：标题、来源、链接、摘要；同时报告评分等可选字段缺口，并在 synthesis adapter 从 `fixture_canary` 切换到已审计 live adapter、`DeliverySnapshot` 获批、生产切换门禁显式放行前继续阻断内容 parity。

The live synthesis adapter contract now exists as a fail-closed shadow object. Its audited fields cover `provider_route`, `model_profile_id`, `timeout_ms`, `max_input_chars`, `max_output_tokens`, `max_estimated_cost_usd`, canary input/output schemas, and failure modes. Current blocking reasons are `live_adapter_contract_only`, `network_disabled`, and `model_calls_disabled`.

live synthesis adapter 合同现在已经存在，但仍是 fail-closed shadow object。它的审计字段覆盖 `provider_route`、`model_profile_id`、`timeout_ms`、`max_input_chars`、`max_output_tokens`、`max_estimated_cost_usd`、canary 输入/输出 schema 和失败模式。当前阻断原因为 `live_adapter_contract_only`、`network_disabled`、`model_calls_disabled`。

The live canary execution gate is also bounded to the Synthesis Engine. With `canaryExecutionEnabled=true` and `canaryFixtureEnabled=true`, it may produce exactly one fixture `SynthesisDraft` for QA validation while `network_used=false`, `model_call_count=0`, and publishing remains blocked. It must not alter source health, event selection, or publisher behavior.

live canary execution gate 也被限定在 Synthesis Engine 内。只有 `canaryExecutionEnabled=true` 且 `canaryFixtureEnabled=true` 时，它才允许生成 1 条 fixture `SynthesisDraft` 用于 QA 验证，同时保持 `network_used=false`、`model_call_count=0`、发布继续阻断。它不得改变源健康、事件选择或发布行为。

The provider adapter harness is the next Synthesis Engine seam before any real provider call. With `providerReplayEnabled=true` and an injected recorded harness, it replays provider-shaped responses, parses clean responses into `SynthesisDraft`, classifies provider errors such as `provider_timeout`, and emits a bounded `SynthesisAdapterAudit`. It keeps `network_used=false`, `model_call_count=0`, `estimated_cost_usd=0.0`, and excludes `api_key`, prompt, article text, and source payload from traces. The default pipeline still uses `fixture_canary`.

provider adapter harness 是真实 provider 调用前的下一道 Synthesis Engine seam。只有 `providerReplayEnabled=true` 且显式注入 recorded harness 时，它才回放 provider 形态响应，把干净响应解析成 `SynthesisDraft`，把 `provider_timeout` 等 provider 错误归类到审计，并输出受限的 `SynthesisAdapterAudit`。它保持 `network_used=false`、`model_call_count=0`、`estimated_cost_usd=0.0`，trace 不包含 `api_key`、prompt、正文或 source payload。默认 pipeline 仍使用 `fixture_canary`。

The real provider canary guard is a preflight policy gate, not a provider caller. With `realProviderCanaryEnabled=true`, it requires `canaryExecutionEnabled=true`, explicit network/model switches, provider route allowlist, model allowlist, cost ceiling, timeout ceiling, and `maxCanaryItems=1`. If the policy fails, it blocks with specific reasons such as `network_disabled`, `provider_route_not_allowed`, `cost_limit_exceeded`, or `canary_limit_exceeded`. If the policy passes, it still blocks with `real_provider_adapter_not_implemented`, keeping `network_used=false`, `model_call_count=0`, and `provider_call_count=0`.

real provider canary guard 是真实调用前的预检策略门，不是 provider caller。只有 `realProviderCanaryEnabled=true` 时，它才检查 `canaryExecutionEnabled=true`、显式网络/模型开关、provider route allowlist、模型 allowlist、成本上限、超时上限以及 `maxCanaryItems=1`。策略失败时会用 `network_disabled`、`provider_route_not_allowed`、`cost_limit_exceeded`、`canary_limit_exceeded` 等原因阻断；策略通过时仍以 `real_provider_adapter_not_implemented` 阻断，并保持 `network_used=false`、`model_call_count=0`、`provider_call_count=0`。

The live provider transport stub is the first transport seam behind the real provider guard. With `providerTransportStubEnabled=true` and an injected stub transport, it builds a secret-free request envelope containing route, model profile, timeouts, token and cost ceilings, event id, slot, source count, and evidence count. It excludes API keys, prompts, article text, and source payload. Stub success responses can be parsed into `SynthesisDraft(synthesis_mode=live_provider_transport_stub)` and then checked by QA; stub timeout/error envelopes map to stable categories such as `provider_timeout`. This remains a stub: `network_used=false`, `model_call_count=0`, and real provider credentials are never read.

live provider transport stub 是 real provider guard 后面的第一道 transport seam。只有 `providerTransportStubEnabled=true` 且显式注入 stub transport 时，它才构造无密钥 request envelope，包含 route、模型画像、超时、token/成本上限、event id、slot、source count 和 evidence count；不包含 API key、prompt、正文或 source payload。stub 成功响应可解析成 `SynthesisDraft(synthesis_mode=live_provider_transport_stub)` 并进入 QA；stub timeout/error envelope 会映射到 `provider_timeout` 等稳定分类。它仍然只是 stub：`network_used=false`、`model_call_count=0`，不会读取真实 provider 凭据。

The HTTP transport implementation contract shadow is the next pre-implementation seam. With `providerHttpContractEnabled=true`, it records endpoint host/path, retry count, retry backoff, request redlines, response redlines, and a metadata-only secret resolver contract. Without a secret resolver it blocks with `secret_resolver_missing`; with a resolver it still blocks with `http_transport_contract_only`. The resolver may expose only metadata such as resolver id and secret name, never secret material. The contract contains no HTTP client and keeps `network_used=false`, `model_call_count=0`, and `provider_call_count=0`.

HTTP transport implementation contract shadow 是真正 HTTP 实现前的下一道预实现 seam。只有 `providerHttpContractEnabled=true` 时，它才记录 endpoint host/path、retry 次数、retry backoff、request redlines、response redlines，以及 metadata-only 的 secret resolver 合同。没有 resolver 时以 `secret_resolver_missing` 阻断；有 resolver 时仍以 `http_transport_contract_only` 阻断。resolver 只能暴露 resolver id、secret name 等元数据，不能暴露 secret material。该合同不包含 HTTP client，并保持 `network_used=false`、`model_call_count=0`、`provider_call_count=0`。

The Evidence Verifier is now an explicit shadow layer between Normalizer and Event Pool. It consumes `Candidate` records, emits verified candidates with `verified=true` and verification trace fields, and blocks candidates that require primary verification but lack `primary_evidence_url`. In the current source universe this keeps 96 normalized candidates auditable, passes 95 verified candidates into Event Pool, and blocks 1 aggregated-signal candidate before selection. It does not summarize, rank, publish, or beautify text.

Evidence Verifier 现在是 Normalizer 与 Event Pool 之间的显式 shadow 层。它消费 `Candidate`，输出带有 `verified=true` 和 verification trace 的 verified candidate，并阻断要求 primary verification 但缺少 `primary_evidence_url` 的候选。当前源矩阵中，96 个 normalized candidate 仍保留可审计，95 个 verified candidate 进入 Event Pool，1 个 aggregated-signal candidate 在 Selection 前被阻断。它不摘要、不排序、不发布、不美化表达。

The HTTP transport dry-run is the first sanitized request-plan implementation. With `providerHttpDryRunEnabled=true` and a metadata-only resolver, it produces `request_plan` containing method `POST`, a URL assembled from endpoint scheme/host/path, a header allowlist such as `Content-Type` and `User-Agent`, a SHA-256 body schema hash, timeout, and retry budget. It does not call `send()`, does not include Authorization, does not read provider keys, and keeps `network_used=false`, `model_call_count=0`, and `provider_call_count=0`. Without a resolver, the dry-run is blocked before a plan is emitted.

HTTP transport dry-run 是第一个安全 request-plan 实现。只有 `providerHttpDryRunEnabled=true` 且注入 metadata-only resolver 时，它才生成 `request_plan`，包含 `POST` method、由 endpoint scheme/host/path 组成的 URL、`Content-Type` 和 `User-Agent` 等 headers allowlist、SHA-256 body schema hash、timeout 和 retry budget。它不调用 `send()`，不包含 Authorization，不读取 provider key，并保持 `network_used=false`、`model_call_count=0`、`provider_call_count=0`。缺少 resolver 时，dry-run 会在生成 plan 前阻断。

The HTTP transport send shadow is the first send-shaped contract behind the dry-run plan. With `providerHttpSendEnabled=true`, a metadata-only resolver, and an injected fake client marked `network_used=false`, it may pass the sanitized request plan and request envelope to the fake client, parse a provider-shaped success response into `SynthesisDraft(synthesis_mode=http_transport_send_shadow)`, and keep the trace bounded to request schema plus response status/field shape. It remains default-off, blocks missing clients and clients marked as network-capable, excludes Authorization, API keys, prompts, article text, source payload, and raw provider payload from traces, and does not publish or replace V10.

HTTP transport send shadow 是 dry-run plan 后面的第一个“发送形状”合同。只有 `providerHttpSendEnabled=true`、注入 metadata-only resolver，并注入标记为 `network_used=false` 的 fake client 时，它才允许把安全 request plan 和 request envelope 交给 fake client，把 provider 形态成功响应解析为 `SynthesisDraft(synthesis_mode=http_transport_send_shadow)`，并且 trace 只保留 request schema 与 response 状态/字段形状。它默认关闭，会阻断缺失 client 或标记为可触网的 client；trace 不包含 Authorization、API key、prompt、正文、source payload 或原始 provider payload，也不发布、不替换 V10。

The live response QA handoff is the first post-response safety handoff. It accepts send-shadow `SynthesisDraft` objects plus the adapter audit and upstream selection context, then reuses the existing model-aware QA matrix, shadow approval gate, and V10 parity gate. Clean drafts may pass QA but remain unpublished because delivery approval and V10 content parity stay blocked; polluted drafts such as `Extract Key Facts`, `Company:`, `Product:`, `分析请求`, or reasoning/task restatement output fail closed through QA. The handoff trace does not contain prompts, article text, API keys, source payload, or raw provider payload.

live response QA handoff 是第一个响应后的安全交接模块。它接收 send-shadow 产出的 `SynthesisDraft`、adapter audit 和上游 selection context，然后复用已有的模型感知 QA 矩阵、shadow approval gate 和 V10 parity gate。干净 draft 可以通过 QA，但仍因为 delivery approval 和 V10 content parity 被阻断而不发布；被污染的 draft，例如包含 `Extract Key Facts`、`Company:`、`Product:`、`分析请求` 或推理/任务复述内容，会通过 QA fail closed。handoff trace 不包含 prompt、正文、API key、source payload 或原始 provider payload。

The live response fallback contract is the first Healing Controller-shaped decision module for QA-blocked live drafts. It consumes QA results and the source model profile, then emits a stable decision schema: `not_needed/no_action` for clean drafts, `retry_with_fallback_model` for blocked non-primary models, or `degrade_to_shadow_fixture` when the preferred model is already blocked. It records retry budget, degrade permission, alert severity, QA categories, and reasons, while keeping `network_retry_allowed=false`, model-call execution disabled, `publish_allowed=false`, and traces free of prompts, article text, API keys, source payload, and raw provider payload. CodeRabbit review was run on the shadow pipeline changes and the final review raised 0 issues.

live response fallback contract 是第一个具备 Healing Controller 形状的响应后决策模块，用于 QA 拦截后的 live draft。它消费 QA 结果和源模型画像，输出稳定决策 schema：干净 draft 为 `not_needed/no_action`，非首选模型被拦截时为 `retry_with_fallback_model`，首选模型已被拦截时为 `degrade_to_shadow_fixture`。它记录 retry budget、degrade permission、alert severity、QA categories 和 reasons，同时保持 `network_retry_allowed=false`、不执行模型调用、`publish_allowed=false`，trace 不包含 prompt、正文、API key、source payload 或原始 provider payload。已对 shadow pipeline 改动运行 CodeRabbit review，最终复审为 0 issues。

The Publisher Shadow Contract is a preflight-only publishing module. It consumes the delivery snapshot, schema gate, target contract, and approval gate summaries, then emits `publisher_plan` with target channels (`web`, `feishu`, `wechat`, `archive`), an idempotency key, story count, approval blockers, and redlines such as no network send, no file write, no channel side effect, and no reverse collection effect. In the current default shadow flow it remains blocked because the delivery snapshot is not approved, the approval gate is blocked, and publisher target metadata has not been resolved. Local adversarial review passed, and the final scoped CodeRabbit review raised 0 issues.

Publisher Shadow Contract 是一个仅预检的发布模块。它消费 delivery snapshot、schema gate、target contract 与 approval gate 摘要，输出 `publisher_plan`，包含目标渠道（`web`、`feishu`、`wechat`、`archive`）、幂等键、story count、approval blockers，以及 no network send、no file write、no channel side effect、no_reverse_collection_effect 等红线。当前默认 shadow flow 中，它仍因 delivery snapshot 未批准、approval gate blocked，以及 publisher target metadata 尚未解析而阻断。本地对抗审查已通过，最终 scoped CodeRabbit review 为 0 issues。

The Delivery Snapshot Schema Gate now sits immediately before the Publisher Shadow Contract. It checks that the delivery snapshot id and approval flag are present, story counts match the selected-story and synthesis-draft payloads, selected stories contain event id, rank, slot, coverage, and primary candidate URL, synthesis drafts contain title, summary, and impact, channels are from the allowlist, and idempotency inputs are available. It does not approve, publish, write files, call networks, or change business policy. Publisher now fails closed when this schema gate is missing or blocked.

Delivery Snapshot Schema Gate 现在位于 Publisher Shadow Contract 之前。它检查 delivery snapshot id 与 approval flag、story count 与 selected story / synthesis draft payload 是否一致，selected story 是否包含 event id、rank、slot、coverage、primary candidate URL，synthesis draft 是否包含 title、summary、impact，channel 是否在 allowlist 内，以及幂等键输入是否齐全。它不批准、不发布、不写文件、不触网、不改业务策略。Publisher 在缺少或未通过该 schema gate 时会 fail closed。

The Publisher Target Resolver / Channel Contract is the next pre-send gate. It accepts only metadata-only target descriptors for `web`, `feishu`, `wechat`, and `archive`, checks required fields such as `surface_id`, `base_path`, `target_ref`, and `archive_ref`, rejects unknown channels, and returns `publisher_target_contract`. It never reads environment variables, returns no secret material, sends no channel message, and writes no files. Publisher now fails closed when this target contract is missing or blocked.

Publisher Target Resolver / Channel Contract 是下一道发送前闸门。它只接受 metadata-only 的目标描述，覆盖 `web`、`feishu`、`wechat`、`archive`，检查 `surface_id`、`base_path`、`target_ref`、`archive_ref` 等必需字段，拒绝未知 channel，并输出 `publisher_target_contract`。它不读取环境变量，不返回 secret material，不发送渠道消息，不写文件。Publisher 在缺少或未通过该 target contract 时会 fail closed。

The Publisher Rendering Contract Shadow is the output-shape gate before any real write or send implementation. It describes the planned artifact schemas for the Markdown report, website cache, channel payloads, and archive manifest, checks selected-story and synthesis-draft render fields, and records story/channel counts. It intentionally returns no summary or impact content payloads, writes no files, sends no channels, and blocks Publisher if the rendering contract is missing or malformed.

Publisher Rendering Contract Shadow 是真实写入或发送实现前的输出形状闸门。它描述 Markdown report、website cache、channel payloads、archive manifest 的 artifact schema，检查 selected story 与 synthesis draft 的渲染必需字段，并记录 story/channel count。它刻意不返回摘要或影响正文，不写文件，不发送渠道；Publisher 在缺少或未通过 rendering contract 时会 fail closed。

The Publisher Execution Gate Shadow is the final pre-side-effect gate. It consumes `publisher_plan`, checks an explicit execution switch, supports a dry-run mode, validates the idempotency key, keeps a zero side-effect budget, and blocks real `execute` mode until a separate audited implementation exists. Even when dry-run is ready, `execution_allowed=false`, no files are written, no network is used, and no channel message is sent.

Publisher Execution Gate Shadow 是进入真实副作用前的最后一道闸门。它消费 `publisher_plan`，检查显式执行开关，支持 dry-run mode，复核幂等键，保持零副作用预算，并在单独审计的真实执行实现出现前阻断 `execute` mode。即使 dry-run ready，`execution_allowed=false`，不写文件、不触网、不发送渠道消息。

The Healing Controller Shadow closes the current read-only spine. It consumes QA, evidence-verifier, delivery schema, publisher target, rendering, publisher plan, and execution-gate signals, then emits decision-only actions such as keeping unverified candidates blocked, recording shadow publish blocks, or planning degrade/operator review for QA failures. It does not execute retries, disable sources, send alerts, write files, or hardcode source-specific exceptions.

Healing Controller Shadow 闭合了当前只读骨架。它消费 QA、evidence verifier、delivery schema、publisher target、rendering、publisher plan、execution gate 等信号，输出 decision-only 动作，例如保持未验证候选阻断、记录 shadow publish block，或在 QA 失败时计划 degrade/operator review。它不执行 retry、不禁用源、不发送 alert、不写文件，也不写死某个源的特判。

Final review closure: after the full shadow spine landed, CodeRabbit raised one maintainability issue in Evidence Verifier candidate rebuilding. That issue was fixed with `dataclasses.replace`, both OpenClaw instances passed the local test/compile/shadow checks again, and the final scoped CodeRabbit review raised 0 issues.

最终复审封板：完整 shadow spine 落地后，CodeRabbit 对 Evidence Verifier 的 candidate rebuild 提出 1 个可维护性问题。该问题已用 `dataclasses.replace` 修复，两个 OpenClaw 实例重新通过本地测试、编译和 shadow 检查，最终 scoped CodeRabbit review 为 0 issues。

Contract cleanup closure: the shadow snapshot now exposes an ordered data-contract spine from `SourceRegistry` through `HealingPlanResult`, including `PublisherPlanResult`. Health signals also cover the later delivery and publisher gates: delivery snapshot schema, publisher target contract, publisher rendering contract, publisher plan, publisher execution gate, and healing controller. Default/work checks and scoped CodeRabbit review passed with 0 issues.

合同清理封板：shadow snapshot 现在按 spine 顺序暴露 data contracts，从 `SourceRegistry` 到 `HealingPlanResult`，并补齐 `PublisherPlanResult`。Health signals 也覆盖后半段 delivery/publisher gates：delivery snapshot schema、publisher target contract、publisher rendering contract、publisher plan、publisher execution gate 和 healing controller。default/work 检查与 scoped CodeRabbit review 均为 0 issues。

Production-readiness report closure: the shadow flow now emits `ReadinessReportResult` before any production switch. It keeps `canary_allowed=false` and `production_switch_allowed=false` until live synthesis, V10 content parity, delivery approval, publisher target metadata, publisher execution policy, and real publisher execution implementation are all present. Dry-run readiness is reported separately from production switching. Default/work checks and scoped CodeRabbit review passed with 0 issues.

生产切换前 readiness report 封板：shadow flow 现在会在任何生产切换前输出 `ReadinessReportResult`。在 live synthesis、V10 content parity、delivery approval、publisher target metadata、publisher execution policy、真实 publisher execution implementation 全部具备前，`canary_allowed=false` 且 `production_switch_allowed=false`。dry-run readiness 与生产切换分开报告。default/work 检查与 scoped CodeRabbit review 均为 0 issues。

Publisher-target metadata dry-run closure: `build_shadow_flow` and the shadow CLI can now accept explicit metadata-only target descriptors for `web`, `feishu`, `wechat`, and `archive`. When configured, `publisher_target_contract` passes and the readiness report no longer lists `publisher_target_metadata` as missing; the flow still does not read secrets or environment variables, does not send channels, and does not allow canary or production switching while the other readiness blockers remain. Default/work checks, CLI metadata dry-run assertions, and scoped CodeRabbit review passed with 0 issues.

Publisher target metadata dry-run 封板：`build_shadow_flow` 与 shadow CLI 现在可显式接收 metadata-only 的 `web`、`feishu`、`wechat`、`archive` 目标描述。配置后，`publisher_target_contract` 可通过，readiness report 不再把 `publisher_target_metadata` 列为缺口；但 flow 仍不读取 secret 或环境变量，不发送渠道，并且在其他 readiness blockers 未消除前不允许 canary 或生产切换。default/work 检查、CLI metadata dry-run 断言与 scoped CodeRabbit review 均为 0 issues。

Publisher execution policy dry-run closure: the shadow CLI now accepts `--publisher-dry-run` together with metadata-only publisher targets. When configured, the readiness report no longer lists `publisher_execution_policy` as missing, but it still blocks canary and production switching while publisher preflight, delivery approval, V10 parity, live synthesis, and real publisher execution remain incomplete. Publisher target metadata loading now fails closed when channel values are not JSON objects. Default/work checks, CLI publisher dry-run assertions, side-effect invariants, and local adversarial review passed; scoped CodeRabbit review is queued by the free CLI rate limit.

Publisher execution policy dry-run 封板：shadow CLI 现在可将 `--publisher-dry-run` 与 metadata-only publisher targets 组合使用。配置后，readiness report 不再把 `publisher_execution_policy` 列为缺口，但在 publisher preflight、delivery approval、V10 parity、live synthesis 和真实 publisher execution 尚未完成前，仍阻断 canary 与 production switch。publisher target metadata 加载现在会在 channel value 不是 JSON object 时 fail closed。default/work 检查、CLI publisher dry-run 断言、副作用不变量和本地对抗审查均通过；scoped CodeRabbit review 因 free CLI rate limit 排队。

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
| OpenClaw model-route contract | Recommended | Keeps chat/cron, summarize, memory, fallback order, and thinking settings separate. |
| OpenClaw ops override/policy | Recommended | Hot-switches collection, publishing, feedback-health, qmd refresh, and inspection expectations. |
| Kimi / OpenAI-compatible / local model | Recommended | Backing models selected by the route contract. |
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
| OpenClaw 模型路由合同 | 推荐 | 分开管理 chat/cron、summarize、memory、fallback 顺序和 thinking 设置。 |
| OpenClaw ops override/policy | 推荐 | 热切换采集、发布、反馈健康、qmd 刷新和巡检预期。 |
| Kimi / OpenAI-compatible / 本地模型 | 推荐 | 由 route contract 选择的模型。 |
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

The reference OpenClaw setup uses a model-route contract rather than hardcoding one permanent provider in this public package. The private operator environment should keep the direct summarize route, fallback order, and model-output QA matrix in the upstream OpenClaw route contract.

Current reference principles:

- Summary adapter: `summarize-pro` through `summarize-openclaw.sh`.
- The direct summarize route is governed upstream by the OpenClaw model-route contract.
- The 2026-07-08 production matrix prefers DS Flash through the Volcengine alias, with Doubao Seed 2.0 Pro as a strong backup candidate.
- Models that leak analysis steps, prompt restatement, character-count checks, implementation plans, or truncated fragments must fail closed and fall back.
- Separate agent/cron routes such as CodePlan / GPT-style planning routes are not assumed to be usable by the direct summarize wrapper.
- Policy: summarize only selected/final items, not every raw candidate.

参考 OpenClaw 配置使用：

- 摘要适配器：通过 `summarize-openclaw.sh` 调用 `summarize-pro`。
- direct summarize 路线由上游 OpenClaw 模型路由合同治理。
- 2026-07-08 生产矩阵推荐火山 alias 映射 DS Flash 为首选，Doubao Seed 2.0 Pro 为强备用候选。
- 任何模型输出只要泄漏分析过程、提示词复述、字数自检、实现计划或截断残片，都必须 fail-closed 并触发 fallback。
- CodePlan / GPT 风格规划路线属于 agent / cron 能力，不默认等同于 direct summarize wrapper 可用模型。
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
2. Keep direct summarize fallbacks HTTP-compatible; do not assume an agent harness model is usable by the summarize wrapper.
3. Use a local summary model such as Qwen, but expect shorter context, more conservative prompts, and more fallback hits.
4. Reduce selected item count before summarization to control cost and latency.
5. Add stricter source snippets or article body extraction so weaker models receive cleaner context.
6. Keep the local deterministic fallback enabled so the pipeline still produces a report when model calls fail.

上游采集质量可以这样替代：

1. 把 `summarize-pro` 配成你可用的 OpenAI-compatible 模型。
2. 保持 direct summarize fallback 是 HTTP 兼容模型，不要假设 agent harness 模型能直接被摘要 wrapper 使用。
3. 使用本地 Qwen 等摘要模型，但要预期上下文更短、提示词更保守、fallback 更多。
4. 摘要前减少最终入选条目，控制成本和延迟。
5. 强化正文抽取和 source snippet，让较弱模型拿到更干净上下文。
6. 保留本地规则兜底，确保模型失败时仍能产生日报。

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

- Morning snapshot: around `09:40` by default, configurable with `MORNING_COLLECTION_TIME`.
- Afternoon snapshot: disabled by default.
- Evening snapshot: disabled by default.
- Website refresh check: automatic lag after collection, default `MORNING_REFRESH_LAG_MINUTES=20`, up to `MORNING_REFRESH_MAX_ATTEMPTS=36` attempts with `MORNING_REFRESH_RETRY_DELAY_MINUTES=10` spacing.
- Feedback and health receipt: around `10:15`.

参考生产排期：

- 上午版：默认约 `09:40`，可用 `MORNING_COLLECTION_TIME` 配置。
- 下午版：默认关闭。
- 晚间版：默认关闭。
- 网页刷新检查：采集后自动滞后监测，默认 `MORNING_REFRESH_LAG_MINUTES=20`，最多 `MORNING_REFRESH_MAX_ATTEMPTS=36` 次，每 `MORNING_REFRESH_RETRY_DELAY_MINUTES=10` 分钟一次。
- 反馈与健康回执：约 `10:15`。

The times and number of pushes are configurable. Change OpenClaw cron schedules for collection, and change `REFRESH_SLOTS` / launchd templates for website refresh checks.

时间和次数都可以定制。采集时间改 OpenClaw cron，网页刷新检查改 `REFRESH_SLOTS` 和 launchd templates。

Reference operators should use an upstream OpenClaw ops policy for temporary pause/resume. If all daily collection slots are paused, website publishing refresh, feedback-health receipts, qmd refresh, and inspection expectations should derive their paused state from that policy. The web service and tunnel can remain online to serve the last good page.

参考运维环境应使用 OpenClaw 上游 ops policy 做临时暂停/恢复。若每日采集三槽位全部暂停，网页刷新发布、反馈健康回执、qmd 刷新和巡检预期都应从该 policy 推导出 paused 状态。网页服务和 tunnel 可以继续在线，用于服务最后一个健康页面。

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

Reference OpenClaw production also runs broader health checks: cron state, channel push result, qmd refresh, feedback digest, route audit, action contract audit, ops-policy audit, and release gates. Those are part of the OpenClaw operator environment, not bundled here.

参考 OpenClaw 生产环境还会跑更完整的健康检查：cron 状态、channel 推送结果、qmd 刷新、反馈汇总、路由审计、动作合同审计、ops policy 审计、发布门禁。这些属于 OpenClaw 运维环境，本仓库不直接捆绑。

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
