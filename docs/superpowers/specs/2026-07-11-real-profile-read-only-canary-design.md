# Phase C Real-Profile Read-Only Canary Design

Date: 2026-07-11

Status: User-approved design; implementation requires a reviewed plan

## Decision

Phase C adds one narrowly bounded, real read-only collection profile for
`OpenAI News RSS` at `https://openai.com/news/rss.xml`. It does not make the
worker an Internet client. The trusted proxy fetches an immutable, exact URL
on the worker's behalf; the worker receives only a bounded RSS response across
the existing internal network and returns hash-only collection evidence.

The outcome is a parallel evaluation input, not a publisher input. V10 remains
the active collector and publisher. Phase C neither schedules V10 nor changes
it, and it does not write production output, send a channel, call a model,
summarize content, modify selection, or switch traffic.

## Context

Phase A established a capability-constrained, no-network worker. Phase B
proved the worker/proxy split, lease checks, hash-only receipts, local DNS
pinning, adversarial Docker topology, and cleanup with a fixture-only profile.
That profile intentionally cannot reach a real authority.

The existing live collector evidence path has read-only RSS adapters, but its
native `urllib` transport is not an acceptable Phase C execution mechanism:
it would let the caller own DNS, destination, TLS, and network access. Phase C
must retain the worker/proxy seam and make the real authority, URL, resource
limits, and audit shape immutable profile data.

## Goals

1. Fetch exactly one public, credential-free RSS endpoint through a policy
   proxy, with no direct worker egress.
2. Produce a bounded `RawArtifact` and one candidate using the existing RSS
   normalization and fidelity contracts, without retaining raw content in an
   artifact, receipt, exception, or report.
3. Produce a read-only comparison with the latest eligible V10 reference
   output. An item that V10 did not select is an observation, not a parity
   failure.
4. Fail closed on authorization, DNS, TLS, redirect, response-budget, audit,
   or cleanup uncertainty.
5. Leave publishing, model calls, V10 execution, V10 cutover, legacy shutdown,
   and traffic switching disabled.

## Non-Goals

- Adding a generic proxy, CONNECT tunnel, browser, media downloader, shell,
  custom DNS, host port, mount, device, privileged container, Docker socket,
  cache write, credential, cookie, or authentication flow.
- Supporting a second authority, wildcard, IP literal, redirect, API key,
  request body, custom header, custom path, or caller-supplied URL.
- Treating one successful fetch or an item-level V10 selection mismatch as
  production authorization.
- Replacing the existing native live-collector canaries in this phase.

## Approaches Considered

### Selected: Fixed-URL proxy fetch

The worker makes a small internal request containing only a lease and profile
ID. The proxy maps that ID to immutable `https://openai.com/news/rss.xml`,
resolves and pins the authority, creates the upstream TLS connection, and
returns at most the profile response budget to the worker. The proxy can
enforce the HTTPS path because it creates the upstream request itself.

This has the strongest locality: URL policy, DNS, TLS, response sizing and
audit rules live in one trusted module rather than being split between a worker
and a tunnel. The worker's interface stays small and cannot express a new
destination or request variant.

### Rejected: HTTPS CONNECT tunnel

An HTTPS tunnel would let the proxy validate only `openai.com:443`; it could
not enforce `/news/rss.xml` inside the encrypted connection. A compromised or
incorrect worker could request another path on the same authority. This is too
wide for the first real profile.

### Rejected: Existing direct `urllib` transport

The existing transport is useful as a legacy, read-only evidence seam, but it
does not put DNS, TLS dialing, path policy and request ownership behind the
Phase B proxy. Connecting it to Phase C would bypass the very boundary being
evaluated.

## Profile Contract

`RealReadOnlyProfile` is executor-owned, immutable and registry-selected. The
worker receives neither its URL nor its policy fields.

| Field | Phase C value / invariant |
| --- | --- |
| `profile_id` | `openai-news-rss-v1` |
| `authority` | exact lower-case `openai.com:443` |
| `path` | exact `/news/rss.xml` |
| `method` | proxy-owned `GET` only |
| `credential_mode` | `none` |
| `redirect_mode` | `deny` |
| `request_budget` | one proxy fetch per short-lived lease |
| `response_budget` | at most 512 KiB of wire bytes |
| `connect_timeout` | at most 5 seconds |
| `response_timeout` | at most 15 seconds |
| `candidate_budget` | one candidate |
| `model/publish/write` | all false |

The constructor must reject any profile which is not a known registry entry,
has more than one authority or URL, allows a wildcard/IP literal/port other
than 443, has a credential mode other than `none`, permits redirects, or has a
non-positive/beyond-cap resource limit.

## Network and TLS Contract

```text
trusted executor
  -> creates a single-use lease
  -> RSS worker: worker-internal only (--internal)
  -> policy proxy: worker-internal + proxy-egress
  -> exact OpenAI RSS authority
```

- `worker-internal` remains a Docker internal bridge. The worker has no other
  network, host route, published port, mount, device, privileged flag,
  `--add-host`, custom DNS, proxy environment, or Docker socket.
- `proxy-egress` is a separate non-internal bridge attached only to the trusted
  proxy. It exists solely so the proxy can reach the selected global authority.
  It has no host-published port and no fixture container in a real-profile run.
- The proxy owns DNS. It rejects zero answers, non-global answers and IP
  literals. It deterministically selects one approved global address and pins
  that address in `DialContext`; it may not perform a second resolver lookup
  while dialing.
- The proxy uses TLS with `ServerName=openai.com`, validates the normal public
  certificate chain, limits the handshake/response lifetime, and follows zero
  redirects. A TLS, certificate, response, DNS or redirect failure yields no
  usable artifact or candidate.

The proxy is trusted computing base. The design does not claim that Docker
isolation confines a compromised Docker daemon, host OS, or proxy.

## Runtime Flow

1. The trusted executor selects `openai-news-rss-v1` and creates a single-use,
   short-lived lease.
2. It starts an unprivileged static RSS worker on `worker-internal` and an
   unprivileged static proxy on both prescribed networks.
3. The worker requests the fixed-profile fetch endpoint with the opaque lease
   and profile ID only. It cannot add headers, a URL, path, method or body.
4. The proxy validates the lease atomically, resolves/pins the registered
   authority, performs the fixed upstream GET, validates status/content type
   and byte limits, then returns the bounded RSS bytes over `worker-internal`.
5. The worker parses RSS in memory and emits a single untrusted envelope with
   artifact hash, response-byte count, candidate title/link/time and no body.
6. Existing centralized controlled-runner validation, candidate quality and
   live-artifact fidelity gates accept or discard that envelope. The resulting
   report is read-only and has all side-effect flags false.
7. The executor always removes containers, networks and ephemeral images. A
   cleanup/audit failure invalidates the result.

## Evidence and Privacy

`RealCanaryReceipt` may contain profile ID/version/policy hash, hashed lease,
hashed canonical URL, response hash, byte count, status class, elapsed time,
DNS classification, TLS result class, candidate field-presence booleans,
quality/fidelity results and side-effect flags.

It must never contain an RSS body, item description, header value, URL query,
IP address, certificate data, container ID, host path, source title/link/time,
lease token, or exception text derived from upstream content. Candidate data is
handled by the existing pipeline objects but may not be copied into receipts,
logs, failure reasons or test assertions.

The canary has no model call and therefore has zero model-token and model-cost
budget. Its network cost is bounded to one request and 512 KiB. It has no
credential cost because `credential_mode=none`.

## V10 Parallel Evaluation

`V10CanaryObservationComparator` reads an existing, eligible V10 reference
artifact or report as input; it never invokes, edits, delays or reroutes V10.
It reports:

| Result | Meaning |
| --- | --- |
| `reference_available` | a V10 reference in the same configured observation window was parsed safely |
| `contract_parity` | candidate required fields and publication-time evidence satisfy the V10-compatible delivery contract |
| `source_observation` | V10 observed the same source/item, a different item, or no comparable item |
| `quality_delta` | structured differences in URL, time, hash/evidence and parse-health fields only |
| `evaluation_status` | `passed`, `blocked`, or `not_comparable`; never production-approved |

`not_comparable` and a V10 non-selection must not be converted into a false
failure. Missing/invalid V10 reference blocks the evaluation result from being
called `passed`, but it does not retry or modify V10. The comparator never sees
or records a V10 log body beyond the existing metadata-safe reader contract.

## Failure and Healing

All Phase C outcomes are classified and fed only to decision-only Healing
Controller plans (`execute=false`). Examples: `real_profile_unknown`,
`real_profile_url_denied`, `real_dns_denied`, `real_tls_failed`,
`real_redirect_denied`, `real_response_too_large`, `real_rss_unparseable`,
`real_envelope_invalid`, `v10_reference_missing`, and `real_cleanup_uncertain`.
No failure may fall through to the native `urllib` adapter, another source,
another authority, a broader lease, cache, publisher or an automatic retry.

## Adversarial Matrix

| Case | Required proof |
| --- | --- |
| Worker direct OpenAI/Internet dial | fails at topology; no proxy receipt |
| Caller supplies URL/path/header/body/method | rejected before DNS/dial |
| Unknown/replayed/expired lease | rejected before DNS/dial |
| Profile mutation, second authority or IP literal | registry rejection |
| Private/loopback/reserved DNS result | rejected before dial |
| Multiple global DNS results | deterministic single pinned selection; no ambient second lookup |
| DNS rebinding attempt | pinned dial only; no second authority resolution |
| TLS wrong SNI/certificate/failure | blocked; no candidate |
| Redirect or non-success/content-type mismatch | blocked; no candidate |
| Header/body/response-time/byte overflow | terminated and blocked; no raw leak |
| RSS XXE/malformed content | parser blocks safely; no raw leak |
| Worker output body/secret/side-effect claim | central envelope validator discards it |
| Host port/mount/device/root/extra network/custom DNS | executor rejects pre-start or audit fails |
| Missing receipt/cleanup uncertainty | evaluation blocked |
| V10 unavailable/non-comparable | report blocked/not-comparable; no V10 action |
| Publisher/model/V10-cutover invocation | static and runtime redlines fail |

## Gates and Acceptance

### Gate C1: Design and plan

This design must be internally consistent, have a plan with test-first slices,
and receive the user's review before implementation.

### Gate C2: Local adversarial proof

All behavior above, including the real-profile path, must first be exercised
against local fixtures. Both OpenClaw instances need full tests, static builds,
network/container residue audits and hash-equal synchronized files.

### Gate C3: One real read-only canary

Only after C2 and explicit implementation review, perform one authorized
`OpenAI News RSS` request. It passes only if proxy receipt, RSS parsing,
candidate quality, artifact fidelity, privacy redline, cleanup audit and V10
observation all pass. The report still sets `publish=false`,
`production_switched=false` and `production_cutover_allowed=false`.

### Gate C4: Independent review and records

Run CodeRabbit over the scoped code. Every valid finding requires a failing
regression before a minimal fix and a repeat review. Synchronize reviewed files
to both instances, compare hashes, update public documentation/Obsidian and
push only those public records after final checks pass.

## Explicit Stop Condition

Phase C ends after its read-only evaluation report and records are complete.
It does not authorize recurring real fetches, additional sources, credentials,
publisher connections, V10 replacement, traffic routing, legacy retirement or
formal production launch. Those require a new source-expansion and production
switch decision.
