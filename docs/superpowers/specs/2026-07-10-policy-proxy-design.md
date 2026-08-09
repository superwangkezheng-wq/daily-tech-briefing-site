# Controlled Egress Policy Proxy Design

Date: 2026-07-10

Status: Design approved; specification awaiting user review

## Context

Phase A proved that a registered offline capability profile can run inside a local, read-only, zero-network Docker container and return only a hash-only receipt. It deliberately cannot collect from a real controlled source: the `none` network driver permits only loopback inside the worker. [Docker none network driver](https://docs.docker.com/engine/network/drivers/none/)

Phase B introduces controlled egress without giving a worker ordinary Docker network access. A default bridge is not acceptable because a container on it has outbound access whenever the Docker host has it. [Docker networking overview](https://docs.docker.com/engine/network/)

This document is a two-gate project:

1. Design and adversarial design review are completed first.
2. Only after the user approves this written specification may a local, shadow-only prototype be implemented and tested against local fixtures.

## Goal

Allow a future controlled runner to make narrowly authorized HTTP(S) requests through a trusted policy proxy while preventing direct worker egress, destination bypass, private-address access, credential exposure, unbounded transfer, and raw audit leakage.

## Non-Goals

- Registering WeChat, Bilibili, browser, `yt-dlp`, or any real collector.
- Contacting a real news source, Internet endpoint, publisher, or production service during the prototype.
- Enabling direct worker networking, host networking, transparent interception, SOCKS, arbitrary TCP, UDP, or a general-purpose proxy.
- Running TLS interception or placing a trusted CA in a worker.
- Passing credentials, cookies, authorization headers, Docker sockets, host mounts, or host proxy configuration into a worker.
- Treating Docker bridge isolation or application-layer policy as protection from a compromised Docker daemon, host kernel, or policy proxy.

## Threat Model

The untrusted party is the controlled worker command and its input. It may try to choose destinations, issue CONNECT tunnels, use literal IPs, exploit DNS rebinding, follow redirects to a different authority, exceed budgets, send credential-like headers, or cause audit leakage.

The trusted computing base is the host OS, Docker daemon, immutable egress-profile registry, executor, policy proxy binary, proxy signing material, and the local test fixture. The proxy is trusted to enforce policy; the design does not claim that a compromised proxy is network-contained merely because it uses a bridge network.

## Approaches Considered

### Recommended: Internal Worker Network and Dual-Homed Policy Proxy

The worker joins only a user-defined Docker `bridge` network created with `--internal`. The proxy joins that network and a second egress network. Docker documents that internal networks allow peers to communicate but omit a default route and drop traffic to other networks. [docker network create](https://docs.docker.com/reference/cli/docker/network/create/)

The worker can reach the proxy but has no route to the second network or the Internet. The proxy is the only component that resolves names and dials destinations. It validates each request against an immutable profile before doing so.

This is selected because the worker bypass is prevented by topology while destination policy remains explicit, testable, and independent of host firewall behaviour.

### Rejected: Host Loopback Proxy

Exposing a host port or using `host.docker.internal` makes host reachability part of the worker contract. It is harder to reason about, varies on Docker Desktop, and invites accidental host-service access.

### Rejected: Transparent Proxy or Custom Network Driver

Transparent routing, firewall redirection, or a network plugin requires privileged host controls and has a substantially larger trusted base. It is not justified before the smaller explicit-proxy design is proven.

## Network Architecture

```text
trusted executor
  -> creates an ephemeral egress lease
    -> worker container
       network: oc-egress-worker-int (--internal only)
       endpoint: http://policy-proxy:8080
         -> policy proxy container
            networks: oc-egress-worker-int + oc-egress-proxy-out
              -> controlled DNS and HTTP(S) dialer
                -> allowed destination
```

### Network Contracts

| Component | `oc-egress-worker-int` | `oc-egress-proxy-out` | Published host ports |
| --- | --- | --- | --- |
| Worker | Required, only network | Forbidden | Forbidden |
| Policy proxy | Required | Required | Forbidden |
| Test fixture origin | Forbidden | Required, prototype only | Forbidden |

- `oc-egress-worker-int` is a user-defined `bridge` network created with `--internal`; it is not the default bridge and it is never attached to a host network.
- `oc-egress-proxy-out` is a distinct user-defined bridge. It exists only for the trusted proxy and, during the prototype, a local fixture origin.
- The executor, not the worker, creates both network names, assigns all attachments, and rejects a profile asking for any additional network, `--network host`, `--add-host`, custom DNS, published port, mount, device, privileged mode, or Docker API socket.
- The proxy has no published port. Its data port is reachable only from the internal worker network. Any administrative action is performed by the trusted executor through a separately specified local control contract, never by a worker.

Docker warns that proxy environment variables are stored in plain text in a container configuration. The executor must therefore launch containers with a controlled Docker client configuration, explicit environment allowlists, and no credential-bearing proxy URL. [Docker proxy configuration](https://docs.docker.com/engine/cli/proxy/)

## Data Contracts

### `EgressPolicyProfile`

An immutable, exact-key registry record owned by the trusted executor:

| Field | Rule |
| --- | --- |
| `profile_id` | Exact registry key; no caller-created profile. |
| `policy_version` / `policy_sha256` | Explicit audit identity. |
| `allowed_authorities` | Exact normalized DNS names and exact ports only; wildcard and IP-literal authority entries are forbidden in Phase B. |
| `methods` | `GET` and `HEAD` only. |
| `http_path_prefixes` | Explicit per-authority prefixes for plaintext HTTP only; empty means deny HTTP. |
| `https_authority_only` | Must be true in Phase B because TLS is not intercepted; HTTPS authorization is authority and port only. |
| `max_requests` | Fixed total request-attempt budget for one lease. |
| `max_distinct_authorities` | Fixed authority budget for one lease. |
| `connect_timeout_seconds` / `response_timeout_seconds` | Positive bounded limits. |
| `max_request_header_bytes` / `max_response_header_bytes` / `max_response_wire_bytes` | Positive fixed byte limits. |
| `credential_mode` | `none` only in the prototype. |
| `prototype_fixture_only` | True only for a separate test-only profile type; never accepted by a future production profile. |

The caller supplies only an exact `profile_id`, bounded UTF-8 request metadata, and bounded body bytes where the profile permits one. It cannot supply an image, command, network, proxy endpoint, authority, DNS server, credential, redirect rule, or resource limit.

### `EgressLease`

The executor creates a short-lived, single-profile lease before starting a worker. It carries a random opaque ID, profile ID, expiry, request budgets, and policy digest. It is bound to one worker execution and invalid after expiry or cleanup.

The worker may receive the opaque lease token because it is only a narrowly scoped, short-lived capability. It is not a credential and cannot widen the profile. The proxy signing key and every future credential remain outside the worker.

### `ProxyDecisionReceipt`

Every allow or deny returns metadata only:

- lease ID hash, profile ID, policy version and digest;
- normalized authority hash, port, method, path-prefix identifier, and decision reason;
- DNS result classification, request/response byte counts, duration, and response SHA-256 when a response exists;
- budgets remaining and explicit flags for direct-network, credential, file-write, channel-send, publish, and production-switch activity.

It never stores a raw URL, query string, request body, response body, header value, IP address, container ID, host path, token, or secret.

## Proxy Enforcement

### Protocol Surface

- Accept HTTP absolute-form `GET` and `HEAD`, and HTTPS `CONNECT` only.
- Reject SOCKS, FTP, UDP, raw TCP, WebSocket upgrade, request body methods, proxy authentication, arbitrary `CONNECT` ports, and unsupported transfer encodings.
- Require a valid unexpired lease on every request and decrement its request and authority budgets atomically before dialing.
- Do not automatically follow redirects. Each subsequent HTTP request or HTTPS CONNECT is evaluated as a new attempt against the same lease budget.

For HTTPS, the proxy does not terminate TLS. It can validate the CONNECT authority and independently resolve and dial that authority, but it cannot inspect encrypted redirect headers. This limitation is explicit: cross-authority redirects are blocked when the client makes the next CONNECT unless that authority is independently allowed; redirect-versus-unrelated-request distinction is not inferred from encrypted traffic.

Consequently, HTTPS path-prefix enforcement is intentionally unavailable in Phase B. A profile that requires path-level HTTPS policy is rejected rather than given a misleading partial guard. Plaintext HTTP paths can be checked before dialing, but the prototype does not rely on HTTP for any real source.

### Authority and DNS Rules

1. Normalize the requested DNS authority to lower-case ASCII using IDNA; reject malformed names, userinfo, fragments, empty hosts, and literal IPv4 or IPv6 addresses.
2. Require an exact authority and exact allowed port match before resolving.
3. Resolve with the proxy-owned resolver only. The worker-provided resolver, host mapping, and DNS option are ignored.
4. Reject a resolution with no result or any result that is loopback, private, link-local, multicast, unspecified, reserved, carrier-grade NAT, or otherwise non-global.
5. Pin the approved resolved address for the dial. Do not perform a second uncontrolled lookup at connection time.
6. For HTTPS CONNECT, authorize the normalized CONNECT authority and let the worker set SNI and validate the server certificate normally. No MITM CA is installed. The proxy cannot inspect the TLS ClientHello and therefore cannot enforce SNI in this architecture.

The Phase B CONNECT tunnel is not an SNI-enforcement mechanism. Any future
profile that requires a CONNECT-authority-to-SNI binding needs a separately
reviewed TLS-aware boundary that can validate that binding; if ECH or another
TLS behavior prevents validation, the profile must fail closed. Do not enable a
real egress profile on the strength of the current TCP CONNECT proxy alone.

The prototype has a deliberately separate fixture profile type whose authority is a local Docker service name on `oc-egress-proxy-out`. That exception is structurally unavailable to a future real egress profile; production DNS rules never accept the fixture network or private addresses.

### Headers, Bodies, and Credentials

- Request headers are size-bounded and normalized. The prototype rejects `Authorization`, `Cookie`, `Proxy-Authorization`, forwarding headers, and headers that try to change the target authority.
- Request bodies are rejected because Phase B supports only `GET` and `HEAD`.
- Response headers and compressed wire bytes are independently limited. The proxy does not decompress, cache, persist, or log response content.
- `credential_mode=none` is mandatory for every prototype profile.
- A future credential broker is a separate design: it may resolve a named credential only inside the proxy, inject an exact profile-approved header, omit that material from receipts, and never expose it to the worker or Docker environment.

## Failure and Healing Semantics

| Reason | Class | Required response |
| --- | --- | --- |
| `egress_profile_unknown` / `egress_lease_invalid` / `egress_lease_expired` | authorization | Block; no dial. |
| `egress_method_denied` / `egress_authority_denied` / `egress_port_denied` / `egress_path_denied` | policy | Block; no DNS or dial. |
| `egress_dns_resolution_failed` / `egress_dns_address_denied` | DNS safety | Block; no dial. |
| `egress_request_budget_exhausted` / `egress_authority_budget_exhausted` | resource | Block; no dial. |
| `egress_request_too_large` / `egress_response_too_large` | transfer safety | Terminate stream, block lease. |
| `egress_proxy_unavailable` / `egress_proxy_timeout` | runtime | Block; decision-only retry/degrade recommendation. |
| `egress_tls_failed` / `egress_upstream_failed` | upstream | Block this attempt; decision-only retry recommendation where profile permits. |
| `egress_audit_unavailable` / `egress_cleanup_failed` | audit integrity | Block; do not treat an otherwise successful fetch as usable. |

Healing Controller receives only these classifications and counters. It may recommend retry, degrade, disable, or alert with `execute=false`; it never changes an allowlist or performs a network action.

## Shadow Prototype Boundary

The first implementation is a local proof, not a controlled collector:

- It builds only local images and starts an internal worker, a dual-homed proxy, and a local fixture origin.
- The fixture is the only permitted destination. No real hostname, public IP, news source, browser, media downloader, credential, file write, cache write, channel send, publisher, schedule, production manifest, traffic shift, V10 cutover, or legacy shutdown is allowed.
- Worker direct access to the fixture and an arbitrary external authority must fail because the worker has only the internal network.
- Worker access to the fixture through the proxy must pass only under the test-only fixture profile.
- A normal profile must reject the fixture's private Docker address; this proves fixture exceptions cannot cross into a real egress contract.

## Adversarial Test Matrix

| Case | Expected result |
| --- | --- |
| Worker dials fixture directly | Network failure; no proxy receipt. |
| Worker uses proxy with valid fixture lease | Pass; hash-only receipt. |
| Unknown, expired, or replayed lease | Block before DNS. |
| Disallowed authority, port, method, path, or IP literal | Block before DNS or dial. |
| DNS result containing private, loopback, link-local, multicast, or reserved address | Block before dial. |
| HTTP redirect to unallowed authority | Subsequent request blocked by authority policy. |
| HTTPS CONNECT to an unallowed authority | Block before dial; no TLS interception. |
| Excess headers, response bytes, request attempts, or authorities | Terminate and block; no raw leak. |
| Worker given an extra network, host network, host port, mount, custom DNS, or credential env | Executor rejects profile/arguments before container start. |
| Proxy crash, missing audit event, or cleanup uncertainty | Fail closed; no candidate/envelope produced. |
| Full default/work suites and image/network cleanup | Pass; no containers or networks remain. |

## Rollout Gates

### Gate 1: Design

This specification must pass self-review for threat-model coverage, topology, contract ownership, HTTPS limitation, fixture separation, audit privacy, and non-goals. The user then reviews and approves the written file. No proxy code is written before that approval.

### Gate 2: Shadow Prototype

Implementation begins only after Gate 1. It must pass the full adversarial matrix on real local Docker networks, both OpenClaw instances, compile checks, file-hash comparison, CodeRabbit review, documentation update, and GitHub synchronization. Any CodeRabbit rate limit pauses finalization rather than being replaced by a manual review.

### Gate 3: Future Real Controlled Source

Not part of Phase B. It requires a separate source-specific design, a production policy profile, credential-broker design if needed, independent adversarial evidence, V10 comparison, and explicit user approval. A passing fixture prototype is never authorization to contact a real source.

## Acceptance Criteria

- The worker has no direct route to a fixture, Internet destination, host, Docker socket, or additional network.
- Every proxy attempt is constrained by a registered immutable profile, lease, DNS validation, authority/port/method/path policy, and resource budget.
- Raw content and secrets cannot enter a receipt, test assertion, or audit record.
- The fixture-only exception is structurally unavailable to real profiles.
- Prototype failures fail closed and result only in decision-only healing guidance.
- No real source, production collector, publisher, production write, traffic switch, V10 cutover, or legacy shutdown is enabled.
