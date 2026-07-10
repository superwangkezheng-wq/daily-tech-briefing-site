# Controlled Collector Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-deny, injected, centrally validated Controlled Collector Runner seam without registering any real WeChat or Bilibili runner or changing production behavior.

**Architecture:** Controlled profiles leave the native adapter path immediately after Collector Execution Policy classification. A new deep module owns bounded request construction, exact-key runner lookup, exception isolation, envelope validation, and normalized results; Live Collector only appends accepted output and audit counters. Live Artifact Fidelity and Healing Controller receive explicit controlled-runner health classes while remaining read-only and decision-only.

**Tech Stack:** Python 3 standard library (`dataclasses`, `typing`), `unittest`, existing OpenClaw shadow pipeline contracts, CodeRabbit CLI, Markdown documentation.

## Global Constraints

- The default and work OpenClaw instances remain shadow/read-only.
- No real WeChat discovery, WeChat mirror, or Bilibili runner is implemented or registered.
- `subprocess_allowed`, `browser_allowed`, `cache_write_allowed`, `file_write_allowed`, and `channel_send_allowed` remain false.
- The runner receives no publisher, cache, filesystem, browser, subprocess, or channel object.
- Native adapters and V10 production behavior remain unchanged.
- V10 stays active; no LaunchAgent, schedule, production manifest, publisher, traffic switch, or legacy shutdown changes are permitted.
- The OpenClaw repositories contain unrelated dirty and untracked state. Do not stage or commit OpenClaw code; use red/green tests and hashes as code checkpoints. Commit only the public documentation repository files at the final task.
- Every behavior change follows one-test-at-a-time red-green TDD.
- CodeRabbit must complete with 0 unresolved issues before the milestone is sealed.

---

## File Map

- Create `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/controlled_collector_runner.py`: runner request/budget/envelope contracts, registry dispatch, validation, and normalized result.
- Modify `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_collector_evidence.py`: route controlled profiles to the runner seam and expose runner trace counters.
- Modify `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_artifact_fidelity.py`: classify controlled-runner health reasons.
- Modify `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/healing_controller.py`: create decision-only controlled-runner responses.
- Modify `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/__init__.py`: export the new public runner contracts.
- Modify `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py`: fake-runner and adversarial behavior tests through public interfaces.
- Mechanically synchronize the same files into `/Users/REDACTED/.openclaw-work/workspace/` after default-instance verification.
- Modify public docs, package version, and Obsidian only after code review and both-instance verification.

---

### Task 1: Missing-Runner Fail-Closed Dispatch

**Files:**
- Create: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/controlled_collector_runner.py`
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_collector_evidence.py:255-373`
- Test: `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py:4460`

**Interfaces:**
- Consumes: `SourceProfile`, allowed Collector Execution Policy dictionaries, and `Mapping[str, ControlledCollectorRunner]`.
- Produces: `dispatch_controlled_collector(profile, execution_policy, live_policy, runners) -> ControlledCollectorDispatchResult`.

- [ ] **Step 1: Write the failing public-interface test**

Add a test that explicitly enables and allows `wechat_discovery`, passes no runner mapping, and asserts that it never calls native transport or reports a native adapter error:

```python
def test_live_collector_allowed_controlled_source_requires_registered_runner(self) -> None:
    profile = SourceProfile(
        id="wechatDiscoverySources:runner-missing",
        name="WeChat Runner Missing",
        source_family="wechatDiscoverySources",
        source_type="wechat",
        adapter="wechat_discovery",
        trust_tier="secondary",
        enabled=True,
        lifecycle="active",
        requires_primary_verification=False,
        url="",
    )
    transport = FakeLiveCollectorTransport("transport must not be used")

    evidence = build_live_collector_evidence(
        [profile],
        policy={
            "enabled": True,
            "networkEnabled": True,
            "maxSources": 1,
            "allowedAdapters": ["wechat_discovery"],
            "controlledExecutionEnabled": True,
            "allowedControlledAdapters": ["wechat_discovery"],
        },
        transport=transport,
    )

    self.assertEqual(evidence["result"], "blocked")
    self.assertEqual(transport.call_count, 0)
    self.assertEqual(evidence["fetch_results"][0]["reason"], "controlled_runner_unavailable")
    self.assertNotEqual(evidence["fetch_results"][0]["reason"], "live_adapter_not_supported")
    self.assertEqual(evidence["trace"]["controlled_runner_unavailable_count"], 1)
    self.assertEqual(evidence["trace"]["controlled_runner_registry"], [])
```

- [ ] **Step 2: Run the single test and verify RED**

Run:

```bash
python3 -m unittest scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_live_collector_allowed_controlled_source_requires_registered_runner
```

Expected: FAIL because controlled sources currently fall through to `live_adapter_not_supported` and the runner trace fields do not exist.

- [ ] **Step 3: Add minimal runner contracts and missing-runner result**

Create the new module with these exact public types:

```python
@dataclass(frozen=True)
class ControlledExecutionBudget:
    timeout_seconds: int
    max_response_bytes: int
    max_candidates: int
    network_allowed: bool
    subprocess_allowed: bool = False
    browser_allowed: bool = False
    cache_write_allowed: bool = False
    file_write_allowed: bool = False
    channel_send_allowed: bool = False


@dataclass(frozen=True)
class ControlledCollectorRequest:
    profile: SourceProfile
    controlled_key: str
    budget: ControlledExecutionBudget


@dataclass(frozen=True)
class ControlledCollectorEnvelope:
    runner_id: str
    controlled_key: str
    raw_artifact: dict[str, Any] | None
    candidate: dict[str, Any] | None
    fetch_result: dict[str, Any]
    trace: dict[str, Any]


class ControlledCollectorRunner(Protocol):
    def run(self, request: ControlledCollectorRequest) -> ControlledCollectorEnvelope:
        ...


@dataclass(frozen=True)
class ControlledCollectorDispatchResult:
    result: str
    raw_artifact: dict[str, Any] | None
    candidate: dict[str, Any] | None
    fetch_result: dict[str, Any]
    runner_id: str = ""
    violation_codes: tuple[str, ...] = ()
```

Implement `dispatch_controlled_collector` so an absent exact controlled key returns `result="runner_unavailable"`, no artifact/candidate, and reason `controlled_runner_unavailable`.

- [ ] **Step 4: Route controlled profiles before native adapter lookup**

Add an optional keyword parameter:

```python
controlled_runners: Mapping[str, ControlledCollectorRunner] | None = None,
```

In the profile loop, after policy denial handling and before `adapter_registry.get(profile.adapter)`, dispatch every profile with `requires_controlled_execution=True`. Append the normalized fetch result, increment `controlled_runner_unavailable_count`, and `continue` so native adapter lookup is impossible.

Add empty/default values for these trace fields in both normal and blocked results:

```python
"controlled_runner_registry": sorted(active_controlled_runners),
"controlled_runner_unavailable_count": controlled_runner_unavailable_count,
"controlled_runner_failure_count": controlled_runner_failure_count,
"controlled_runner_contract_violation_count": controlled_runner_contract_violation_count,
```

- [ ] **Step 5: Run the single test and existing controlled-block tests**

Run:

```bash
python3 -m unittest \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_live_collector_allowed_controlled_source_requires_registered_runner \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_live_collector_blocks_wechat_discovery_as_controlled_execution_without_network \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_live_collector_blocks_bilibili_video_as_controlled_execution_before_transport
```

Expected: 3 tests pass; denied sources still stop before runner lookup and the newly allowed source reports runner unavailable.

- [ ] **Step 6: Record checkpoint**

Run `git status --short` in the default OpenClaw workspace and confirm only the known dirty state plus the new shadow module/test edits are present. Do not stage or commit.

---

### Task 2: Valid Fake-Runner Acceptance

**Files:**
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/controlled_collector_runner.py`
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_collector_evidence.py:287-343`
- Test: `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py:208,4460`

**Interfaces:**
- Consumes: Task 1 `ControlledCollectorRequest`, `ControlledCollectorEnvelope`, and dispatch result.
- Produces: accepted hash-only artifact and candidate normalized to the existing Live Collector contract.

- [ ] **Step 1: Add a reusable fake runner and failing success-path test**

```python
class FakeControlledCollectorRunner:
    def __init__(self, envelope: ControlledCollectorEnvelope) -> None:
        self.envelope = envelope
        self.call_count = 0
        self.last_request = None

    def run(self, request: ControlledCollectorRequest) -> ControlledCollectorEnvelope:
        self.call_count += 1
        self.last_request = request
        return self.envelope
```

The test envelope must contain one artifact with `body_sha256="a" * 64`, one title/URL candidate, a 200 fetch result, `observed_response_bytes=256`, and every forbidden trace flag false. Assert:

```python
self.assertEqual(evidence["result"], "passed")
self.assertEqual(runner.call_count, 1)
self.assertEqual(runner.last_request.controlled_key, "wechat_discovery")
self.assertEqual(runner.last_request.budget.timeout_seconds, 8)
self.assertEqual(runner.last_request.budget.max_response_bytes, 524288)
self.assertEqual(evidence["raw_artifact_count"], 1)
self.assertEqual(evidence["candidate_count"], 1)
self.assertEqual(evidence["raw_artifacts"][0]["payload"]["adapter_contract"], "live_collector_adapter")
self.assertEqual(evidence["raw_artifacts"][0]["payload"]["execution_contract"], "controlled_collector_runner")
self.assertEqual(evidence["candidates"][0]["evidence"]["runner_id"], "fake_wechat_runner")
```

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because Task 1 only implements missing-runner dispatch.

- [ ] **Step 3: Build bounded request and normalize valid output**

Implement budget parsing with defaults and bounds from the design. Invoke the exact-key runner. Validate the minimal success shape, then copy accepted dictionaries before stamping:

```python
artifact["payload"]["adapter_contract"] = "live_collector_adapter"
artifact["payload"]["execution_contract"] = "controlled_collector_runner"
artifact["payload"]["runner_id"] = envelope.runner_id
candidate["evidence"]["adapter_contract"] = "live_collector_adapter"
candidate["evidence"]["execution_contract"] = "controlled_collector_runner"
candidate["evidence"]["runner_id"] = envelope.runner_id
```

Do not mutate the fake runner's envelope in place.

- [ ] **Step 4: Run the success-path test and Live Artifact Fidelity on its output**

Expected: the collector and fidelity both pass, with one artifact hash, no body leak, one candidate, and no source-health issue.

- [ ] **Step 5: Record checkpoint**

Run the new test plus all `builder_podcast`, `manual_seed`, and YouTube live adapter tests to prove the native path did not change. Do not commit OpenClaw code.

---

### Task 3: Adversarial Envelope Validation

**Files:**
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/controlled_collector_runner.py`
- Test: `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py:4460`

**Interfaces:**
- Consumes: Task 2 accepted envelope path.
- Produces: `controlled_runner_contract_violation` with non-sensitive `violation_codes` and no copied runner payload.

- [ ] **Step 1: Add controlled-key mismatch test, run RED, implement, run GREEN**

Use envelope `controlled_key="video:bilibili"` for a `wechat_discovery` request. Expect violation code `controlled_key_mismatch`, zero artifacts/candidates, and runner output absent from evidence.

- [ ] **Step 2: Add source-ID mismatch test, run RED, implement, run GREEN**

Set artifact, candidate, or fetch-result `source_id` to another source. Expect `source_id_mismatch` and complete envelope rejection.

- [ ] **Step 3: Add raw-body leakage test, run RED, implement, run GREEN**

Put a sentinel secret in `raw_artifact["payload"]["transcript"]`. Assert `raw_payload_forbidden` and confirm the sentinel is absent from `json.dumps(evidence)`.

- [ ] **Step 4: Add forbidden side-effect test, run RED, implement, run GREEN**

Set each of `subprocess_used`, `browser_used`, `cache_written`, `file_written`, `channel_sent`, `published`, and `production_switched` to true using subtests. Expect `forbidden_side_effect_reported` for every case.

- [ ] **Step 5: Add response budget test, run RED, implement, run GREEN**

Set policy `controlledRunnerMaxResponseBytes=1024` and envelope `observed_response_bytes=1025`. Expect `response_budget_exceeded` and no accepted output.

- [ ] **Step 6: Complete shape validation**

Add and verify these exact codes without returning rejected payloads:

```python
runner_id_missing
artifact_hash_missing
candidate_title_missing
candidate_url_missing
network_not_allowed
```

Use a deterministic `_unique` order so audit output is stable.

- [ ] **Step 7: Run all adversarial tests together**

Expected: every malicious envelope is blocked, no sentinel data leaks, and the valid fake runner still passes.

---

### Task 4: Runner Exception Isolation and Mixed-Path Continuity

**Files:**
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/controlled_collector_runner.py`
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_collector_evidence.py:287-343`
- Test: `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py:4460`

**Interfaces:**
- Consumes: injected runner registry and existing native adapter registry.
- Produces: isolated `controlled_runner_error:<ExceptionType>` plus continued processing of later profiles.

- [ ] **Step 1: Write a failing mixed-source test**

Use a raising `wechat_discovery` fake runner followed by a valid RSS profile and fake transport. Set `maxSources=2` and `minCandidates=1`. Assert:

```python
self.assertEqual(evidence["result"], "passed")
self.assertEqual(evidence["candidate_count"], 1)
self.assertEqual(evidence["fetch_results"][0]["reason"], "controlled_runner_error:RuntimeError")
self.assertEqual(evidence["fetch_results"][1]["reason"], "live_candidate_built")
self.assertEqual(evidence["trace"]["controlled_runner_failure_count"], 1)
self.assertEqual(transport.call_count, 1)
```

- [ ] **Step 2: Run the test and verify RED**

Expected: runner exception escapes or is not classified.

- [ ] **Step 3: Catch runner exceptions inside the controlled dispatcher**

Return no artifact/candidate and a sanitized fetch result. Include only the exception class, never the exception message or runner payload.

- [ ] **Step 4: Run the mixed-source test and existing native exception test**

Expected: both pass; one source failure never aborts the canary.

---

### Task 5: Health Evidence and Decision-Only Healing

**Files:**
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/live_artifact_fidelity.py:187-237`
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/healing_controller.py:1-102`
- Test: `/Users/REDACTED/.openclaw/workspace/scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Consumes: controlled-runner fetch reasons from Tasks 1-4.
- Produces: three new source-health counters and non-executing healing decisions.

- [ ] **Step 1: Add failing fidelity classification tests**

Verify exact mappings:

```python
"controlled_runner_unavailable" -> "controlled_runner_unavailable"
"controlled_runner_error:RuntimeError" -> "controlled_runner_failure"
"controlled_runner_contract_violation" -> "controlled_runner_contract_violation"
```

Each class must increment its own summary counter and must not increment `network_failure` or `unsupported_adapter`.

- [ ] **Step 2: Implement the health classes and recommended actions**

Use:

```python
controlled_runner_unavailable -> register_controlled_runner
controlled_runner_failure -> repair_controlled_runner
controlled_runner_contract_violation -> keep_controlled_runner_disabled
```

- [ ] **Step 3: Add failing Healing Controller test**

Build a flow state containing all four controlled health counters, including existing `controlled_execution_blocked`. Expect decision-only actions:

```python
keep_controlled_source_blocked
require_controlled_runner_registration
require_controlled_runner_repair
keep_controlled_runner_disabled
alert_operator_review
```

Assert `execute=false` on every decision and all action flags remain false.

- [ ] **Step 4: Implement Healing signal plumbing and decisions**

Add all controlled counters to `_signals()["source_health"]`. Do not add execution code, retry loops, registry mutation, source disabling, or alert sending.

- [ ] **Step 5: Run fidelity and healing tests**

Expected: new tests pass and existing source-health decisions remain unchanged.

---

### Task 6: Public Exports, Dual-Instance Verification, Review, and Seal

**Files:**
- Modify: `/Users/REDACTED/.openclaw/workspace/scripts/openclaw_intelligence_pipeline/__init__.py`
- Synchronize: the five changed pipeline files and test file into `/Users/REDACTED/.openclaw-work/workspace/`
- Modify: `/Users/REDACTED/Documents/每日科技信息/CHANGELOG.md`
- Modify: `/Users/REDACTED/Documents/每日科技信息/docs/openclaw-intelligence-pipeline-architecture.md`
- Modify: `/Users/REDACTED/Documents/每日科技信息/docs/openclaw-collector-pipeline.md`
- Modify: `/Users/REDACTED/Documents/每日科技信息/package.json`
- Modify: `/Users/REDACTED/REDACTED-WORKDIR/工作/OpenClaw建设思路/定时资讯采集&网页推送/2026-07-08-OpenClaw-Intelligence-Pipeline架构固化记录.md`

**Interfaces:**
- Consumes: all completed runner contracts and evidence.
- Produces: synchronized `v1.2.63` shadow milestone with review and audit evidence.

- [ ] **Step 1: Export public contracts**

Export these names from `__init__.py`:

```python
ControlledCollectorDispatchResult
ControlledCollectorEnvelope
ControlledCollectorRequest
ControlledCollectorRunner
ControlledExecutionBudget
dispatch_controlled_collector
```

- [ ] **Step 2: Run complete default-instance verification**

```bash
python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py
python3 -m compileall -q scripts/openclaw_intelligence_pipeline scripts/test_openclaw_intelligence_pipeline.py
```

Expected: all tests pass and compile exits 0.

- [ ] **Step 3: Run scoped CodeRabbit review**

Verify CLI/auth, then run:

```bash
coderabbit review --agent -t uncommitted --dir scripts
```

Wait up to the required review window. Fix every valid issue using red-green tests, rerun the full suite, and repeat review until CodeRabbit raises 0 issues. Do not substitute a manual review if CodeRabbit fails or rate-limits; wait and retry as previously agreed.

- [ ] **Step 4: Mechanically synchronize reviewed files**

Copy only:

```text
controlled_collector_runner.py
live_collector_evidence.py
live_artifact_fidelity.py
healing_controller.py
__init__.py
test_openclaw_intelligence_pipeline.py
```

Do not copy caches, runtime state, manifests, V10 files, or unrelated dirty files.

- [ ] **Step 5: Verify the work instance and file equality**

Run the same complete tests and compile command in `/Users/REDACTED/.openclaw-work/workspace`. Use `shasum` to prove each synchronized file matches its default-instance counterpart.

- [ ] **Step 6: Update milestone documentation**

Bump the public package from `1.2.62` to `1.2.63`. Record interface behavior, adversarial tests, health/healing classes, CodeRabbit result, both-instance test counts, and explicit no-production boundaries in public docs and Obsidian.

- [ ] **Step 7: Verify and commit public documentation**

```bash
npm run check
git diff --check
git status --short
git add CHANGELOG.md docs/openclaw-collector-pipeline.md docs/openclaw-intelligence-pipeline-architecture.md package.json
git commit -m "docs: record controlled collector runner seam"
git push
```

Expected: public checks pass, only intended files are committed, push succeeds, and the public repository is clean.

- [ ] **Step 8: Final production-safety assertion**

Confirm from evidence that no real controlled runner was registered, no subprocess/browser/cache/file/channel/publish/production-switch side effect ran, V10 remains active, and formal production cutover remains disabled.
