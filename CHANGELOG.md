# Changelog

## Unreleased documentation boundary

- References to the external OpenClaw Phase C v1.2.67/v1.2.68 canary in the architecture record are evidence checkpoints, not Daily Tech site releases or production approval. They do not authorize this repository to initiate collection, publish content, or change the existing daily/weekly release gates.

## 1.2.66 - 2026-07-11

- Recorded the completed Phase B controlled-egress policy-proxy as a local, fixture-only shadow prototype. Its two Docker bridges are both internal: the worker is attached only to `worker-internal`, the proxy is dual-homed on `worker-internal` and `proxy-out`, and the fixture is attached only to `proxy-out`. There are no host ports, mounts, devices, privileged mode, custom DNS, `--add-host`, or shell execution.
- The proxy enforces policy/lease-bounded authority access, proxy-owned expected-IP DNS resolution and pinning, request/response/redirect caps, and hash-only receipts/evidence. Direct bypass, replay, denied authority, redirect denial, and oversized-response adversarial cases are covered.
- Public package API exposes only six vetted Phase B contracts: `EgressAuthority`, `EgressLease`, `EgressPolicyProfile`, `EgressRequest`, `ProxyDecisionReceipt`, and `DockerEgressShadowRuntime`.
- CodeRabbit's first review identified five valid hardening issues (finite HTTP timeouts, aliased-testing audit coverage, non-root scratch images, and fixture `HEAD` behavior); all were fixed test-first. The final CodeRabbit review raised 0 findings. Both OpenClaw instances synchronized an explicit 14-file manifest with 14/14 matching SHA-256 values and passed 251 Python tests, Go tests, compilation, no-network builds, formatting/diff checks, and labelled Docker-resource audits.
- This is not production approval: no real source, Internet egress, credential, publisher/channel send, production write, V10 cutover, legacy shutdown, or traffic switch was enabled.

## 1.2.65 - 2026-07-10

- Closed two valid CodeRabbit audit items in the AI HOT provider: a corrupt or truncated cache now repairs itself after the next successful response instead of disabling cache writes, and the intentional `warn` exit-zero policy is documented as a source-level degradation that must not fail the daily-news batch.
- Added a regression test for corrupt-cache replacement and re-ran default/work 198-test suites, compile checks, synchronized-file hashes, and the final scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Preserved Phase A boundaries: the capability executor remains offline and shadow-only, with no real controlled runner, proxy/egress, publisher, production write, traffic switch, V10 cutover, or legacy shutdown.

## 1.2.64 - 2026-07-10

- Added the shadow-only capability-constrained executor: an immutable profile registry validates UTF-8 bounded input, exact profile lookup, fixed commands, fixed environment, and resource limits before Docker is invoked.
- Added Docker image identity gating and a no-shell runtime adapter. It inspects the local image first, then runs the verified immutable image ID with `--pull never`, `--network none`, read-only root, tmpfs-only `/tmp`, dropped capabilities, no-new-privileges, non-root user, no host mounts, and explicit CPU, memory, PID, input, output, and deadline limits.
- Added local static Go `FROM scratch` adversarial probes. Real Docker verification proved successful offline execution, network-dial denial, root-filesystem write denial, timeout cleanup with no remaining container, and output-limit enforcement without raw output in receipts.
- Added hash-only execution receipts and fail-closed reasons for invalid input, profile/image mismatch, unavailable runtime, command failure, timeout, output overflow, and cleanup failure. No probe is registered to `ControlledCollectorRunner`.
- Re-ran default/work 197-test suites, compile checks, and synchronized-file hashes. Final scoped CodeRabbit review raised 0 issues.
- Kept real controlled runners, proxy/egress, publishing, production writes, traffic switching, V10 cutover, and legacy shutdown disabled.

## 1.2.63 - 2026-07-10

- Added the `ControlledCollectorRunner` shadow seam for controlled source keys. Allowed controlled sources now use an injected exact-key runner registry and never fall through to native adapter dispatch.
- Added bounded controlled-runner requests, a POSIX main-thread deadline, runner exception isolation, hash-only result normalization, and centralized contract validation before any runner output can enter the existing artifact/candidate path.
- Added adversarial rejection for invalid envelope types or structures, key/source mismatches, missing runner IDs or artifact hashes, missing candidate title/URL, raw-body leakage anywhere in an envelope, declared side effects, response-budget overflow, and disallowed network use.
- Added distinct source-health and decision-only Healing classes for unavailable runners, runner failures, and runner contract violations; no retry, registration, disable, alert, or side effect is executed.
- Hardened QA Gate after CodeRabbit review: structural-fragment detection trims trailing whitespace, ordinary English `actually`/`wait` prose no longer triggers reasoning-leak false positives, and each draft now uses its own `model_used` profile with the batch profile only as a legacy fallback.
- Re-ran default/work 186-test suites, compile checks, synchronized-file hashes, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Kept all real controlled runners, production writes, publishing, traffic switching, V10 cutover, subprocess/browser/cache/file/channel capabilities, and legacy shutdown disabled.

## 1.2.62 - 2026-07-10

- Added the native read-only `builder_podcast` live adapter for the follow-builders `feed-podcasts.json` aggregate feed.
- Reclassified podcast aggregate collection from `controlled_external` to `native_read_only` after verifying that the adapter needs only bounded HTTP GET and performs no subprocess, browser, cache write, file write, or channel send.
- Separated the stable feed profile from rotating podcast program names: optional manifest `podcastName` filters a program explicitly, while a feed-level profile accepts the first valid current episode.
- Kept transcript bodies out of RawArtifact and Candidate payloads; evidence records only the response hash, episode count, podcast name, and transcript availability.
- Added invalid-payload source-health classification as `content_unparseable` for parser fallback planning.
- Recorded real read-only default/work canaries against the current remote feed: 1 artifact, 1 candidate, fidelity `passed`, all source-health counters zero, and all write/send side effects disabled.
- Re-ran 164 tests in both OpenClaw instances, compile checks, real canaries, and scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Kept formal production launch and V10 cutover disabled; WeChat discovery/mirror and Bilibili remain controlled and default-blocked.

## 1.2.61 - 2026-07-09

- Documented the Collector Execution Policy seam for controlled adapters in the OpenClaw Intelligence Pipeline.
- Added a default-deny execution gate before live adapter dispatch for `wechat_discovery`, `wechat_mirror`, `builder_podcast`, and Bilibili `video` sources.
- Preserved safe native read-only adapters while keeping subprocess, browser, cache writes, file writes, channel sends, and production side effects disabled for controlled sources.
- Recorded real read-only WeChat discovery canary evidence: 3 selected manifest profiles, 3 `collector_controlled_execution_disabled` results, `network_used=false`, 0 artifacts, 0 candidates, and source health classified as `controlled_execution_blocked` rather than `network_failure`.
- Re-ran default/work tests, compile checks, controlled-execution canaries, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Kept formal production launch, real WeChat/Bilibili execution, and V10 cutover disabled.

## 1.2.60 - 2026-07-09

- Documented the `manual_seed` live adapter extraction for the OpenClaw Intelligence Pipeline.
- Added a read-only config-backed adapter for `wechatSeedSources`; it consumes manifest `articles[]`, does not call network transports, and emits hash-only `RawArtifact` plus a first valid article `Candidate`.
- Recorded real read-only manual seed canary evidence: 2 enabled seed sources, 2 raw artifacts, 2 candidates, `network_used=false`, fidelity `passed`, source health all zero, and no write/send side effects.
- Hardened adjacent spine issues found by CodeRabbit: normalizer title/evidence propagation, numeric source caps, AIHot cache/config handling, dynamic selection total cap, all-required primary evidence validation, per-field QA structural checks, synthesis endpoint/header/budget guardrails, approval secret-material detection, and blank V10 reference handling.
- Re-ran default/work tests, compile checks, real read-only manual seed canary, and final scoped CodeRabbit review. CodeRabbit raised 0 issues after the valid findings were fixed; one pipeline-order suggestion was verified invalid and not applied.
- Kept formal production launch and V10 cutover disabled.

## 1.2.59 - 2026-07-09

- Documented the `video` live adapter extraction for the OpenClaw Intelligence Pipeline.
- Added a read-only YouTube official Atom feed path for video sources with manifest `channelId`; the adapter does not invoke `yt-dlp`, browser automation, Bilibili detail scripts, or page discovery.
- Recorded real read-only video canary evidence: 2 YouTube sources, 2 raw artifacts, 2 candidates, 13/15 feed entries observed, fidelity `passed`, source health all zero, and no write/send side effects.
- Hardened live collection so one adapter exception records a source-level `live_collector_error:*` warning and continues the canary instead of aborting the whole run.
- Preserved HTTP error status in source health so HTTP failures are classified as `http_not_ok` instead of false `network_failure`.
- Re-ran default/work tests, compile checks, real read-only video canary, production-code redline scan, and final scoped CodeRabbit review. CodeRabbit raised 0 issues after one finding was fixed.
- Kept formal production launch and V10 cutover disabled.

## 1.2.58 - 2026-07-09

- Documented the `builder_feed` live adapter extraction for the OpenClaw Intelligence Pipeline.
- Added the builder live adapter beside `aggregator_api`, `html`, and `rss`; it consumes the follow-builders `feed-x.json` aggregate feed instead of fetching X profile pages.
- Preserved the V10 builder semantics: profiles absent from the current feed are treated as `builder_feed_candidate_absent` warnings, not source-health failures, while invalid builder feed JSON remains `content_unparseable`.
- Hardened live collector policy parsing by bounding `timeoutSeconds`, `maxSources`, `minCandidates`, and `freshnessWindowHours`, and preserved original byte length metadata alongside response body hashes.
- Recorded real read-only canary evidence: `builder_feed` collector and fidelity both `passed` with 3 sources, 3 raw artifacts, 2 candidates, 0 source-health issues, and no write/send side effects.
- Re-ran default/work tests, compile checks, real read-only builder/aggregator canaries, production-code redline scan, and final scoped CodeRabbit review. CodeRabbit raised 0 issues after two findings were fixed.
- Kept formal production launch and V10 cutover disabled.

## 1.2.57 - 2026-07-09

- Documented the Live Artifact Fidelity source-health evidence split for the OpenClaw Intelligence Pipeline.
- Added `source_health` and `source_health_summary` to live artifact fidelity, distinguishing `network_failure`, `http_not_ok`, `content_unparseable`, `hash_unavailable`, and `unsupported_adapter` instead of leaving failed sources as a flat `artifact_hash_missing` blocker.
- Wired Healing Controller to consume source-health summaries as decision-only plans: network failures map to retry planning, HTTP failures and hash gaps map to source-fidelity degradation, and parse failures map to parser fallback requirements.
- Fixed CodeRabbit-raised live collector issues: urllib redirects are disabled before body reads, fallback feed parsing preserves entity/character references, and normal XML parse failures can fall back to feed/HTML parsing while unsafe `DOCTYPE` / `ENTITY` content remains blocked.
- Recorded the real read-only canary evidence: `aggregator_api` fidelity `passed`; RSS fidelity remained `blocked` with `network_failure=2` and `hash_unavailable=2`; HTML fidelity remained `blocked` because one candidate lacked published-time metadata.
- Re-ran default/work tests, compile checks, production-code redline scan, real read-only aggregator/RSS/HTML canaries, and final scoped CodeRabbit review. CodeRabbit raised 0 issues after the three findings were fixed.
- Kept formal production launch and V10 cutover disabled.

## 1.2.56 - 2026-07-09

- Documented the `aggregator_api` live adapter extraction for the OpenClaw Intelligence Pipeline.
- Added the aggregator live adapter beside `html` and `rss`, using `apiBase/items` when available instead of fetching an aggregator homepage, while keeping hash-only artifacts and primary-evidence candidate output.
- Added Healing Controller decisions for live artifact fidelity blockers: `artifact_hash_missing` now maps to a source-fidelity degrade plan, and `candidate_published_at_missing` maps to a published-time fallback requirement; both remain decision-only and execute nothing.
- Fixed CodeRabbit-raised issues: live collector URL fetching now rejects non-HTTP(S) schemes, and enabled canaries without explicit `maxSources` default to the bounded canary limit instead of selecting zero sources.
- Recorded the real read-only canary evidence: `aggregator_api` passed with 1 source, 1 raw artifact, 1 candidate, 1 artifact hash, 0 raw-body leaks, 1 published candidate, and fidelity `passed`.
- Re-ran default/work tests, compile checks, production-code redline scan, real read-only aggregator/RSS/HTML canaries, and final scoped CodeRabbit review. CodeRabbit raised 0 issues after the two findings were fixed.
- Kept formal production launch and V10 cutover disabled.

## 1.2.55 - 2026-07-09

- Documented the completed HTML/RSS live adapter split for the OpenClaw Intelligence Pipeline.
- Added the `html` live adapter beside the existing `rss` adapter, keeping `build_live_collector_evidence` as the stable read-only canary entrypoint and exposing `trace.adapter_registry=["html","rss"]`.
- Recorded the real RSS canary evidence: 5 sources, 5 raw artifacts, 4 candidates, 4 artifact hashes, 0 raw-body leaks, 4 published candidates, collector `passed`, and fidelity `blocked` by `artifact_hash_missing` for one failed source.
- Recorded the real HTML canary evidence: 3 sources, 3 raw artifacts, 3 candidates, 3 artifact hashes, 0 raw-body leaks, 2 published candidates, collector `passed`, and fidelity `blocked` by `candidate_published_at_missing`.
- Confirmed both canaries stayed read-only: `file_written=false`, `channel_sent=false`, and `side_effects_executed=false`.
- Re-ran default/work tests, compile checks, production-code redline scan, real read-only RSS/HTML canaries, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Kept formal production launch and V10 cutover disabled while the fidelity blockers remain open.

## 1.2.54 - 2026-07-09

- Documented the first Adapter Extraction / Live Artifact Fidelity step for the OpenClaw Intelligence Pipeline.
- Added `LiveArtifactFidelityResult` as a read-only diagnostic over live collector artifacts and candidates, checking artifact hashes, adapter contracts, raw-body leakage, candidate timestamps, and per-adapter counts.
- Moved RSS live canary collection behind a registered live adapter contract, keeping unsupported adapters fail-closed and non-networked.
- Hardened live feed handling after CodeRabbit review: artifact hashes now use raw response bytes or a transport-provided `body_sha256`, remote XML parsing uses `defusedxml` when available, and the fallback feed parser rejects `DOCTYPE` / `ENTITY` payloads without using unsafe XML parsing.
- Recorded the real canary evidence: 5 RSS sources, 5 raw artifacts, 4 candidates, 4 artifact hashes, 0 raw-body leaks, 4 adapter-backed candidates, 3 quality-gate-qualified candidates, replay selected 3 stories, and production cutover remained disabled.
- Captured the remaining fidelity blocker: one failed source still produces `artifact_hash_missing`, so live artifact fidelity remains blocked while collector/replay can still pass in read-only mode.
- Re-ran default/work tests, compile checks, production-code redline scans, real read-only canary, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.

## 1.2.53 - 2026-07-09

- Documented the Live Collector Evidence Gate canary for the OpenClaw Intelligence Pipeline.
- Added `LiveCollectorEvidenceResult` as a read-only live artifact evidence contract, feeding Candidate Quality Gate and Qualified Candidate Replay without publishing or switching production.
- Recorded the real canary evidence: 5 RSS sources probed, 5 raw artifacts, 4 candidates, 3 quality-gate-qualified candidates, replay selected 3 stories, and production cutover remained disabled.
- Fixed the DeliverySnapshot shadow payload so `delivery_snapshot.stories` preserves selected story summaries instead of a count-only placeholder; schema and publisher preflight now derive the count from that payload.
- Fixed CodeRabbit-raised synthesis and selection issues: malformed numeric/Decimal config parsing, explicit boolean parsing, endpoint dry-run validation, post-send network rechecks, secret-resolver trace sanitization, explicit zero slot caps, and zero roundup overflow.
- Re-ran default/work tests, compile checks, production-code redline scans, real read-only canary, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.
- Confirmed no file write, channel send, production switch, traffic shift, or legacy V10 shutdown was performed.

## 1.2.52 - 2026-07-09

- Documented the Candidate Quality Gate Shadow and Qualified Candidate Replay Shadow modules for the OpenClaw Intelligence Pipeline.
- Added `CandidateQualityGateResult` and `QualifiedCandidateReplayResult` as pre-production contracts, keeping production replay and cutover disabled.
- Recorded the current quality-gate result: 96 shadow candidates, 0 qualified candidates, 96 disqualified candidates, no network-used evidence, and all candidates missing published timestamps.
- Added qualified replay over only quality-gate-approved candidates; the current shadow pool replays to 0 selected stories and remains blocked before production cutover.
- Fixed CodeRabbit-raised issues in selection parity, slot-cap enforcement, qualified replay semantics, live synthesis model-call evidence, and HTTP send-shadow network rechecks.
- Re-ran default/work tests, compile checks, redline scans, public package checks, smoke tests, and final scoped CodeRabbit review. CodeRabbit raised 0 issues.

## 1.2.51 - 2026-07-09

- Documented the Slot Candidate Fidelity Diagnostic for the OpenClaw Intelligence Pipeline shadow evaluator.
- Added the `SlotCandidateFidelityResult` contract, snapshot field, and health signal to compare candidates, verified candidates, selected stories, and V10 accepted counts by slot.
- Captured the real 2026-07-09 fidelity output: main news `32/32/10/21`, video `14/14/5/1`, and builder `25/25/5/4` for candidates, verified, selected, and V10 accepted counts.
- Recorded that all 71 core-slot candidates are shadow-only, network-used count is 0, and missing published-at count is 71, moving the next blocker from total-count policy to candidate quality/live-evidence fidelity.
- Re-ran default/work tests, compile checks, real-reference assertions, local redline checks, and public package checks. CodeRabbit remains pending because the free CLI review hit a rate limit.

## 1.2.50 - 2026-07-09

- Documented the Dynamic V10 Selection Policy shadow implementation.
- Added the explicit `v10DynamicSelectionPolicyEnabled` opt-in path for the shadow selector, keeping default selection behavior and production routing unchanged.
- Recorded the dynamic selection formula: video/builder underfill backfills main news, and main news may use up to 6 roundup overflow items.
- Verified the synthetic parity case where 25 main, 1 video, and 4 builder candidates produce the V10-shaped `21/1/4/26` output.
- Captured the real candidate-pool finding: with the dynamic policy temporarily enabled, the current shadow pool produces `16/5/5/26`, so the remaining mismatch is a video/builder candidate fidelity issue rather than a total-count formula issue.
- Re-ran default/work tests, compile checks, local redline checks, and public package checks. CodeRabbit remains pending because the free CLI review hit a rate limit.

## 1.2.49 - 2026-07-09

- Documented the V10 Effective Selection Targets Plan for the OpenClaw Intelligence Pipeline shadow evaluator.
- Added the read-only target plan that explains the real 2026-07-09 V10 section mix as `totalFinalCount=26`, `mainNewsFinalCount=21`, `mainVideoFinalCount=1`, `builderFinalCount=4`, and `roundupOverflowItems=6`.
- Captured the target adjustments: 4 video underfill backfill items, 1 builder underfill backfill item, 5 total main-news backfill items, and 6 roundup overflow items.
- Added a boundary check proving references beyond the 6-item roundup overflow cap remain blocked instead of being treated as safe for cutover.
- Re-ran default/work tests, compile checks, real-reference assertions, local redline checks, public package checks, and smoke tests. CodeRabbit remains pending because the free CLI review hit a rate limit.

## 1.2.48 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline V10 Selection Parity Policy shadow module.
- Added a selection-layer diagnostic contract that compares configured shadow targets, V10 reference section counts, shadow section counts, and section deltas without publishing or changing production state.
- Recorded the real 2026-07-09 V10 gap as a policy problem: V10 reference `techNews=21`, `videoItems=1`, `aiCreators=4`; shadow `techNews=10`, `videoItems=5`, `aiCreators=5`.
- Captured recommended next policy gaps: dynamic total overflow, roundup overflow, video underfill backfill, builder underfill backfill, video overselection guard, and builder overselection guard.
- Re-ran default/work tests, compile checks, real-reference assertions, and redline scans. CodeRabbit follow-up is pending due the free CLI rate limit.

## 1.2.47 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline read-only production environment evidence builder and first real dual-run evaluation.
- Recorded that the evidence builder reads the latest V10 daily-news and daily-acceptance logs without copying log bodies, returning only paths, size, SHA-1 digests, parse results, and safety flags.
- Improved shadow selection and V10 parity diagnostics: Selection now respects configured main/video/builder slot quotas, and V10 parity now compares section counts as well as total story count.
- Captured the first real production comparison: V10 output had 26 stories with section mix `techNews=21`, `videoItems=1`, `aiCreators=4`, while shadow output had 20 stories with `techNews=10`, `videoItems=5`, `aiCreators=5`; production integration remains blocked and no cutover/write/send/traffic shift is allowed.
- Fixed CodeRabbit-raised issues for SourceRegistry duplicate-index consistency, full-log evidence signal scanning without exposing log content, evidence gate semantics, malformed live-synthesis evidence parsing, and provider transport network preflight. Final scoped CodeRabbit review raised 0 issues.

## 1.2.46 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Production Integration Evaluation Shadow module.
- Clarified the dual-run production evaluation model: legacy V10 remains the active production output path while the new pipeline may attach to the real production environment in read-only parallel evaluation.
- Added the safety contract for legacy-active evidence, production-environment read-only evidence, rollback references, no shutdown, no cutover, no traffic shift, no production write, and no channel send.
- Re-ran default/work tests, compile checks, default and full-evidence snapshot assertions, and redline scans. CodeRabbit re-review hit the free CLI rate limit after an earlier 0-issue review and remains queued for retry.

## 1.2.45 - 2026-07-09

- Recorded final CodeRabbit closure for the OpenClaw Intelligence Pipeline shadow release modules.
- Fixed the CodeRabbit-raised live synthesis guardrail parsing issue so explicit zero-valued limits and empty allowlists are preserved instead of replaced by defaults.
- Re-ran default/work tests, compile checks, redline scans, public package checks, and scoped CodeRabbit review; final CodeRabbit review raised 0 issues.

## 1.2.44 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Release Dossier Evidence Archive Shadow module.
- Recorded the stable archive manifest and digest for release dossiers while keeping file writes, production connection, publishing, and traffic shift disabled.
- Re-ran default/work tests, compile checks, archive-manifest assertions, redline scans, and public package checks. CodeRabbit follow-up review remains pending due the free CLI rate limit.

## 1.2.43 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Release Dossier / Operator Approval Packet Shadow module.
- Recorded the operator approval packet that aggregates readiness, regression, publisher execution contract, production switch gate, CodeRabbit evidence status, redlines, and manual approval requirements without enabling production switching.
- Re-ran default/work tests, compile checks, full dry-run approval-packet assertions, redline scans, and public package checks. CodeRabbit follow-up review remains pending due the free CLI rate limit and is recorded as an explicit unresolved review item.

## 1.2.42 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Shadow vs V10 Regression Evaluation Harness.
- Recorded machine-readable no-worse-than-current-production metrics for story-count parity, QA block rate, source mix, slot coverage, duplicate-event rate, and production-disconnected evaluation before production switch assessment.
- Re-ran default/work tests, compile checks, full dry-run regression assertions, redline scans, and public package checks. CodeRabbit initially raised 3 issues in the regression evaluator; all were fixed and locally revalidated, while the follow-up CodeRabbit review is pending due the free CLI rate limit.

## 1.2.41 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Production Entrypoint Switch Gate Shadow module.
- Recorded canary-evaluation readiness that requires live synthesis evidence, current V10 production baseline parity, approved delivery, publisher dry-run readiness, and the real execution contract, while still keeping traffic shift, production connection, and production switch disabled.
- Re-ran default/work tests, compile checks, full dry-run switch-gate assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

## 1.2.40 - 2026-07-09

- Documented the OpenClaw Intelligence Pipeline Publisher Real Execution Contract Shadow module.
- Recorded the side-effect-free dry-run artifact plan, idempotency audit manifest, rollback plan, zero side-effect budget, and explicit baseline readiness proving the shadow output is not worse than the current V10 production reference without connecting to production systems.
- Re-ran default/work tests, compile checks, full dry-run evidence assertions, redline scans, public package checks, and scoped CodeRabbit review; CodeRabbit raised 0 issues.

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
