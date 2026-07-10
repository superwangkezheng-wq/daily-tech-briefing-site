# Capability-Constrained Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a shadow-only Docker executor that runs only registered local offline probes under enforced zero-network, read-only, resource-bounded constraints and returns hash-only receipts.

**Architecture:** Pure capability contracts validate an immutable profile registry before runtime invocation. A Docker adapter resolves a fixed local image ID, constructs an argument array without a shell, executes it with strict container flags, enforces host-side timeout/output/cleanup behavior, and returns a sanitized receipt. A local Go `FROM scratch` probe proves the constraints with real Docker integration tests; it is never registered as a news collector.

**Tech Stack:** Python 3 standard library, `unittest`, Docker 29.2.1, Go 1.26.1 with `CGO_ENABLED=0`, local `FROM scratch` image, CodeRabbit CLI.

## Global Constraints

- Work only in `<openclaw-default-workspace>` and synchronize reviewed files to `<openclaw-work-workspace>` after default verification.
- Do not register a real controlled collector or change `ControlledCollectorRunner` dispatch.
- Every Phase A container uses `--network none`; no direct or proxy egress exists.
- No container may receive host mounts, Docker sockets, inherited container environment, a shell command, privileged mode, capability add, or host networking.
- The runner never chooses an image, command, argument, Docker flag, mount, environment, or resource limit.
- Receipts, traces, tests, and logs are hash-only; raw input/stdout/stderr/container IDs/host paths/secrets are never retained.
- Docker is trusted infrastructure for this phase; a future real egress design requires a separate policy-proxy specification.
- V10, production manifests, schedules, publisher, traffic switches, legacy shutdown, browser, `yt-dlp`, cache, file, and channel actions remain untouched.
- OpenClaw repositories contain unrelated dirty/untracked state. Do not stage or commit OpenClaw code; use red/green tests and file hashes as checkpoints. Commit only public documentation changes.

---

## File Map

- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_executor.py` for immutable capability contracts, validation, and receipt construction.
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/docker_capability_executor.py` for Docker inspection, argument construction, bounded invocation, and cleanup.
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_probe/main.go` for the static adversarial probe.
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_probe/Dockerfile` containing `FROM scratch` and fixed entrypoint.
- Modify: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/__init__.py` to export the new public contracts only after verification.
- Modify: `<openclaw-default-workspace>/scripts/test_openclaw_intelligence_pipeline.py` for unit fakes and real Docker integration tests.
- Synchronize only the above Python files, probe assets, exports, and test file to `<openclaw-work-workspace>`.

---

### Task 1: Pure Capability Contracts and Fail-Closed Registry

**Files:**
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_executor.py`
- Test: `<openclaw-default-workspace>/scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces `CapabilityResourceLimits`, `CapabilityProfile`, `CapabilityExecutionRequest`, `CapabilityExecutionReceipt`, `CapabilityExecutor`, and `validate_capability_request`.

- [x] **Step 1: Write the failing unknown-profile test**

```python
receipt = validate_capability_request(
    CapabilityExecutionRequest(profile_id="unknown", input_bytes=b"{}"),
    profiles={},
)
self.assertEqual(receipt.reason, "capability_profile_unknown")
self.assertFalse(receipt.container_started)
```

- [x] **Step 2: Run the test to verify RED**

```bash
python3 -m unittest scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_capability_request_rejects_unknown_profile
```

Expected: import failure because `capability_executor` does not exist.

- [x] **Step 3: Add minimal immutable contracts**

```python
@dataclass(frozen=True)
class CapabilityResourceLimits:
    timeout_seconds: int
    cpu_count: float
    memory_bytes: int
    pids_limit: int
    input_bytes: int
    output_bytes: int
    tmpfs_bytes: int

@dataclass(frozen=True)
class CapabilityProfile:
    profile_id: str
    image_ref: str
    expected_image_id: str
    command: tuple[str, ...]
    environment: tuple[tuple[str, str], ...]
    limits: CapabilityResourceLimits

@dataclass(frozen=True)
class CapabilityExecutionRequest:
    profile_id: str
    input_bytes: bytes

@dataclass(frozen=True)
class CapabilityExecutionReceipt:
    result: str
    reason: str
    profile_id: str
    image_id: str = ""
    exit_code: int = 0
    elapsed_ms: int = 0
    input_bytes: int = 0
    output_bytes: int = 0
    output_sha256: str = ""
    container_started: bool = False
    trace: dict[str, Any] = field(default_factory=dict)
```

Return a `blocked` receipt for an absent profile before any runtime call.

- [x] **Step 4: Add oversized-input test, run RED, implement, run GREEN**

Use a profile with `input_bytes=4` and request `b"12345"`. Expect `capability_input_too_large`, `container_started=false`, and no input echoed in serialized receipt.

- [x] **Step 5: Run the Task 1 tests**

Expected: both tests pass; no Docker command has been introduced yet.

---

### Task 2: Docker Argument Builder and Image Identity Gate

**Files:**
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/docker_capability_executor.py`
- Test: `<openclaw-default-workspace>/scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Consumes a validated `CapabilityProfile` and a `DockerCommandRunner` test seam.
- Produces `DockerCapabilityExecutor.execute(request) -> CapabilityExecutionReceipt`.

- [x] **Step 1: Write failing argument-builder test**

Inject a recording command runner and assert its `docker run` argument list contains:

```python
"--network", "none", "--read-only", "--cap-drop", "ALL",
"--security-opt", "no-new-privileges:true", "--user", "65532:65532"
```

Assert it contains no `--mount`, `-v`, `--privileged`, `--network=host`, `--cap-add`, `--env-file`, `sh`, or `-c`.

- [x] **Step 2: Run the test to verify RED**

Expected: import failure because `docker_capability_executor` does not exist.

- [x] **Step 3: Implement inspect-first execution seam**

Define:

```python
class DockerCommandRunner(Protocol):
    def run(self, argv: tuple[str, ...], input_bytes: bytes, timeout_seconds: int) -> DockerCommandResult:
        ...
```

The executor first runs fixed `docker image inspect --format {{.Id}} <image_ref>`. A mismatch returns `capability_image_identity_mismatch` before constructing `docker run`. The real runner uses `subprocess` with an argument array and no shell.

- [x] **Step 4: Add image-mismatch test, run RED, implement, run GREEN**

Return `sha256:wrong` from inspection for a profile expecting `sha256:expected`. Assert `capability_image_identity_mismatch`, `container_started=false`, and no `docker run` call.

- [x] **Step 5: Run Task 2 tests**

Expected: profile validation, image identity, and argument restrictions pass entirely through fakes.

---

### Task 3: Local Scratch Probe Build and Successful Offline Receipt

**Files:**
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_probe/main.go`
- Create: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_probe/Dockerfile`
- Modify: `<openclaw-default-workspace>/scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces a test-only local image and exact inspected image ID injected into `CapabilityProfile`.

- [x] **Step 1: Write the failing Docker integration test**

The test must build a temporary local context with:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o capability-probe ./main.go
docker build --network none -t <unique-local-tag> <temporary-context>
```

Then execute the `success` profile and assert:

```python
self.assertEqual(receipt.result, "passed")
self.assertTrue(receipt.container_started)
self.assertEqual(len(receipt.output_sha256), 64)
self.assertNotIn("probe output", json.dumps(asdict(receipt)))
self.assertTrue(receipt.trace["network_none"])
self.assertTrue(receipt.trace["read_only_rootfs"])
self.assertEqual(receipt.trace["host_mount_count"], 0)
```

- [x] **Step 2: Run the test to verify RED**

Expected: probe assets or real Docker executor behavior are missing.

- [x] **Step 3: Add static Go probe and Dockerfile**

`main.go` reads fixed mode from argv and bounded stdin. `success` emits a fixed marker and exits 0. `Dockerfile` is exactly:

```dockerfile
FROM scratch
COPY capability-probe /capability-probe
ENTRYPOINT ["/capability-probe"]
```

- [x] **Step 4: Implement real Docker command runner**

Capture output with a bounded reader, hash it, and discard bytes before receipt creation. Use a generated safe container name, `--rm`, and a `finally` cleanup path that runs `docker rm -f <name>` if the command times out or output exceeds the cap.

- [x] **Step 5: Run success integration test and remove local image**

Expected: receipt passes and test cleanup removes the temporary local tag/image. No raw output appears in test assertions or receipts.

---

### Task 4: Real Adversarial Container Enforcement

**Files:**
- Modify: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/capability_probe/main.go`
- Modify: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/docker_capability_executor.py`
- Modify: `<openclaw-default-workspace>/scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Consumes fixed probe modes `network`, `readonly`, `sleep`, and `output`.
- Produces fail-closed receipts with no raw runtime output.

- [x] **Step 1: Add network-denial test, run RED, implement, run GREEN**

Probe mode `network` attempts a TCP dial and exits non-zero when the dial is denied. Assert `capability_command_failed`, `network_none=true`, and no raw network marker in the receipt.

- [x] **Step 2: Add read-only-root test, run RED, implement, run GREEN**

Probe mode `readonly` attempts to create `/forbidden-probe-write`. Assert non-zero command failure and `read_only_rootfs=true`.

- [x] **Step 3: Add timeout test, run RED, implement, run GREEN**

Probe mode `sleep` exceeds a one-second profile timeout. Assert `capability_timeout`, elapsed time remains bounded, and `docker ps -a --filter name=<generated-name>` confirms no leftover container.

- [x] **Step 4: Add output-limit test, run RED, implement, run GREEN**

Probe mode `output` writes a unique marker beyond an 64-byte output limit. Assert `capability_output_limit_exceeded` and marker absence from serialized receipt.

- [x] **Step 5: Run all executor integration tests**

Expected: successful probe plus all four adversarial modes pass their assertions; all local images are removed in cleanup.

---

### Task 5: Public Exports, Both Instances, Review, and Documentation

**Files:**
- Modify: `<openclaw-default-workspace>/scripts/openclaw_intelligence_pipeline/__init__.py`
- Synchronize: executor modules, probe assets, exports, and test file into `<openclaw-work-workspace>`.
- Modify: `<public-docs-repo>/CHANGELOG.md`
- Modify: `<public-docs-repo>/docs/openclaw-intelligence-pipeline-architecture.md`
- Modify: `<public-docs-repo>/docs/openclaw-collector-pipeline.md`
- Modify: `<public-docs-repo>/package.json`
- Modify: `<obsidian-architecture-note>`

**Interfaces:**
- Exports `CapabilityExecutionReceipt`, `CapabilityExecutionRequest`, `CapabilityExecutor`, `CapabilityProfile`, `CapabilityResourceLimits`, and `DockerCapabilityExecutor`.

- [x] **Step 1: Run complete default verification**

```bash
python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py
python3 -m compileall -q scripts/openclaw_intelligence_pipeline scripts/test_openclaw_intelligence_pipeline.py
```

Expected: all tests pass, including real local Docker integration tests.

- [x] **Step 2: Run CodeRabbit review and resolve valid issues**

```bash
coderabbit review --agent -t uncommitted --dir scripts
```

Wait for review completion. Fix every valid issue with red-green tests and repeat until CodeRabbit raises 0 issues. Do not use manual review as a substitute for a failed or rate-limited CodeRabbit invocation.

- [x] **Step 3: Synchronize reviewed files and verify work instance**

Copy only executor modules, probe assets, `__init__.py`, and test file. Run the same complete suite and compile check in `<openclaw-work-workspace>`. Compare hashes for every synchronized file.

- [x] **Step 4: Update documentation and version**

Bump the public package from `1.2.63` to `1.2.64`. Record Docker version, local scratch image evidence, no-network/read-only/limits tests, CodeRabbit result, both-instance counts, and the explicit fact that no real controlled runner was registered.

- [x] **Step 5: Verify and push public documentation**

```bash
npm run check
git diff --check
git add CHANGELOG.md docs/openclaw-collector-pipeline.md docs/openclaw-intelligence-pipeline-architecture.md docs/superpowers/plans/2026-07-10-capability-constrained-executor.md docs/superpowers/specs/2026-07-10-capability-constrained-executor-design.md package.json
git commit -m "docs: record capability constrained executor"
git push
```

- [x] **Step 6: Final production-safety assertion**

Confirm no real WeChat/Bilibili runner, proxy, Internet-capable container, publisher, production write, traffic switch, V10 cutover, or legacy shutdown was enabled.

## Implementation Closure

- Completed on 2026-07-10 as public release `1.2.64`.
- Local Docker 29.2.1 and Go 1.26.1 built and exercised the scratch probe. Default/work each passed 198 tests and compile checks; synchronized executor files and tests have matching SHA-256 hashes.
- The final scoped CodeRabbit review raised 0 issues.
- Phase A remains strictly offline and shadow-only. No real controlled runner, proxy, egress, publisher, production write, traffic switch, V10 cutover, or legacy shutdown was enabled.
