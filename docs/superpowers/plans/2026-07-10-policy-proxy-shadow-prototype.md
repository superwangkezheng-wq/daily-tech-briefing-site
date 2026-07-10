# Controlled Egress Policy Proxy Shadow Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-fixture-only policy-proxy prototype that proves a controlled worker cannot bypass egress policy, without registering or contacting a real source.

**Architecture:** Python owns immutable profiles, leases, hash-only receipts, and Docker lifecycle orchestration. Three static Go `FROM scratch` images provide the policy proxy, fixture origin, and worker. The worker joins only an internal network; the proxy joins internal and fixture networks; the fixture joins only the second network.

**Tech Stack:** Python 3 standard library and `unittest`; Go 1.26.1 with `CGO_ENABLED=0 GOOS=linux GOARCH=arm64`; Docker 29.2.1; CodeRabbit CLI.

## Global Constraints

- Work first in the default OpenClaw workspace, then synchronize only reviewed Phase B files to the separate work-instance workspace.
- Do not modify `ControlledCollectorRunner` dispatch, a V10 manifest, schedule, publisher, production entrypoint, traffic policy, legacy shutdown, browser, `yt-dlp`, cache, file, or channel action.
- Build every image locally; do not pull an image or contact an Internet host, real source, or production endpoint.
- The worker joins only `oc-egress-worker-int-$nonce`, a `bridge --internal` network. It never joins default bridge, proxy-out, host network, or a published port.
- The proxy joins worker-int and `oc-egress-proxy-out-$nonce`; only a local fixture joins proxy-out. No container publishes a host port.
- The executor owns all image names, commands, networks, environment, resource limits, and lease values. A caller supplies only a registered profile ID and bounded worker mode.
- Prototype profiles use `credential_mode="none"`; no raw URL, header, request/response body, token, IP, container ID, host path, or secret reaches a receipt, trace, assertion, or log.
- The fixture exception is a separate `profile_kind="fixture"`; normal profiles reject Docker-private fixture addresses and cannot select fixture mode.
- Use `apply_patch` for manual edits. Do not commit OpenClaw code; both OpenClaw repositories contain unrelated dirty/untracked state. Use tests and SHA-256 comparisons as checkpoints.
- A CodeRabbit rate limit pauses finalization. Do not substitute local review for the required final CodeRabbit review.

---

## File Map

- Create `scripts/openclaw_intelligence_pipeline/egress_policy.py`: immutable profile, lease, request, receipt, normalization, DNS classification, and fail-closed policy.
- Create `scripts/openclaw_intelligence_pipeline/egress_shadow_runtime.py`: local-image build, fixed Docker arguments, network lifecycle, container cleanup, and runtime result parsing.
- Create `scripts/openclaw_intelligence_pipeline/egress_proxy/main.go` and `Dockerfile`: static fixed-policy proxy.
- Create `scripts/openclaw_intelligence_pipeline/egress_fixture/main.go` and `Dockerfile`: static success, redirect, and oversize fixture origin.
- Create `scripts/openclaw_intelligence_pipeline/egress_worker/main.go` and `Dockerfile`: static fixed worker modes.
- Modify `scripts/openclaw_intelligence_pipeline/__init__.py` only after runtime verification.
- Modify `scripts/test_openclaw_intelligence_pipeline.py` for unit and real Docker integration tests.
- Modify after final review: `CHANGELOG.md`, `docs/openclaw-intelligence-pipeline-architecture.md`, `docs/openclaw-collector-pipeline.md`, `package.json`, and the Obsidian architecture record.

---

### Task 1: Immutable Egress Policy and DNS Safety

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/egress_policy.py` in the default OpenClaw workspace.
- Modify: `scripts/test_openclaw_intelligence_pipeline.py` in the default OpenClaw workspace.

**Interfaces:**
- Produces `EgressAuthority`, `EgressResourceLimits`, `EgressPolicyProfile`, `EgressLease`, `EgressRequest`, `ProxyDecisionReceipt`, `validate_egress_profile`, and `authorize_egress_request`.
- `authorize_egress_request(request, *, profiles, leases, now_epoch, resolver)` returns a receipt before any DNS or dial operation.

- [ ] **Step 1: Write failing authority and DNS tests**

```python
def test_egress_policy_rejects_ip_literal_before_resolver(self) -> None:
    profile = EgressPolicyProfile.fixture("fixture-profile")
    calls: list[str] = []
    receipt = authorize_egress_request(
        EgressRequest("lease-1", "GET", "127.0.0.1", 80, "/ok", 0, ()),
        profiles={profile.profile_id: profile},
        leases={"lease-1": EgressLease.active("lease-1", profile.profile_id, now_epoch=10)},
        now_epoch=11,
        resolver=lambda host: calls.append(host) or ("127.0.0.1",),
    )
    self.assertEqual(receipt.reason, "egress_authority_denied")
    self.assertFalse(receipt.dial_allowed)
    self.assertEqual(calls, [])


def test_normal_profile_rejects_private_dns_before_dial(self) -> None:
    profile = EgressPolicyProfile.normal("normal", "allowed.example", 443)
    receipt = authorize_egress_request(
        EgressRequest("lease-2", "CONNECT", "allowed.example", 443, "", 0, ()),
        profiles={profile.profile_id: profile},
        leases={"lease-2": EgressLease.active("lease-2", profile.profile_id, now_epoch=10)},
        now_epoch=11,
        resolver=lambda host: ("172.30.0.2",),
    )
    self.assertEqual(receipt.reason, "egress_dns_address_denied")
    self.assertFalse(receipt.dial_allowed)
```

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_policy_rejects_ip_literal_before_resolver \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_normal_profile_rejects_private_dns_before_dial
```

Expected: import failure because `egress_policy` does not exist.

- [ ] **Step 3: Add minimal immutable contracts**

```python
@dataclass(frozen=True)
class EgressAuthority:
    hostname: str
    port: int
    http_path_prefixes: tuple[str, ...]

@dataclass(frozen=True)
class EgressResourceLimits:
    max_requests: int
    max_distinct_authorities: int
    max_request_header_bytes: int
    max_response_header_bytes: int
    max_response_wire_bytes: int
    connect_timeout_seconds: int
    response_timeout_seconds: int

@dataclass(frozen=True)
class EgressPolicyProfile:
    profile_id: str
    profile_kind: str
    authorities: tuple[EgressAuthority, ...]
    methods: tuple[str, ...]
    limits: EgressResourceLimits
    credential_mode: str

@dataclass(frozen=True)
class EgressLease:
    lease_id: str
    profile_id: str
    expires_at_epoch: int
    remaining_requests: int
    remaining_authorities: int

    @classmethod
    def active(cls, lease_id: str, profile_id: str, *, now_epoch: int) -> "EgressLease":
        return cls(lease_id, profile_id, now_epoch + 60, 1, 1)

@dataclass(frozen=True)
class EgressRequest:
    lease_id: str
    method: str
    authority: str
    port: int
    path: str
    header_bytes: int
    header_names: tuple[str, ...]
```

Use `ipaddress.ip_address(value).is_global` for normal profiles. Permit a private Docker address only when `profile_kind == "fixture"` and the authority exactly equals `fixture-origin`. Reject wildcard hosts, IP-literal authorities, non-UTF-8 metadata, invalid ports, and `credential_mode != "none"`.

Define `EgressPolicyProfile.fixture(profile_id)` as the only constructor for a `fixture-origin:8081` private-address exception. Define `EgressPolicyProfile.normal(profile_id, hostname, port, http_path_prefixes=())` to reject an empty hostname, a wildcard, an IP literal, a port other than 80 or 443, and a non-empty path prefix when the port is 443. Define `consume_egress_lease(lease, *, authority)` to return an object with `.lease` and `.receipt`; it decrements one request and one distinct-authority budget without mutating the input lease.

- [ ] **Step 4: Run GREEN, then add expiry and budget coverage**

```python
def test_expired_egress_lease_does_not_call_resolver(self) -> None:
    profile = EgressPolicyProfile.fixture("fixture-profile")
    calls: list[str] = []
    receipt = authorize_egress_request(
        EgressRequest("expired", "GET", "fixture-origin", 8081, "/ok", 0, ()),
        profiles={profile.profile_id: profile},
        leases={"expired": EgressLease("expired", profile.profile_id, 9, 1, 1)},
        now_epoch=10,
        resolver=lambda host: calls.append(host) or ("172.30.0.2",),
    )
    self.assertEqual(receipt.reason, "egress_lease_expired")
    self.assertEqual(calls, [])
```

Run the Task 1 tests. Expected: all pass with `dial_allowed=False` for each rejection.

- [ ] **Step 5: Checkpoint**

```bash
python3 -m compileall -q scripts/openclaw_intelligence_pipeline/egress_policy.py
```

Expected: exit code `0`.

---

### Task 2: Hash-Only Receipt and HTTPS Boundary

**Files:**
- Modify: `scripts/openclaw_intelligence_pipeline/egress_policy.py` in the default OpenClaw workspace.
- Modify: `scripts/test_openclaw_intelligence_pipeline.py` in the default OpenClaw workspace.

**Interfaces:**
- Produces `ProxyDecisionReceipt` with no raw authority, path, header, token, IP, or payload.

- [ ] **Step 1: Write failing receipt-privacy and HTTPS-profile tests**

```python
def test_proxy_receipt_hashes_sensitive_metadata(self) -> None:
    receipt = blocked_proxy_receipt(
        profile_id="fixture-profile",
        reason="egress_path_denied",
        authority="fixture-origin",
        path="/SECRET-PATH-MUST-NOT-LEAK",
        lease_id="lease-token-must-not-leak",
    )
    serialized = json.dumps(asdict(receipt))
    self.assertNotIn("SECRET-PATH-MUST-NOT-LEAK", serialized)
    self.assertNotIn("lease-token-must-not-leak", serialized)
    self.assertEqual(len(receipt.authority_sha256), 64)


def test_https_profile_with_path_prefix_is_rejected(self) -> None:
    with self.assertRaises(ValueError):
        EgressPolicyProfile.normal("misleading", "allowed.example", 443, http_path_prefixes=("/only",))
```

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_proxy_receipt_hashes_sensitive_metadata \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_https_profile_with_path_prefix_is_rejected
```

Expected: failure because receipt construction and invariant are absent.

- [ ] **Step 3: Implement receipt construction**

```python
@dataclass(frozen=True)
class ProxyDecisionReceipt:
    result: str
    reason: str
    profile_id: str
    authority_sha256: str = ""
    request_bytes: int = 0
    response_bytes: int = 0
    response_sha256: str = ""
    remaining_requests: int = 0
    remaining_authorities: int = 0
    dial_allowed: bool = False
    trace: dict[str, Any] = field(default_factory=dict)
```

Add this helper under the dataclass:

```python
def blocked_proxy_receipt(*, profile_id: str, reason: str, authority: str, path: str, lease_id: str) -> ProxyDecisionReceipt:
    digest = hashlib.sha256(f"{authority}\n{path}".encode("utf-8")).hexdigest()
    del authority, path, lease_id
    return ProxyDecisionReceipt(
        result="blocked",
        reason=reason,
        profile_id=profile_id,
        authority_sha256=digest,
        trace={"file_written": False, "channel_sent": False, "published": False, "production_switched": False},
    )
```

Reject HTTPS profiles with a non-empty path-prefix tuple because Phase B does not terminate TLS. Always set `file_written`, `channel_sent`, `published`, and `production_switched` false.

- [ ] **Step 4: Run GREEN and add replay test**

```python
def test_egress_lease_cannot_be_replayed_after_budget_consumption(self) -> None:
    profile = EgressPolicyProfile.fixture("fixture-profile")
    lease = EgressLease("lease-1", profile.profile_id, 100, 1, 1)
    first = consume_egress_lease(lease, authority="fixture-origin")
    second = consume_egress_lease(first.lease, authority="fixture-origin")
    self.assertEqual(first.receipt.result, "passed")
    self.assertEqual(second.receipt.reason, "egress_request_budget_exhausted")
```

Run Task 1 and Task 2 tests. Expected: all pass.

---

### Task 3: Static Fixture, Worker, and Proxy Images

**Files:**
- Create: `scripts/openclaw_intelligence_pipeline/egress_fixture/main.go` and `Dockerfile` in the default OpenClaw workspace.
- Create: `scripts/openclaw_intelligence_pipeline/egress_worker/main.go` and `Dockerfile` in the default OpenClaw workspace.
- Create: `scripts/openclaw_intelligence_pipeline/egress_proxy/main.go` and `Dockerfile` in the default OpenClaw workspace.
- Create: `scripts/openclaw_intelligence_pipeline/egress_shadow_runtime.py` in the default OpenClaw workspace.
- Modify: `scripts/test_openclaw_intelligence_pipeline.py` in the default OpenClaw workspace.

**Interfaces:**
- Fixture serves only `GET /ok`, `GET /redirect-denied`, and `GET /oversize` on `:8081`.
- Worker accepts only fixed modes `direct`, `allowed`, `denied_authority`, `redirect_denied`, and `oversize_response`.
- Proxy listens on `:8080`, accepts only the executor-supplied fixture lease, and writes one hash-only JSON receipt line.
- `build_egress_shadow_images()` is defined in `egress_shadow_runtime.py` and returns `dict[str, str]` mapping `fixture`, `proxy`, and `worker` to inspected immutable image IDs.

- [ ] **Step 1: Write failing local-image build test**

```python
def test_egress_shadow_assets_build_as_local_scratch_images(self) -> None:
    images = build_egress_shadow_images()
    self.assertEqual(set(images), {"fixture", "proxy", "worker"})
    self.assertTrue(all(image_id.startswith("sha256:") for image_id in images.values()))
```

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_shadow_assets_build_as_local_scratch_images
```

Expected: import failure because the assets and helper are absent.

- [ ] **Step 3: Implement static assets**

Use Go standard library only and one Dockerfile pattern per asset:

```dockerfile
FROM scratch
COPY egress-proxy /egress-proxy
ENTRYPOINT ["/egress-proxy"]
```

Build each asset only with:

```bash
asset=egress-proxy
binary=egress-proxy
nonce="$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o "$binary" ./main.go
docker build --network none --tag "local/openclaw-egress-$asset:$nonce" .
```

The proxy rejects all authorities except `fixture-origin:8081`, rejects `CONNECT`, any header over 4096 bytes, `Authorization`, `Cookie`, and `Proxy-Authorization`, and streams no more than 1024 response bytes. It prints a JSON receipt containing only `result`, `reason`, `profile_id`, authority hash, counts, and response SHA-256.

- [ ] **Step 4: Run GREEN and prove image cleanup**

Run the Step 2 test. In `finally`, run `docker image rm --force "$tag"` for each nonce tag and assert `docker image inspect "$tag"` fails. Expected: `Ran 1 test ... OK`.

- [ ] **Step 5: Format and compile checkpoint**

```bash
gofmt -w scripts/openclaw_intelligence_pipeline/egress_fixture/main.go scripts/openclaw_intelligence_pipeline/egress_worker/main.go scripts/openclaw_intelligence_pipeline/egress_proxy/main.go
python3 -m compileall -q scripts/test_openclaw_intelligence_pipeline.py
```

Expected: both commands exit `0`.

---

### Task 4: Dual-Network Runtime and Direct-Bypass Proof

**Files:**
- Modify: `scripts/openclaw_intelligence_pipeline/egress_shadow_runtime.py` in the default OpenClaw workspace.
- Modify: `scripts/test_openclaw_intelligence_pipeline.py` in the default OpenClaw workspace.

**Interfaces:**
- Produces `DockerEgressShadowRuntime`, `EgressShadowRequest`, and `EgressShadowResult`.
- `run(request)` builds images, creates nonce-named networks, starts fixture/proxy/worker under fixed flags, validates receipt shape, and always removes containers, networks, and images.

- [ ] **Step 1: Write failing topology tests**

```python
def test_egress_worker_cannot_reach_fixture_directly(self) -> None:
    result = DockerEgressShadowRuntime().run(EgressShadowRequest(worker_mode="direct"))
    self.assertEqual(result.worker_reason, "egress_worker_direct_network_denied")
    self.assertEqual(result.proxy_receipts, ())
    self.assertEqual(result.trace["worker_network_count"], 1)


def test_egress_worker_reaches_fixture_only_through_proxy(self) -> None:
    result = DockerEgressShadowRuntime().run(EgressShadowRequest(worker_mode="allowed"))
    self.assertEqual(result.worker_result, "passed")
    self.assertEqual(result.proxy_receipts[0].reason, "egress_fixture_allowed")
    self.assertTrue(result.trace["worker_internal_network"])
    self.assertFalse(result.trace["host_port_published"])
```

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_worker_cannot_reach_fixture_directly \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_worker_reaches_fixture_only_through_proxy
```

Expected: failure because `DockerEgressShadowRuntime` is absent.

- [ ] **Step 3: Implement fixed Docker lifecycle**

Create networks only with:

```text
nonce="$(uuidgen | tr '[:upper:]' '[:lower:]' | tr -d '-')"
worker_network="oc-egress-worker-int-$nonce"
proxy_network="oc-egress-proxy-out-$nonce"
docker network create --driver bridge --internal --label openclaw.phase=egress-shadow "$worker_network"
docker network create --driver bridge --label openclaw.phase=egress-shadow "$proxy_network"
```

Run every container with `--pull never`, `--read-only`, tmpfs `/tmp`, `--cap-drop ALL`, `no-new-privileges:true`, numeric non-root user, CPU/memory/PID limits, no mount, no device, no custom DNS, no `--add-host`, no published port, and no shell. Start the proxy on worker-int, connect it to proxy-out, start fixture on proxy-out, then start worker only on worker-int.

- [ ] **Step 4: Add cleanup checks and run GREEN**

```bash
docker ps --all --filter label=openclaw.phase=egress-shadow --format '{{.Names}}'
docker network ls --filter label=openclaw.phase=egress-shadow --format '{{.Name}}'
```

Assert both outputs are empty after every `run()`, including direct failure. Run Step 2. Expected: `Ran 2 tests ... OK`.

---

### Task 5: Adversarial Proxy Enforcement

**Files:**
- Modify: `scripts/openclaw_intelligence_pipeline/egress_shadow_runtime.py`, `egress_proxy/main.go`, and `egress_fixture/main.go` in the default OpenClaw workspace.
- Modify: `scripts/test_openclaw_intelligence_pipeline.py` in the default OpenClaw workspace.

**Interfaces:**
- Worker failures remain classified in `EgressShadowResult`; proxy decisions remain `ProxyDecisionReceipt` without raw data.

- [ ] **Step 1: Write failing bypass, redirect, and limit tests**

```python
def test_egress_proxy_rejects_disallowed_authority_without_dial(self) -> None:
    result = DockerEgressShadowRuntime().run(EgressShadowRequest(worker_mode="denied_authority"))
    self.assertEqual(result.worker_reason, "egress_authority_denied")
    self.assertEqual(result.proxy_receipts[0].response_bytes, 0)


def test_egress_proxy_blocks_redirect_to_unallowed_authority(self) -> None:
    result = DockerEgressShadowRuntime().run(EgressShadowRequest(worker_mode="redirect_denied"))
    self.assertEqual(result.worker_reason, "egress_authority_denied")
    self.assertNotIn("redirect-target", json.dumps(asdict(result)))


def test_egress_proxy_blocks_oversize_response_without_leak(self) -> None:
    result = DockerEgressShadowRuntime().run(EgressShadowRequest(worker_mode="oversize_response"))
    self.assertEqual(result.worker_reason, "egress_response_too_large")
    self.assertNotIn("FIXTURE-OVERSIZE-MARKER", json.dumps(asdict(result)))
```

- [ ] **Step 2: Run RED**

```bash
python3 -m unittest \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_proxy_rejects_disallowed_authority_without_dial \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_proxy_blocks_redirect_to_unallowed_authority \
  scripts.test_openclaw_intelligence_pipeline.IntelligencePipelineTests.test_egress_proxy_blocks_oversize_response_without_leak
```

Expected: failure because modes do not exist.

- [ ] **Step 3: Implement fixed adversarial modes**

The fixture's `redirect-denied` response uses `Location: http://unallowed-origin:8081/next`; worker must make its next request through the proxy. The fixture's `oversize` response emits 1025 fixed marker bytes. The proxy blocks the second authority before dial and terminates the oversize stream at 1025 bytes, returning only byte count and hash.

- [ ] **Step 4: Add policy-only header and DNS checks**

```python
def test_egress_policy_blocks_authorization_header_before_resolver(self) -> None:
    profile = EgressPolicyProfile.fixture("fixture-profile")
    calls: list[str] = []
    receipt = authorize_egress_request(
        EgressRequest("lease-1", "GET", "fixture-origin", 8081, "/ok", 32, ("Authorization",)),
        profiles={profile.profile_id: profile},
        leases={"lease-1": EgressLease.active("lease-1", profile.profile_id, now_epoch=10)},
        now_epoch=11,
        resolver=lambda host: calls.append(host) or ("172.30.0.2",),
    )
    self.assertEqual(receipt.reason, "egress_header_denied")
    self.assertEqual(calls, [])
```

Add a separate normal-profile test where `resolver` returns `169.254.169.254`; expect `egress_dns_address_denied` before dial.

- [ ] **Step 5: Run all Phase B focused tests GREEN**

```bash
python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py -k egress
```

Expected: every egress test passes and no egress-labelled container, network, or image remains.

---

### Task 6: Exports, Both Instances, CodeRabbit, and Release Records

**Files:**
- Modify: `scripts/openclaw_intelligence_pipeline/__init__.py` in the default OpenClaw workspace.
- Synchronize: Task 1-5 source/assets and `scripts/test_openclaw_intelligence_pipeline.py` into the work-instance workspace.
- Modify: `CHANGELOG.md`, `docs/openclaw-intelligence-pipeline-architecture.md`, `docs/openclaw-collector-pipeline.md`, `package.json`, and the Obsidian architecture record.

**Interfaces:**
- Export only `EgressAuthority`, `EgressLease`, `EgressPolicyProfile`, `EgressRequest`, `ProxyDecisionReceipt`, and `DockerEgressShadowRuntime` after all runtime tests pass.

- [ ] **Step 1: Write failing export test, then add exports**

```python
def test_package_exports_egress_shadow_contracts(self) -> None:
    import openclaw_intelligence_pipeline as pipeline
    self.assertIs(pipeline.EgressPolicyProfile, EgressPolicyProfile)
    self.assertIs(pipeline.DockerEgressShadowRuntime, DockerEgressShadowRuntime)
```

Run before editing `__init__.py`; expect `AttributeError`. Add exactly the six public imports and `__all__` names, then rerun to green.

- [ ] **Step 2: Run default verification**

```bash
python3 -m unittest scripts/test_openclaw_intelligence_pipeline.py
python3 -m compileall -q scripts/openclaw_aihot_provider.py scripts/openclaw_intelligence_pipeline scripts/test_openclaw_intelligence_pipeline.py
docker ps --all --filter label=openclaw.phase=egress-shadow --format '{{.Names}} {{.Status}}'
docker network ls --filter label=openclaw.phase=egress-shadow --format '{{.Name}}'
```

Expected: test/compile exit `0`; both Docker commands output nothing.

- [ ] **Step 3: Run CodeRabbit and resolve every valid issue**

```bash
coderabbit review --agent -t uncommitted --dir scripts
```

For each valid issue, add a failing regression test, apply the minimum fix, run focused and full tests, then repeat CodeRabbit. If it rate-limits, wait for its stated reset and retry; do not substitute local review.

- [ ] **Step 4: Synchronize and verify the work instance**

Copy only the listed Phase B files. Run Step 2 in the work-instance workspace and compare SHA-256 hashes for every synchronized file.

- [ ] **Step 5: Document and push**

Bump `package.json` from `1.2.65` to `1.2.66`. Record topology, fixture-only profile separation, no-direct-worker proof, adversarial outcomes, CodeRabbit result, both-instance counts, and the continued absence of real sources, credentials, publishing, or production switching.

```bash
npm run check
git diff --check
git add CHANGELOG.md docs/openclaw-collector-pipeline.md docs/openclaw-intelligence-pipeline-architecture.md docs/superpowers/plans/2026-07-10-policy-proxy-shadow-prototype.md package.json
git commit -m "docs: record policy proxy shadow prototype"
git push
```

- [ ] **Step 6: Final production-safety assertion**

```bash
rg -n "DockerEgressShadowRuntime|egress_shadow" scripts --glob '!test_openclaw_intelligence_pipeline.py'
docker ps --all --filter label=openclaw.phase=egress-shadow --format '{{.Names}} {{.Status}}'
docker network ls --filter label=openclaw.phase=egress-shadow --format '{{.Name}}'
```

Expected: runtime references occur only in its isolated modules and export; Docker output is empty. Confirm no real source profile, controlled-runner registration, proxy Internet call, credential, publisher, production write, traffic switch, V10 cutover, or legacy shutdown was enabled.

#### Completion Record (2026-07-11)

- [x] Export test was written first; the public package now exports exactly `EgressAuthority`, `EgressLease`, `EgressPolicyProfile`, `EgressRequest`, `ProxyDecisionReceipt`, and `DockerEgressShadowRuntime`.
- [x] Both workspaces passed the final verification: 251 Python tests, proxy/worker/fixture Go tests, compilation, local no-network image builds, `gofmt`, scoped diff checks, and empty labelled Docker container/network/image audits.
- [x] Only the explicit 14-file Phase B manifest was synchronized; all 14/14 SHA-256 values match between the default and work instances.
- [x] CodeRabbit's first review produced five valid findings. They were fixed test-first: finite proxy/fixture HTTP limits, aliased-`testing` privacy audit coverage, numeric non-root scratch users, and policy-permitted fixture `HEAD` behavior. Final CodeRabbit review findings: 0.
- [x] Public records were bumped from `1.2.65` to `1.2.66` and synchronized after the final review.

The final topology differs deliberately from the early draft in Task 4: **both** `worker-internal` and `proxy-out` are Docker internal bridges. Worker attaches only to `worker-internal`; proxy is dual-homed; fixture attaches only to `proxy-out`. This local fixture-only proof does not enable real sources, Internet egress, credentials, publishing/channel sends, production writes, V10 cutover, legacy shutdown, or a traffic switch. It is not production approval.
