# Controlled Collector Runner Design

Date: 2026-07-10

Status: Approved for implementation

## Context

The OpenClaw Intelligence Pipeline currently separates native read-only collection from sources that require controlled execution. Native adapters use bounded in-process HTTP or configuration reads. WeChat discovery/mirror and Bilibili remain controlled and default-blocked.

The current Collector Execution Policy can explicitly allow a controlled key, but the Live Collector then falls through to the native adapter registry. When no native adapter exists, the result becomes `live_adapter_not_supported`. That loses the distinction between an unsupported native adapter and a controlled source whose runner has not been registered.

This design adds a dedicated runner seam. It does not add a real WeChat or Bilibili runner and does not enable production collection.

## Goals

- Route controlled sources through a distinct, auditable interface.
- Keep controlled execution default-deny and explicitly registered by controlled key.
- Bound time, response size, and candidate count before invoking a runner.
- Validate every runner result before it can enter RawArtifact, Candidate, Fidelity, or Healing modules.
- Classify missing runners, runner failures, and contract violations separately from network failures and unsupported native adapters.
- Preserve the existing native adapter path unchanged.
- Keep both OpenClaw instances in shadow/read-only mode with V10 still active.

## Non-Goals

- Implementing or installing real WeChat discovery, WeChat mirror, or Bilibili runners.
- Allowing subprocess, browser, cache write, file write, channel send, publish, or production-switch side effects.
- Changing Source Registry, selection, synthesis, QA, publisher, or V10 production behavior.
- Adding automatic retries, source disabling, or self-healing execution.
- Storing remote response bodies, HTML, transcripts, or secrets in evidence.

## Approaches Considered

### Extend LiveCollectorAdapter

This would add execution flags and runner-specific behavior to the existing native adapter interface. It is rejected because callers would need to understand two execution classes through one interface, reducing locality and making authorization easy to bypass accidentally.

### Add source-specific execution branches

This would implement separate WeChat and Bilibili branches inside Live Collector. It is rejected because budgets, registration, result validation, failure classification, and side-effect auditing would be duplicated.

### Add a ControlledCollectorRunner seam

This is the selected approach. One deep module owns request construction, runner lookup, bounded execution, result validation, and controlled-runner failure semantics. Live Collector sees one result interface, while source-specific implementations remain adapters behind the runner seam.

## Module Design

Add `controlled_collector_runner.py` with these public interfaces.

### ControlledExecutionBudget

A frozen data object containing:

- `timeout_seconds`: default 8, bounded to 1-30.
- `max_response_bytes`: default 524288, bounded to 1024-1048576.
- `max_candidates`: fixed at 1 in this phase because the Live Collector interface accepts at most one candidate per source.
- `network_allowed`: true only when the existing live canary network gate is enabled.
- `subprocess_allowed`: false in this phase.
- `browser_allowed`: false in this phase.
- `cache_write_allowed`: false in this phase.
- `file_write_allowed`: false in this phase.
- `channel_send_allowed`: false in this phase.

### ControlledCollectorRequest

A frozen data object containing:

- `profile`: the selected `SourceProfile`.
- `controlled_key`: the exact key returned by Collector Execution Policy.
- `budget`: the bounded `ControlledExecutionBudget`.

The runner receives no publisher, cache, filesystem, browser, subprocess, or channel object.

### ControlledCollectorEnvelope

A data object returned by a runner containing:

- `runner_id`: non-empty runner identity.
- `controlled_key`: must match the request.
- `raw_artifact`: zero or one artifact-shaped dictionary.
- `candidate`: zero or one candidate-shaped dictionary.
- `fetch_result`: source-level status and reason.
- `trace`: observed response bytes and side-effect evidence.

The envelope is untrusted until validated.

### ControlledCollectorRunner

A protocol with one method:

```python
def run(self, request: ControlledCollectorRequest) -> ControlledCollectorEnvelope:
    ...
```

The registry is an injected mapping from exact controlled key to runner. No global discovery, dynamic import, command lookup, or PATH lookup is permitted.

This Python interface is not an operating-system sandbox. It prevents accidental capability plumbing and validates observable output, but a runner implementation could still perform hidden side effects if it were allowed to execute arbitrary code. Therefore no real runner may be registered in this phase. A future real runner requires a separately approved capability-constrained execution design that can enforce, rather than merely report, subprocess, browser, filesystem, cache, and channel permissions.

### dispatch_controlled_collector

The deep module entrypoint accepts a profile, an allowed Collector Execution Policy decision, the live policy, and the injected runner registry. It returns a normalized dispatch result that Live Collector can append without learning runner internals.

## Dispatch Flow

1. Live Collector evaluates Collector Execution Policy.
2. Native profiles continue to the existing native adapter registry.
3. Controlled profiles that are not allowed return `collector_controlled_execution_disabled` before runner lookup.
4. Allowed controlled profiles are routed to `dispatch_controlled_collector`.
5. A missing exact-key runner returns `controlled_runner_unavailable` without invoking transport or native adapters.
6. The dispatcher constructs a bounded request and invokes the injected runner.
7. Runner exceptions become `controlled_runner_error:<ExceptionType>` and are isolated to that source.
8. The returned envelope passes central validation.
9. Valid artifacts and candidates enter the existing Live Artifact Fidelity path.
10. Invalid output is discarded and reported as `controlled_runner_contract_violation`.

## Envelope Validation

Validation must reject the complete envelope when any rule fails:

- `runner_id` is blank.
- Envelope `controlled_key` differs from the request.
- Artifact, candidate, or fetch-result `source_id` differs from the profile.
- Observed response bytes exceed the request budget.
- More than one artifact or candidate is represented; this phase permits at most one of each.
- Artifact payload or candidate evidence contains forbidden raw-body fields such as `body`, `raw_body`, `html`, or `transcript`.
- Trace reports subprocess, browser, cache write, file write, channel send, publish, or production-switch activity.
- Trace reports network use when `network_allowed` is false.
- Artifact hash is missing when an artifact is returned.
- Candidate lacks title or URL when a candidate is returned.

Validation errors are recorded as reason codes, but rejected runner payloads are not copied into Live Collector evidence.

## Result and Health Classification

| Runner state | Fetch reason | Source-health class | Healing decision |
|---|---|---|---|
| Controlled execution disabled | `collector_controlled_execution_disabled` | `controlled_execution_blocked` | Keep controlled source blocked |
| Allowed, runner missing | `controlled_runner_unavailable` | `controlled_runner_unavailable` | Require runner registration |
| Runner raised | `controlled_runner_error:*` | `controlled_runner_failure` | Require runner repair; no retry execution |
| Envelope rejected | `controlled_runner_contract_violation` | `controlled_runner_contract_violation` | Keep runner disabled and alert operator |
| Envelope valid | Runner success reason | Existing health rules | Existing decision-only behavior |

Healing Controller remains decision-only. Every generated action has `execute=false`; no retry, registration, disable, or alert operation is performed.

## Live Collector Integration

`build_live_collector_evidence` gains an optional injected `controlled_runners` mapping. The default is empty.

Trace adds:

- `controlled_runner_registry`
- `controlled_runner_unavailable_count`
- `controlled_runner_failure_count`
- `controlled_runner_contract_violation_count`

Existing native adapter trace fields and behavior remain unchanged. The existing transport is not passed to a controlled runner.

## Test Strategy

Tests use fake in-memory runners only.

1. A default-blocked WeChat source never looks up or calls a runner.
2. An explicitly allowed source with no runner returns `controlled_runner_unavailable` and never falls through to the native registry.
3. A valid fake runner can return one hash-only artifact and one candidate through the public Live Collector interface.
4. Controlled-key mismatch is rejected.
5. Source-ID mismatch is rejected.
6. Raw-body or transcript leakage is rejected without echoing leaked data.
7. Any forbidden side-effect trace is rejected.
8. Response-byte budget overflow is rejected.
9. A runner exception is isolated while another native source can still succeed.
10. Existing default-block tests, native adapter tests, fidelity tests, and healing tests remain green.

Verification requires full unit tests and compile checks in both OpenClaw instances, hash equality for synchronized files, adversarial runner fixtures, and a scoped CodeRabbit review with all valid issues resolved.

## Rollout and Safety

- Phase A: land the seam, fake-runner tests, health classes, and decision-only Healing mappings.
- Phase B: run shadow tests only. No real controlled runner is registered.
- Phase C: design a source-specific runner separately, beginning with its external contract and adversarial fixtures.
- Phase C must also define a capability-constrained executor; self-reported trace flags are insufficient evidence for real execution.
- Formal production activation remains a later explicit decision requiring real-source parity evidence, approval gates, and rollback readiness.

V10 stays active throughout these phases. No production manifest, LaunchAgent, schedule, publisher, or traffic switch changes are part of this design.

## Acceptance Criteria

- Controlled sources can never fall through to native adapter dispatch after being classified as controlled.
- Empty runner registry is safe and produces a distinct auditable result.
- All runner outputs are treated as untrusted and centrally validated.
- Native adapter behavior and existing canaries do not regress.
- Both OpenClaw instances pass the complete suite and compilation checks.
- CodeRabbit raises 0 unresolved issues.
- Production writing, publishing, and V10 cutover remain disabled.
