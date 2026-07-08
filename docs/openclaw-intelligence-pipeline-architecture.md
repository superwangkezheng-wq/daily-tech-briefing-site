# OpenClaw Intelligence Pipeline Architecture

This document records the target architecture for the upstream OpenClaw collector used by Daily Tech Briefing Site. The website package remains a publishing and feedback layer. The upstream collector should evolve from a single collector script into a governed intelligence pipeline.

## Target Spine

```text
Source Registry
  -> Probe Engine
  -> Collector Engine
  -> Normalizer
  -> Evidence Verifier
  -> Event Pool
  -> Selection Engine
  -> Synthesis Engine
  -> QA Gate
  -> Delivery Snapshot
  -> Delivery Snapshot Schema Gate
  -> Publisher Target Contract
  -> Publisher Rendering Contract
  -> Publisher
  -> Publisher Execution Gate
```

The goal is not to add more branches for individual sources. The goal is to move source identity, fetch adapters, admission policy, selection policy, verification, and health behavior into explicit interfaces.

## Boundary Correction

This pipeline covers information collection and publication only. It must stay separate from the OpenClaw operator-maintenance plane.

| Plane | Owns |
| --- | --- |
| Information collection and publishing | source registry, probes, collectors, pools, selection, synthesis, QA, delivery snapshots, website publication |
| OpenClaw operator maintenance | AssetSync / unified upgrade, ProductionGuard, BusinessSmoke, DailyAcceptance, SkillEvolution, memory layers, model-route hot switching, status schema, HealthDashboard |

The pipeline may emit health signals for its own modules, but it must not own unified upgrade policy or OpenClaw runtime maintenance decisions. Those belong to a separate review and architecture track.

## Phase 1 Shadow Skeleton

The first implementation phase is intentionally read-only:

```text
openclaw_intelligence_pipeline
  -> load source manifest
  -> produce governed SourceProfile objects
  -> produce a shadow snapshot
```

The Phase 1 runner does not fetch from the network, does not summarize, and does not publish. It exists to make the source matrix and data contracts testable before production behavior changes.

## Functional Module 1: Adapter + Probe / Collector Shadow Flow

The first functional module adds a real adapter seam while staying read-only:

```text
SourceProfile
  -> SourceAdapter.probe()
  -> ProbeSignal
  -> SourceAdapter.collect()
  -> RawArtifact
```

Current behavior:

- enabled sources produce `ProbeSignal` objects,
- enabled sources produce shadow `RawArtifact` objects,
- disabled sources are skipped,
- no network calls are made,
- no candidates are normalized,
- no stories are selected,
- no delivery snapshot is approved,
- no publishing surface is touched.

The reference manifest currently produces:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `probe_count` | 96 |
| `raw_artifact_count` | 96 |
| `candidate_count` | 0 |
| `event_cluster_count` | 0 |
| `selected_story_count` | 0 |

This module proves the pipeline can run a complete source -> probe -> raw-artifact pass before old V10 fetch logic is wrapped behind concrete adapters.

## Functional Module 2: Normalizer / Candidate Pool Shadow Flow

The second functional module maps shadow raw artifacts into auditable candidates:

```text
RawArtifact
  -> normalize_shadow_artifact()
  -> Candidate
  -> Candidate Pool
```

Current behavior:

- each enabled source raw artifact becomes one shadow candidate,
- disabled sources still do not appear,
- candidate titles are source names for contract verification only,
- candidate URLs come from source configuration,
- `published_at` remains null because the pipeline has not fetched real items,
- evidence includes `shadow=true`,
- evidence includes `network_used=false`,
- aggregator candidates preserve `requires_primary_verification=true`,
- no event clusters, selected stories, synthesis output, or publishing side effects are produced.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `probe_count` | 96 |
| `raw_artifact_count` | 96 |
| `candidate_count` | 96 |
| `event_cluster_count` | 0 |
| `selected_story_count` | 0 |

This module proves the new skeleton can hold a candidate pool before migrating V10's real parsing and normalization behavior.

## Functional Module 3: Event Pool / Dedupe Shadow Flow

The third functional module groups shadow candidates into auditable event clusters:

```text
Candidate
  -> cluster_shadow_candidates()
  -> EventCluster
  -> Event Pool
```

Current behavior:

- each shadow candidate is assigned a deterministic `event_key`,
- URLs are deduplicated after URL fragments are removed,
- candidate titles are used only as the event-key fallback when a URL is missing,
- each event cluster preserves the first candidate URL as `primary_candidate_url`,
- each event cluster reports `candidate_count`, `evidence_count`, and source names,
- each event cluster remains `selected=false`,
- the shadow snapshot exposes `event_pool` health as `ok`,
- no selected stories, synthesis output, or publishing side effects are produced.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `probe_count` | 96 |
| `raw_artifact_count` | 96 |
| `candidate_count` | 96 |
| `event_cluster_count` | 96 |
| `selected_story_count` | 0 |

This module proves the new skeleton can form an event pool before any ranking, slot allocation, summary generation, or publishing behavior moves away from the V10 production path.

## Functional Module 4: Selection Policy Shadow Flow

The fourth functional module maps shadow event clusters into auditable selected stories:

```text
EventCluster
  -> select_shadow_stories()
  -> SelectedStory
  -> Selection Coverage / Gate Results
```

Current behavior:

- the selector uses `selectionTargets.totalFinalCount` as the shadow selection limit,
- selected stories include `rank`, `slot`, `reason`, `coverage`, and `primary_evidence_ok`,
- `slot` is derived from the first candidate's source family,
- aggregator events that require primary verification are blocked unless the event cluster also contains primary evidence,
- `selection_coverage` reports selected count, primary-evidence blocks, capacity skips, and selected counts by slot,
- `selection_gate_results` records selected, blocked, and capacity-skipped events,
- the delivery snapshot remains `approved=false`,
- no synthesis output or publishing side effects are produced.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `probe_count` | 96 |
| `raw_artifact_count` | 96 |
| `candidate_count` | 96 |
| `event_cluster_count` | 96 |
| `selected_story_count` | 20 |
| `blocked_primary_evidence` | 1 |
| `skipped_capacity` | 75 |

This module proves the new skeleton can exercise ranking, slot assignment, coverage accounting, and primary-evidence gating before synthesis, QA, or publishing behavior moves away from the V10 production path.

## Functional Module 5: Synthesis Contract + QA Gate Shadow Flow

The fifth functional module adds deterministic synthesis drafts and a shadow QA gate:

```text
SelectedStory
  -> build_shadow_synthesis_drafts()
  -> SynthesisDraft
  -> run_shadow_qa_gate()
  -> QAGateResult
```

Current behavior:

- each selected story produces one deterministic `SynthesisDraft`,
- drafts include `title`, `summary`, `impact`, `model_used`, and `synthesis_mode`,
- `model_used=none` proves no real model call is made,
- `synthesis_mode=shadow_stub` proves the content is a contract placeholder,
- the QA gate checks title, summary, and impact for prompt/reasoning pollution,
- blocked pollution terms include `Extract Key Facts`, `Analyze the Source Text`, `Company:`, `Product:`, `分析请求`, `输入文本`, and related instruction residues,
- clean deterministic drafts pass QA,
- polluted fixture drafts are blocked with `reason=pollution_detected`,
- the delivery snapshot remains `approved=false`,
- no real synthesis output or publishing side effects are produced.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `probe_count` | 96 |
| `raw_artifact_count` | 96 |
| `candidate_count` | 96 |
| `event_cluster_count` | 96 |
| `selected_story_count` | 20 |
| `synthesis_draft_count` | 20 |
| `qa_result_count` | 20 |
| `qa_blocked_count` | 0 |

This module proves the new skeleton can validate the summary contract and contamination gate before any real model output is allowed into a delivery snapshot.

## Functional Module 6: Model-Aware QA Policy Shadow

The sixth functional module turns the 2026-07-08 summary model matrix into structured QA policy:

```text
SynthesisDraft
  -> MODEL_QA_PROFILES
  -> POLLUTION_RULES
  -> build_model_matrix_regression_fixtures()
  -> QAGateResult(trace)
```

Policy sources:

- `docs/incidents/2026-07-08-openclaw-summary-model-output-contract-and-matrix-closure.md`
- `docs/openclaw-collector-pipeline.md`
- `docs/operations.md`
- upstream `summarize-openclaw.sh` quality-gate behavior

Current model profiles:

| Model or route | Role | Direct summary wrapper |
| --- | --- | --- |
| `deepseek-v4-flash` | preferred primary | allowed |
| `doubao-seed-2.0-pro` | strong backup | allowed |
| `minimax-m3` | usable with gates | allowed |
| `kimi-k2.7-code` | usable with gates | allowed |
| `glm-5.2` | not primary | allowed with gates |
| `deepseek-v4-pro` | not primary | allowed with gates |
| `LongCat-2.0` | not primary | allowed with gates |
| `codeplan-gpt-5.5` | agent only | blocked |
| `shadow_stub` | shadow contract | allowed |

Current pollution taxonomy:

- reasoning leak,
- character-count self-check,
- task restatement,
- key-fact scaffolding,
- source-text analysis,
- implementation plan leakage,
- limited-source-material disclaimer,
- malformed prefix,
- truncated fragment,
- agent route used as a summary wrapper.

Current regression fixtures:

| Fixture | Expected result |
| --- | --- |
| DS Flash clean | pass |
| Doubao Seed 2.0 Pro clean | pass |
| GLM5.2 key-fact scaffold | block |
| DS Pro task restatement | block |
| MiniMax3 malformed prefix | block |
| Kimi 2.7 count self-check | block |
| LongCat reasoning leak | block |
| CodePlan/GPT-5.5 agent-only route | block |

Each `QAGateResult` now includes model profile metadata, pollution categories, blocked terms, and a bounded fail-closed trace. The trace is intentionally secret-free: it does not include prompt text, article text, source payloads, API keys, or credentials.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `model_profile_count` | 9 |
| `model_matrix_fixture_count` | 8 |
| `qa_result_count` | 20 |
| `qa_blocked_count` | 0 |
| `qa_policy.fail_closed` | true |

This module proves the QA gate is no longer a loose keyword sentinel. It now reflects the live model-matrix conclusions while still making no model calls and no publishing changes.

## Functional Module 7: DeliverySnapshot Approval Gate Shadow

The seventh functional module adds a read-only approval gate for delivery snapshots:

```text
HealthSignal / SelectionCoverage / QAGateResult / DeliverySnapshot
  -> evaluate_shadow_approval_gate()
  -> ApprovalGateResult
```

Current behavior:

- aggregates upstream source, candidate, event, selection, synthesis, QA, and model-aware trace status,
- records positive checks such as `qa_gate_passed`, `model_trace_fail_closed`, and `primary_evidence_gate_enforced`,
- records metrics such as selected stories, synthesis drafts, QA results, QA blocks, and primary-evidence blocks,
- blocks publication with `shadow_mode`, `publishing_disabled`, and `delivery_snapshot_not_approved`,
- keeps `DeliverySnapshot.approved=false`,
- keeps `publish_enabled=false`,
- produces no publishing side effects.

Current reference metrics:

| Metric | Value |
| --- | ---: |
| `source_count` | 97 |
| `candidate_count` | 96 |
| `event_cluster_count` | 96 |
| `selected_story_count` | 20 |
| `synthesis_draft_count` | 20 |
| `qa_result_count` | 20 |
| `qa_blocked_count` | 0 |
| `blocked_primary_evidence` | 1 |
| `approval_gate.result` | blocked |
| `approval_gate.approved` | false |

This module proves the quality chain can be summarized into a single approval decision while remaining deliberately fail-closed in shadow mode.

## Current Friction

The reference V10 collector works, but it combines too many responsibilities:

- source registry,
- probing,
- fetching,
- source-specific fallback,
- freshness and relevance gates,
- duplicate handling,
- required-source coverage,
- ranking and slot allocation,
- summary and impact generation,
- publishing,
- source canaries and health behavior.

That makes the main collector module shallow: callers and maintainers must understand many implementation details at the same time.

## Target Modules

| Module | Interface | Implementation hidden behind the interface |
| --- | --- | --- |
| Source Registry | source matrix to `SourceProfile` | source identity, type, lifecycle, trust tier, adapter, quotas, health policy |
| Probe Engine | `SourceProfile` to `ProbeSignal` | source freshness checks, aggregator signals, video updates, search discovery |
| Collector Engine | `ProbeSignal` to `RawArtifact` | RSS, HTML, browser, API, video, WeChat, manual seed fetching |
| Normalizer | `RawArtifact` to `Candidate` | title, URL, timestamp, source, snippet, evidence normalization |
| Evidence Verifier | `Candidate` to verified candidate | primary evidence requirement, timestamp evidence, aggregator-source landing |
| Event Pool | verified candidates to `EventCluster` | event-level dedupe and multi-source evidence grouping |
| Selection Engine | `EventCluster` to `SelectedStory` | slot quotas, diversity, coverage, fallback, ranking |
| Synthesis Engine | `SelectedStory` to generated fields | summary, impact, title refinement, model trace, fallback |
| QA Gate | generated fields to approved output | model-aware profiles, pollution taxonomy, truncation checks, regression fixtures, fail-closed trace |
| Approval Gate | health, selection, synthesis, QA, and delivery snapshot to approval decision | blocked reasons, approval checks, publication readiness metrics |
| Delivery Snapshot Schema Gate | delivery snapshot, selected stories, synthesis drafts, and channel list to schema pass/block | required field checks, story-count consistency, channel allowlist, idempotency inputs |
| Publisher Target Contract | channel list and metadata-only target descriptors to target pass/block | channel allowlist, target required fields, no secret material, no sends |
| Publisher Rendering Contract | selected stories and synthesis drafts to artifact shape pass/block | Markdown/cache/channel/archive schemas, render required fields, no content payloads |
| Publisher | approved `DeliverySnapshot` to output surfaces | Markdown report, cache, channel message, archive |
| Publisher Execution Gate | publisher preflight plan and execution policy to dry-run/blocked decision | explicit execution switch, mode, idempotency, side-effect budget |
| Healing Controller | health signals to actions | retry, degrade, disable, recover, alert |

## Data Contracts

| Object | Meaning |
| --- | --- |
| `SourceProfile` | Governed source identity, adapter, trust tier, lifecycle, admission policy, selection policy, and health policy. |
| `ProbeSignal` | A signal that a source may contain useful new information for this run. |
| `RawArtifact` | Raw fetched material such as a feed item, HTML page, API item, or video metadata. |
| `Candidate` | Normalized item with title, URL, source, timestamp, snippet, and evidence fields. |
| `EventCluster` | One real-world event represented by one or more candidates. |
| `SelectedStory` | A selected event with rank, slot, reason, coverage, and primary-evidence gate status. |
| `SynthesisDraft` | A generated or shadow-generated title, summary, and impact draft for one selected story. |
| `QAGateResult` | QA pass/block status for one synthesis draft, including model profile, pollution categories, blocked terms, and fail-closed trace. |
| `ApprovalGateResult` | Read-only approval status, blocked reasons, checks, and metrics for one delivery snapshot. |
| `DeliverySnapshotSchemaGateResult` | Side-effect-free schema pass/block status for delivery snapshot fields, story/draft consistency, channels, and idempotency inputs. |
| `PublisherTargetContractResult` | Metadata-only target pass/block status for publisher channels, target fields, and secret-free target descriptors. |
| `PublisherRenderingContractResult` | Side-effect-free render shape pass/block status for Markdown, cache, channel payload, and archive artifacts. |
| `PublisherExecutionGateResult` | Final pre-side-effect dry-run/block status for Publisher execution mode, idempotency, and side-effect budget. |
| `DeliverySnapshot` | Approved publication snapshot consumed by website, Markdown archive, and channels. |
| `HealthSignal` | Machine-readable status emitted by every pipeline module. |

## Source Governance Matrix

Every source should be expressed as data before it is collected:

| Dimension | Examples |
| --- | --- |
| Identity | `id`, `name`, `url`, `language`, `owner` |
| Source type | `official`, `media`, `wechat`, `video`, `builder`, `aggregated_signal`, `manual_seed` |
| Adapter | `rss`, `html`, `wechat_reader`, `youtube_feed`, `bilibili`, `builder_feed`, `aggregator_api` |
| Trust tier | `primary`, `secondary`, `aggregated_signal`, `experimental` |
| Admission policy | freshness window, relevance rules, allowed topics, blocked topics |
| Verification policy | primary URL required, cross-source confirmation, timestamp evidence |
| Selection policy | slot group, max final items, priority, diversity caps |
| Health policy | timeout, retry, circuit breaker, fallback, alert threshold |
| Lifecycle | `experimental`, `active`, `degraded`, `retired` |

Aggregator sources such as AI HOT or AGI HUNT should share the same adapter family:

```text
sourceType = aggregated_signal
adapter = aggregator_api
requiresPrimaryVerification = true
maxFinalItems = small cap
lifecycle = active or experimental
```

## Publishing Boundary

Daily Tech Briefing Site consumes only generated Markdown reports and derived cache files. It should not know how AI HOT, AGI HUNT, WeChat, YouTube, Bilibili, or Builder feeds are collected.

```text
DeliverySnapshot
  -> Markdown report
  -> website cache
  -> public page
  -> reader feedback
  -> feedback digest
  -> health receipt
```

The publishing layer can validate freshness, parseability, cache health, feedback health, and receipt health. It should not own source-selection decisions.

## Migration Plan

| Phase | Goal | Behavior change |
| --- | --- | --- |
| 0 | Freeze the target contract, diagrams, data objects, and golden samples. | None |
| 1 | Introduce `SourceProfile`, `ProbeSignal`, `Candidate`, `EventCluster`, and `DeliverySnapshot` as shadow objects; load the current source manifest without network or publishing side effects. | None |
| 1A | Add the read-only `SourceAdapter` seam and shadow probe / collector flow. | None |
| 1B | Add the read-only normalizer and Candidate Pool shadow flow. | None |
| 1C | Add Event Pool / dedupe shadow flow. | None |
| 1D | Add Selection Policy shadow flow with rank, slot, coverage, and primary-evidence gates. | None |
| 1E | Add Synthesis Contract and QA Gate shadow flow with deterministic drafts and pollution checks. | None |
| 1F | Add Model-Aware QA Policy shadow flow using the 2026-07-08 model matrix, taxonomy, fixtures, and fail-closed trace. | None |
| 1G | Add DeliverySnapshot Approval Gate shadow flow with blocked reasons, checks, and readiness metrics. | None |
| 1H | Add Delivery Snapshot Schema Gate before Publisher with fail-closed required-field, count, channel, and idempotency checks. | None |
| 1I | Add Publisher Target Resolver / Channel Contract with metadata-only target checks and missing-target fail-closed behavior. | None |
| 1J | Add Publisher Rendering Contract Shadow with artifact shape schemas and no write/send/content-payload behavior. | None |
| 1K | Add Publisher Execution Gate Shadow with explicit dry-run/execute policy, idempotency validation, and zero side-effect budget. | None |
| 2 | Extract RSS/HTML, WeChat, Video, Builder, Aggregator, and ManualSeed adapters behind the seam. | Medium |
| 3 | Replace the V10 ranking, slot allocation, coverage, and fallback path with the selection policy engine after parity evidence exists. | Medium |
| 4 | Replace the V10 summary and impact generation path with the synthesis and QA gates after parity evidence exists. | Low, preserves fail-closed output quality |
| 5 | Move retry, degrade, disable, recover, and alert behavior into a healing controller. | Medium |
| 6 | Archive or remove stale collector versions and stale operator docs. | Operational cleanup |

## Review Checklist

- Can a new source be added by editing the source matrix and choosing an adapter?
- Does an aggregator source require primary evidence before final publication?
- Can the website render a snapshot without knowing collector internals?
- Does model output pass the QA gate before persistence and publication?
- Are source health, production health, and publishing health separate signals?
- Does each new module increase locality and leverage, rather than becoming a pass-through?
