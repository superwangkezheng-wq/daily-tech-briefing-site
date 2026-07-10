# Phase C Real-Profile Read-Only Canary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute exactly one read-only `OpenAI News RSS` canary through a fixed-profile policy proxy, compare it with a read-only V10 observation, and leave publishing and cutover disabled.

**Architecture:** Phase C adds a separate fixed-fetch proxy and RSS worker instead of widening the Phase B fixture proxy. Python owns the immutable profile registry, Docker lifecycle, safe envelope conversion and V10 observation; static Go binaries own the narrow proxy fetch and in-memory RSS parsing. The worker is connected only to an internal network, while the trusted proxy is the only component with a separate egress network.

**Tech Stack:** Python 3 standard library, Go standard library, static `FROM scratch` Docker images, Docker, `unittest`, CodeRabbit CLI.

## Global Constraints

- First and only real profile: `openai-news-rss-v1`, exact `https://openai.com/news/rss.xml`.
- Profile accepts one `GET`, one lease, one authority, no credential/header/body/URL/path from the worker, zero redirects, 5-second connect timeout, 15-second response timeout and at most 512 KiB wire bytes.
- The worker has exactly one `--internal` Docker bridge. The proxy joins it plus a distinct egress bridge. No host port, mount, device, privileged mode, Docker socket, shell, custom DNS, `--add-host`, proxy environment or credentials.
- DNS is proxy-owned; it chooses one global address deterministically and pins it for the TLS dial with SNI `openai.com`. No ambient second lookup is allowed.
- Every receipt/report is metadata/hash-only. Candidate content may flow only through the existing candidate contract; no body/header/IP/lease/URL query/container ID/host path/upstream error text may enter a receipt, log or assertion.
- No model call, cache/file write, publisher/channel send, production write, V10 invocation/change, legacy shutdown, traffic shift or production cutover. Every corresponding trace flag is false.
- Do not stage or commit OpenClaw workspace source files. Synchronize only the explicit Phase C manifest to `/Users/REDACTED/.openclaw-work/workspace` after review. Public documentation may be committed separately.
- CodeRabbit is required before the one authorized real request. If it cannot run, pause before the real request; do not replace it with a manual review.

## File Structure

| File | Responsibility |
| --- | --- |
| `scripts/openclaw_intelligence_pipeline/real_profile.py` | Immutable registry, lease and profile validation for the one real source. |
| `scripts/openclaw_intelligence_pipeline/real_profile_proxy/main.go` | Fixed internal `/fetch` endpoint, proxy-owned DNS/TLS/pinned fetch and hash-only receipt. |
| `scripts/openclaw_intelligence_pipeline/real_profile_proxy/main_test.go` | Proxy protocol, DNS/TLS/redirect/size/privacy tests using injected fakes. |
| `scripts/openclaw_intelligence_pipeline/real_profile_worker/main.go` | Internal proxy client and safe in-memory RSS candidate extractor. |
| `scripts/openclaw_intelligence_pipeline/real_profile_worker/main_test.go` | Worker request-shape and RSS safety tests. |
| `scripts/openclaw_intelligence_pipeline/real_profile_runtime.py` | Static builds, ephemeral Docker topology, local topology preflight, real-canary orchestration and cleanup audit. |
| `scripts/openclaw_intelligence_pipeline/real_profile_runner.py` | Controlled-runner adapter that converts runtime output into a centrally validated envelope. |
| `scripts/openclaw_intelligence_pipeline/v10_canary_observation.py` | Read-only V10 Markdown observation comparator. |
| `scripts/test_openclaw_intelligence_pipeline.py` | Public Python contract, runner, comparator, privacy and orchestration tests. |
| `scripts/openclaw_intelligence_pipeline/__init__.py` | Minimal vetted Phase C public exports after tests pass. |

---

### Task 1: Immutable Real Profile and Lease Contracts

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/real_profile.py`
- Modify: `scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces `RealReadOnlyProfile`, `RealProfileLease`, `get_real_profile(profile_id)`, `issue_real_profile_lease(profile, now_epoch)`, and `validate_real_profile_request(profile, lease, profile_id)`.
- `get_real_profile("openai-news-rss-v1")` is the only registry success.

- [ ] **Step 1: Write one failing registry test**

```python
def test_real_profile_registry_exposes_only_openai_news_rss(self) -> None:
    profile = get_real_profile("openai-news-rss-v1")
    self.assertEqual(profile.authority, "openai.com:443")
    self.assertEqual(profile.path, "/news/rss.xml")
    self.assertEqual(profile.max_wire_bytes, 512 * 1024)
    self.assertFalse(profile.redirects_allowed)
    with self.assertRaises(KeyError):
        get_real_profile("other")
```

- [ ] **Step 2: Run it RED**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k real_profile_registry_exposes_only_openai_news_rss`

Expected: import failure because `real_profile` does not exist.

- [ ] **Step 3: Add the smallest immutable contract**

```python
@dataclass(frozen=True)
class RealReadOnlyProfile:
    profile_id: str
    authority: str
    path: str
    connect_timeout_seconds: int
    response_timeout_seconds: int
    max_wire_bytes: int
    redirects_allowed: bool = False
    credential_mode: str = "none"

def get_real_profile(profile_id: str) -> RealReadOnlyProfile:
    if profile_id != "openai-news-rss-v1":
        raise KeyError("real profile is not registered")
    return _OPENAI_NEWS_RSS_PROFILE
```

- [ ] **Step 4: Add lease and mutation red tests, then implement them**

```python
def test_real_profile_request_rejects_expired_or_mutated_profile(self) -> None:
    profile = get_real_profile("openai-news-rss-v1")
    lease = issue_real_profile_lease(profile, now_epoch=100)
    self.assertEqual(validate_real_profile_request(profile, lease, profile.profile_id, now_epoch=101), "passed")
    self.assertEqual(validate_real_profile_request(profile, lease, "other", now_epoch=101), "profile_denied")
    self.assertEqual(validate_real_profile_request(profile, lease, profile.profile_id, now_epoch=160), "lease_expired")
```

Use a frozen, opaque-token, single-request lease. Validate authority, path, method, credential mode, redirects and every numeric cap inside the registry module; do not accept caller-supplied policy values.

- [ ] **Step 5: Verify GREEN**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k real_profile`

Expected: all real-profile tests pass without a network call.

### Task 2: Fixed-Fetch Proxy With Adversarial Go Tests

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_proxy/main.go`
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_proxy/main_test.go`
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_proxy/Dockerfile`

**Interfaces:**
- Consumes only `X-OpenClaw-Egress-Lease` and `X-OpenClaw-Profile-ID` on `GET /fetch`.
- Produces a bounded RSS response plus a single JSON-lines `realProxyReceipt` on stdout.
- `newRealProxyServer(proxy *realProxy) *http.Server` uses finite server timeouts.

- [ ] **Step 1: Write the proxy happy-path test first**

```go
func TestFixedProfileFetchPinsOpenAIAddressAndReturnsBoundedRSS(t *testing.T) {
    proxy := newTestRealProxy(fakeResolver{"openai.com": {netip.MustParseAddr("203.0.113.7")}}, fakeTLSClient(rssBody))
    response := serveProxy(proxy, http.MethodGet, "/fetch", validLeaseHeaders())
    if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "<rss") {
        t.Fatalf("fixed fetch failed: code=%d", response.Code)
    }
    if proxy.lastDial != "203.0.113.7:443" { t.Fatalf("dial was not pinned") }
}
```

- [ ] **Step 2: Run it RED**

Run: `GO111MODULE=off go test ./scripts/openclaw_intelligence_pipeline/real_profile_proxy -run FixedProfileFetch`

Expected: package directory does not exist.

- [ ] **Step 3: Implement the fixed protocol**

```go
func (p *realProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet || r.URL.Path != "/fetch" || r.URL.RawQuery != "" || r.Body != http.NoBody {
        p.block(w, "real_request_denied"); return
    }
    if !p.reserveLease(r.Header) { p.block(w, "real_lease_denied"); return }
    address, reason := p.resolveOneGlobal(r.Context(), "openai.com")
    if reason != "" { p.block(w, reason); return }
    response, reason := p.fetchPinnedTLS(r.Context(), address, "https://openai.com/news/rss.xml")
    if reason != "" { p.block(w, reason); return }
    p.writeBoundedResponse(w, response)
}
```

Implement `fetchPinnedTLS` with `CheckRedirect` returning `http.ErrUseLastResponse`, custom `DialContext` to the selected address, `TLSClientConfig.ServerName="openai.com"`, no request headers from the worker, no body, one request, finite timeout and a 512 KiB `io.LimitReader` guard.

- [ ] **Step 4: Add each adversarial test as a red/green slice**

Add focused tests for extra path/query/header/body, unknown/replayed/expired lease, private/loopback/reserved DNS, multiple-result deterministic selection, fake second lookup rejection, wrong SNI/TLS failure, redirect, non-2xx/content-type failure, response/header overflow, dynamic `Fatalf` privacy guard and receipt serialization without body/IP/lease.

Run after each slice: `GO111MODULE=off go test ./scripts/openclaw_intelligence_pipeline/real_profile_proxy`

Expected: pass.

- [ ] **Step 5: Build the unprivileged image**

```dockerfile
FROM scratch
COPY real-profile-proxy /real-profile-proxy
USER 65532:65532
ENTRYPOINT ["/real-profile-proxy"]
```

Run: `GO111MODULE=off go build -o /tmp/real-profile-proxy scripts/openclaw_intelligence_pipeline/real_profile_proxy/main.go && rm /tmp/real-profile-proxy`

Expected: exit 0.

### Task 3: Internal RSS Worker

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_worker/main.go`
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_worker/main_test.go`
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_worker/Dockerfile`

**Interfaces:**
- Consumes only proxy service URL, opaque lease and exact profile ID from executor environment.
- Produces one JSON envelope: artifact hash/byte count plus at most one title/link/published candidate; no RSS body.

- [ ] **Step 1: Write worker proxy request and body-redaction tests**

```go
func TestWorkerRequestsOnlyFixedProxyEndpointAndDoesNotSerializeRSSBody(t *testing.T) {
    receipt := runWorkerAgainst(testProxy(rssFixture))
    if receipt.Candidate.Link == "" || receipt.ArtifactSHA256 == "" { t.Fatal("candidate evidence missing") }
    encoded, _ := json.Marshal(receipt)
    if bytes.Contains(encoded, []byte("RSS-SENTINEL-BODY")) { t.Fatal("raw RSS leaked") }
}
```

- [ ] **Step 2: Run RED and add the minimal worker**

Run: `GO111MODULE=off go test ./scripts/openclaw_intelligence_pipeline/real_profile_worker -run Worker`

Expected: package missing.

Implement `fetchFromProxy`, a bounded XML parser that rejects `<!DOCTYPE` and `<!ENTITY` before parsing, and a candidate extractor that accepts only non-empty title/link plus RFC822/RFC3339 publication time. The worker must not read/write files, shell out, set a proxy variable, issue direct DNS/dials, follow redirects or print upstream errors.

- [ ] **Step 3: Add malformed/XML entity/missing-date/direct-mode tests**

Each test must first fail and then prove the worker emits a classified failure with no candidate/body leak. Direct mode may attempt `openai.com` only from the internal-only container later; it must be unavailable in the in-process worker client.

- [ ] **Step 4: Build and harden image**

Use the same `FROM scratch` / `USER 65532:65532` pattern. Run `GO111MODULE=off go test ./scripts/openclaw_intelligence_pipeline/real_profile_worker` and a temporary static build. Expected: pass.

### Task 4: Docker Runtime and Local Topology Preflight

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_runtime.py`
- Modify: `scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces `RealProfileCanaryRequest(profile_id, allow_real_network=False)`, `RealProfileCanaryResult`, and `DockerRealProfileCanaryRuntime.run(request)`.
- `allow_real_network=False` runs topology/preflight only and must not call an external authority.
- `allow_real_network=True` is the sole route to the one authorized canary fetch.
- The module CLI is exactly `PYTHONPATH=scripts python3 -m openclaw_intelligence_pipeline.real_profile_runtime --profile-id openai-news-rss-v1 --allow-real-network --v10-reference-markdown latest-safe --json`; `latest-safe` is resolved only beneath the fixed V10 archive root by the runtime. The CLI rejects every other profile ID, a missing explicit flag, a symlink/path escape, or an arbitrary reference path.

- [ ] **Step 1: Write the no-network preflight test**

```python
def test_real_profile_runtime_preflight_uses_internal_worker_and_never_requests_openai(self) -> None:
    result = DockerRealProfileCanaryRuntime(docker=FakeDocker()).run(
        RealProfileCanaryRequest("openai-news-rss-v1", allow_real_network=False)
    )
    self.assertEqual(result.result, "preflight_passed")
    self.assertFalse(result.trace["network_used"])
    self.assertTrue(result.trace["worker_internal_only"])
    self.assertFalse(result.trace["host_port_published"])
```

- [ ] **Step 2: Run RED, then implement lifecycle orchestration**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k real_profile_runtime_preflight`

Expected: import failure.

Use the Phase B controlled Docker client pattern: empty Docker config, no ambient proxy variables, static `go build`, `docker build --network none`, image-ID only runtime invocation, labels `openclaw.phase=real-profile-canary`, no host ports/mounts/devices/privileged/custom DNS/add-host, and cleanup/audit in `finally`.

- [ ] **Step 3: Add adversarial runtime red/green tests**

Cover image/network membership, direct worker denial, extra network/host port/mount/device/custom DNS rejection, response/receipt validation, label-residue cleanup, cleanup uncertainty, and refusal to execute a real request unless `allow_real_network is True` and `profile_id` is exact.

- [ ] **Step 4: Run local Docker preflight**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k real_profile_runtime`

Then run the explicit preflight command created by the task. Expected: no external request, no labelled container/network/image remains.

### Task 5: Controlled Runner Integration and Candidate/Fidelity Gates

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/real_profile_runner.py`
- Modify: `scripts/openclaw_intelligence_pipeline/live_collector_evidence.py`
- Modify: `scripts/openclaw_intelligence_pipeline/__init__.py`
- Modify: `scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces `OpenAINewsRssControlledRunner(runtime)` and `build_real_profile_canary_evidence(...)`.
- The runner implements `ControlledCollectorRunner.run(request)` and uses only the runtime result; no native `urllib` fallback.

- [ ] **Step 1: Write a public integration test**

```python
def test_openai_real_profile_runner_builds_one_hash_only_candidate_without_native_fallback(self) -> None:
    evidence = build_real_profile_canary_evidence(
        runtime=FakeRealProfileRuntime.passed_candidate(),
        v10_markdown=V10_REPORT_FIXTURE,
    )
    self.assertEqual(evidence["result"], "passed")
    self.assertEqual(evidence["candidate_count"], 1)
    self.assertFalse(evidence["trace"]["published"])
    self.assertNotIn("RSS-SENTINEL-BODY", json.dumps(evidence))
```

- [ ] **Step 2: Run RED and implement only the adapter seam**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k openai_real_profile_runner`

Expected: import failure.

Map a valid runtime result to a bounded `ControlledCollectorEnvelope`; run the existing centralized envelope validation, candidate quality and live-artifact fidelity checks. A blocked/invalid runtime result must return no artifact/candidate and must not touch `UrllibLiveCollectorTransport`.

- [ ] **Step 3: Add red/green tests for raw leak, missing time, incorrect source identity, runner exception and all false side-effect flags**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k 'real_profile or openai_real_profile'`

Expected: pass.

- [ ] **Step 4: Export only the vetted public contracts**

After tests exist, add only `RealReadOnlyProfile`, `RealProfileCanaryRequest`, `RealProfileCanaryResult`, `DockerRealProfileCanaryRuntime`, and `build_real_profile_canary_evidence` to package exports. Add a package-level export test before editing `__init__.py`.

### Task 6: V10 Canary Observation Comparator

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/v10_canary_observation.py`
- Modify: `scripts/test_openclaw_intelligence_pipeline.py`

**Interfaces:**
- Produces `compare_real_canary_to_v10(candidate, v10_markdown) -> dict[str, Any]`.
- Reuses `parse_v10_markdown_report`; it does not invoke V10 or copy V10 summaries into its result.

- [ ] **Step 1: Write the same-item/no-selection test**

```python
def test_v10_canary_observation_marks_nonselected_item_not_comparable_not_failed(self) -> None:
    result = compare_real_canary_to_v10(OPENAI_CANDIDATE, V10_REPORT_FIXTURE)
    self.assertEqual(result["evaluation_status"], "not_comparable")
    self.assertTrue(result["contract_parity"])
    self.assertFalse(result["production_cutover_allowed"])
```

- [ ] **Step 2: Run RED, then implement metadata-only comparison**

Run: `python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k v10_canary_observation`

Expected: import failure.

Compare only normalized source/link/date presence and hashes of those identifiers. The result contains counts and booleans, not V10 or candidate title/link/time text. Invalid/blank reference returns `blocked`; non-selected item returns `not_comparable`; same source/item can return `passed` only if candidate quality/fidelity has already passed.

- [ ] **Step 3: Add red/green privacy and reference-failure tests**

Test blank/malformed Markdown, source mismatch, link mismatch, absent date and serialization redline. Ensure every result retains `publish_allowed=false`, `traffic_shift_allowed=false`, `production_cutover_allowed=false`.

### Task 7: Full Verification, CodeRabbit, One Real Canary and Records

**Files:**
- Create: `/Users/REDACTED/.openclaw/workspace/.superpowers/sdd/phase-c-manifest.txt`
- Create: `/Users/REDACTED/.openclaw/workspace/.superpowers/sdd/phase-c-verification.md`
- Modify: `CHANGELOG.md`, `package.json`, `docs/openclaw-intelligence-pipeline-architecture.md`, `docs/openclaw-collector-pipeline.md`, and the Obsidian architecture record only after final evidence.

- [ ] **Step 1: Full local checks in default instance**

Run:

```bash
python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py
python3 -m compileall -q scripts/openclaw_intelligence_pipeline scripts/test_openclaw_intelligence_pipeline.py
GO111MODULE=off go test ./scripts/openclaw_intelligence_pipeline/real_profile_proxy ./scripts/openclaw_intelligence_pipeline/real_profile_worker
docker ps --all --filter label=openclaw.phase=real-profile-canary --format '{{.Names}} {{.Status}}'
docker network ls --filter label=openclaw.phase=real-profile-canary --format '{{.Name}}'
docker image ls --filter label=openclaw.phase=real-profile-canary --format '{{.Repository}}:{{.Tag}}'
```

Expected: tests/builds pass and all three Docker commands are empty.

- [ ] **Step 2: Generate explicit Phase C manifest and sync work instance**

List every new/modified Phase C source, Dockerfile and test explicitly. Copy only those paths plus the central Python test file to the work instance. Run Step 1 there and require SHA-256 equality for every manifest file.

- [ ] **Step 3: CodeRabbit gate**

Run: `coderabbit review --agent -t uncommitted --dir scripts`

For every valid finding: add a failing regression, make the minimal fix, repeat focused/full checks, resync hashes, then rerun CodeRabbit. Do not issue the real request before CodeRabbit returns zero valid findings.

- [ ] **Step 4: Authorized one-request canary**

Run exactly:

```bash
PYTHONPATH=scripts python3 -m openclaw_intelligence_pipeline.real_profile_runtime \
  --profile-id openai-news-rss-v1 \
  --allow-real-network \
  --v10-reference-markdown latest-safe \
  --json
```

Before it runs, inspect Docker labels and assert the public profile, zero credentials, no publisher/model/V10 invocation, and lease/request budget of one. After it runs, validate proxy/worker receipts, RSS candidate, quality, fidelity, V10 comparator, no raw leak, and empty Docker residue. A failure records `blocked`; it must not retry automatically or widen policy.

- [ ] **Step 5: Release records only after passing evidence**

Bump public package version exactly once, document actual outcome (including a blocked outcome if that is what occurred), update Obsidian and public docs, run `npm run check` and `git diff --check`, commit only public records, and push. Never commit the dirty OpenClaw workspaces.

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover immutable authority, proxy topology, DNS/TLS, resource limits and local proof; Task 5 covers controlled-runner and quality/fidelity integration; Task 6 covers V10 observation; Task 7 covers both instances, CodeRabbit, the single real request and records.
- No placeholder scan: all task actions name a file, observable interface, red test and exact verification command.
- Type consistency: only Task 1 creates profile/lease contracts; Task 4 owns runtime request/result; Task 5 is the only bridge to `ControlledCollectorRunner`; Task 6 consumes its candidate without modifying the runner; Task 7 is the sole real-network execution gate.
