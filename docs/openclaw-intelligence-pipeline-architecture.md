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
  -> Publisher
```

The goal is not to add more branches for individual sources. The goal is to move source identity, fetch adapters, admission policy, selection policy, verification, and health behavior into explicit interfaces.

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
| QA Gate | generated fields to approved output | pollution detection, truncation checks, schema checks, deterministic fallback |
| Publisher | `DeliverySnapshot` to output surfaces | Markdown report, cache, channel message, archive |
| Healing Controller | health signals to actions | retry, degrade, disable, recover, alert |

## Data Contracts

| Object | Meaning |
| --- | --- |
| `SourceProfile` | Governed source identity, adapter, trust tier, lifecycle, admission policy, selection policy, and health policy. |
| `ProbeSignal` | A signal that a source may contain useful new information for this run. |
| `RawArtifact` | Raw fetched material such as a feed item, HTML page, API item, or video metadata. |
| `Candidate` | Normalized item with title, URL, source, timestamp, snippet, and evidence fields. |
| `EventCluster` | One real-world event represented by one or more candidates. |
| `SelectedStory` | A selected event with rank, slot, reason, and evidence. |
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
| 1 | Introduce `SourceProfile`, `ProbeSignal`, `Candidate`, `EventCluster`, and `DeliverySnapshot` as shadow objects. | None |
| 2 | Extract RSS/HTML, WeChat, Video, Builder, Aggregator, and ManualSeed adapters behind a real seam. | Low |
| 3 | Add Raw, Candidate, and Event pools. | Medium, improves dedupe |
| 4 | Move ranking, slot allocation, coverage, and fallback into a selection policy engine. | Medium |
| 5 | Keep summary and impact generation behind the synthesis and QA gates. | Low, preserves fail-closed output quality |
| 6 | Move retry, degrade, disable, recover, and alert behavior into a healing controller. | Medium |
| 7 | Archive or remove stale collector versions and stale operator docs. | Operational cleanup |

## Review Checklist

- Can a new source be added by editing the source matrix and choosing an adapter?
- Does an aggregator source require primary evidence before final publication?
- Can the website render a snapshot without knowing collector internals?
- Does model output pass the QA gate before persistence and publication?
- Are source health, production health, and publishing health separate signals?
- Does each new module increase locality and leverage, rather than becoming a pass-through?
