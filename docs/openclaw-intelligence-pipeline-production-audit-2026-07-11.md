# OpenClaw Intelligence Pipeline Production Audit (2026-07-11)

## Verdict

The rebuilt pipeline is a strong, tested shadow architecture and safety-control
foundation. It is not yet a production replacement for V10. No production
switch, real-source canary, channel send, site refresh, archive write, or V10
shutdown is authorized by this audit.

"Implemented" below means a continuous path from real input through real
effect, with bounded failure handling and an actual production entrypoint. A
module that only has contracts, fixtures, dry-runs, or metadata is correctly
classified as shadow rather than production-ready.

## Original 11-Layer Traceability

| Layer | Actual implementation | Status | Production gap |
| --- | --- | --- | --- |
| Source Registry | `source_manifest.py` loads governed `SourceProfile` records from the V10 manifest. | Shadow/contract | V10 still constructs and consumes its own source configuration; there is no single production registry owner. |
| Probe Engine | `adapters.py` and `pipeline.py` build deterministic `ProbeSignal` records. | Shadow | No historical health input, scheduling policy, or real probe feedback loop drives collection. |
| Collector Engine | `live_collector_evidence.py` has adapter contracts; `real_profile_runtime.py` has one gated OpenAI RSS canary. | Partial canary | The source matrix is not executed through the new path. One RSS profile cannot validate the full source universe. |
| Normalizer | `normalizer.py` creates governed candidates. | Shadow | It consumes simulated `RawArtifact` records, not the production collector stream. |
| Evidence Verifier | `evidence_verifier.py` applies primary-evidence gates. | Shadow/contract | It is not continuously fed by real collector output before production selection. |
| Event Pool | `event_pool.py` clusters candidates. | Shadow | Candidate input is synthetic rather than live. |
| Selection Engine | `selection_policy.py` provides slot, rank, coverage, and primary-evidence policies. | Shadow | It does not select V10's real candidate pool or own the scheduled final selection. |
| Synthesis Engine | `synthesis.py` provides model-aware contracts, replays, fallback policy, and QA handoff. | Shadow/controlled fixture | The real provider transport and the selected-story production path are not active. |
| QA Gate | `qa_gate.py` contains the anti-pollution and model-matrix-aware policy. | Shadow | V10 still owns the live summary quality fallback; the new gate is not the production decision point. |
| Publisher | Publisher contracts validate rendering, targets, idempotency, and rollback metadata. | Shadow/contract | No real atomic archive, Feishu, WeChat, or web adapter is called. |
| Healing Controller | `healing_controller.py` produces auditable actions. | Shadow | Actions are advisory only; there is no bounded retry, degrade, disable, alert, or recovery executor. |

## Product Boundaries

| Product function | Current production owner | New-pipeline state | Required completion |
| --- | --- | --- | --- |
| Information collection and deduplication | `scripts/daily_news_v10.py` | Shadow pipeline plus one read-only RSS canary | Make the registry, probes, collector, normalizer, verifier, event pool, and selection a single real data path. |
| Summary and impact generation | V10 plus existing model route | Model matrix, replay, QA, fallback contracts | Introduce a controlled real model adapter behind the existing matrix and make QA the final writer gate. |
| Information publication | V10 writes the daily Markdown/archive and sends configured channels | Metadata-only publisher contracts | Implement idempotent archive/Obsidian, Feishu, and WeChat adapters with receipts and rollback. |
| Website publication | Daily Tech site refresh/cache/API project | `web` is only a target label in the new Publisher | Make the website rebuild, cache validation, and public read-back explicit publisher steps. |
| Health and self-healing | Existing OpenClaw ops jobs | Decision-only healing plan | Connect bounded actions to health signals without source-specific hardcoding. |

The website is therefore not a cosmetic final step. It is a separate delivery
target with its own durable output, cache rebuild, read-back verification, and
rollback requirements.

## Existing Entrypoints

- Legacy collection and publication remain at
  `scripts/daily_news_v10.py`, invoked by `scripts/daily_news_v10_wrapper.sh`
  and `scripts/run_daily_news_v10.sh`.
- The new entrypoint is `openclaw_intelligence_pipeline.shadow_runner`; it
  intentionally sets collection network and publish effects to disabled.
- The site process reads published archive material independently. Its cache
  build and API visibility are not yet called by the new Publisher.

## Release Gates

Before any real-source request, the canary runtime now requires an out-of-tree
release-gate file containing all of:

1. a passing full adversarial and simulation report digest;
2. a passing architecture-audit digest;
3. a passing CodeRabbit review digest.

Without this artifact the runtime returns
`real_profile_release_gate_missing` before it contacts Docker or an external
source. The gate does not replace operating-system security; it prevents
accidental operational activation and requires an auditable approval packet.

## Completion Program

1. Establish a production source registry and probe-state store, then migrate
   source categories through a common collector adapter interface.
2. Connect real `RawArtifact` records through normalization, evidence,
   clustering, selection, model synthesis, and QA without bypassing a layer.
3. Implement real Publisher adapters for archive/Obsidian, Feishu, WeChat,
   website refresh, and website read-back. Each adapter must be idempotent,
   receipt-producing, and rollback-aware.
4. Promote Healing Controller decisions into a bounded execution controller
   with retry budgets, degradation, disablement, alerting, and audit events.
5. Install a new scheduled entrypoint in read-only parallel mode. It must
   compare per-slot results against V10 while V10 remains active.
6. Run full simulation, adversarial tests, dual-instance verification, and
   CodeRabbit. Only then create the release-gate artifact and run one read-only
   real-source canary.
7. Prove no-worse behavior over an agreed window, enable delivery targets in
   controlled stages, and retain V10 as immediate rollback until the new path
   is stable.

## Evidence Recorded This Audit

- Python pipeline suite: 305 passed, 12 explicitly skipped.
- Go tests passed for egress fixture/proxy/worker and real-profile
  proxy/worker.
- A no-fetch local Docker preflight passed after the proxy certificate-root
  startup check; it left no `egress-shadow` or `real-profile-canary` labelled
  container, network, or image.
- This audit found no authorization for production release. CodeRabbit is
  still a required final review gate, not a completed approval.
