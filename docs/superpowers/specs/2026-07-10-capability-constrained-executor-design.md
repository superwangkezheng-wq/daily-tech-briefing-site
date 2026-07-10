# Capability-Constrained Executor Design

Date: 2026-07-10

Status: Design approved; written specification pending user review

## Context

`ControlledCollectorRunner` now separates controlled-source dispatch from native collection and validates the runner's declared output. That seam is intentionally not an operating-system sandbox: an arbitrary in-process runner could still read host files, inherit secrets, open network connections, or launch processes before reporting an apparently clean envelope.

This Phase A design adds a capability-constrained executor for offline probes. It is a prerequisite for any future real controlled runner. The machine has a running Docker engine and Go toolchain, allowing a locally-built, static `FROM scratch` probe image without pulling a third-party base image.

## Goal

Build a Docker-backed executor that can run only pre-registered offline probe commands inside an enforceable, zero-network, read-only, resource-bounded container and return a hash-only audit receipt.

## Non-Goals

- Registering or executing a real WeChat discovery, WeChat mirror, Bilibili, browser, `yt-dlp`, or other production collector.
- Publishing, writing production files, changing V10, scheduling, traffic switching, or disabling legacy collection.
- Permitting direct container Internet access.
- Implementing the future policy proxy, DNS enforcement, domain allowlist, redirect policy, or credential broker.
- Treating Docker as protection against a malicious Docker daemon administrator or a compromised host kernel.
- Replacing the current `ControlledCollectorRunner` result validator.

## Threat Model

The executor must fail closed against a buggy or untrusted controlled runner that attempts to:

- Choose an arbitrary image, command, argument, mount, environment variable, or Docker option.
- Read host files, Docker sockets, inherited secrets, or shell configuration.
- Use the network, spawn helper processes, escalate Linux capabilities, write outside temporary storage, or persist data.
- Exceed CPU, memory, PID, wall-clock, input, output, or log limits.
- Return large or sensitive output that later leaks into evidence.

The trusted computing base for this phase is the host OS, Docker daemon, local image builder, executor implementation, and immutable profile registry. This design does not defend against a compromised trusted base.

## Approaches Considered

### macOS Seatbelt Only

`sandbox-exec` is available and can deny files and network without an image. It is rejected as the primary executor because it is macOS-specific, has less portable audit semantics, and does not give the future pipeline a stable Linux runtime shape.

### Direct Host Process with a Timeout

This is rejected because a timeout cannot prevent host filesystem, environment, subprocess, or network access. The existing main-thread deadline remains useful inside the runner seam but cannot be treated as isolation.

### Docker Offline Container

This is selected for Phase A. Docker can enforce `--network none`, a read-only root filesystem, no host mounts, dropped capabilities, `no-new-privileges`, a non-root user, temporary writable storage, PID/memory/CPU limits, and bounded host-side process management. The executor controls every Docker argument; a runner supplies only a profile identifier and bounded input.

## Scope Split

This work is deliberately split into two projects.

1. **Phase A, this specification:** Offline capability executor and local adversarial probe. Every container has no network.
2. **Phase B, separate future specification:** Private policy proxy and controlled egress. Containers may reach only that proxy on an isolated network; the proxy enforces destination allowlists, DNS, redirects, request limits, and audit records. Direct bridge networking remains prohibited.

Phase B must not begin until Phase A is independently verified.

## Architecture

```text
ControlledCollectorRunner (future caller)
  -> CapabilityExecutionRequest
    -> CapabilityProfileRegistry
      -> DockerCapabilityExecutor
        -> local scratch probe container (--network none)
          -> CapabilityExecutionReceipt
```

The runner never receives a Docker client, image reference, command, mount, shell, environment, or capability switch. The trusted executor resolves a fixed profile by ID and constructs an argument array itself.

## Modules

### `capability_executor.py`

Defines pure contracts and validation:

- `CapabilityResourceLimits`: wall-clock timeout, CPU quota, memory bytes, PID limit, input bytes, output bytes, and temporary filesystem bytes.
- `CapabilityProfile`: immutable profile ID, image reference, expected Docker image ID, fixed entrypoint/arguments, fixed container environment, and fixed limits.
- `CapabilityExecutionRequest`: profile ID and UTF-8 input bytes. It contains no command, image, mount, environment, network, or capability field.
- `CapabilityExecutionReceipt`: result, reason, profile ID, image ID, exit status, elapsed milliseconds, input/output byte counts, output SHA-256, and enforcement trace. It contains no raw stdout, stderr, input, container ID, host path, or secrets.
- `CapabilityExecutor`: protocol with `execute(request) -> CapabilityExecutionReceipt`.
- `validate_capability_request`: rejects unknown profiles, non-UTF-8/oversized input, and image identity mismatch before Docker starts.

### `docker_capability_executor.py`

Implements `DockerCapabilityExecutor`. It owns the only host-side Docker process invocation. It receives an injected immutable profile registry and Docker binary path; it never accepts a shell command from a caller.

For an allowed profile it must construct an argument array equivalent to:

```text
docker run --rm --name <generated-safe-name>
  --network none
  --read-only
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=<limit>
  --cap-drop ALL
  --security-opt no-new-privileges:true
  --pids-limit <limit>
  --memory <limit>
  --cpus <limit>
  --ulimit nofile=32:32
  --user 65532:65532
  --env HOME=/tmp
  --env LANG=C.UTF-8
  <verified-image-reference> <fixed-entrypoint-and-arguments>
```

No bind mount, volume, Docker socket, host network, privileged mode, capability add, `--env-file`, inherited container environment, shell interpolation, or arbitrary command argument is permitted.

Input is streamed through stdin. stdout and stderr are captured together by the host only up to the profile output limit; excess output terminates the container and produces `capability_output_limit_exceeded`. The executor hashes captured output and discards it before returning the receipt.

On timeout it terminates the Docker client, force-removes the generated container name, and returns `capability_timeout`. On non-zero exit it returns `capability_command_failed` with the exit status but without raw output. Cleanup failure is separately recorded as `capability_cleanup_failed` and blocks the receipt.

### `capability_probe/`

Contains a local Go probe source and a `FROM scratch` Dockerfile. The build is fully local:

```text
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build
docker build --network none -t local/openclaw-capability-probe:<source-hash> .
```

The probe has fixed, test-only modes selected by its fixed profile entrypoint:

- `success`: reads bounded stdin and exits 0.
- `network`: attempts a TCP dial and exits with a known failure code when `--network none` works.
- `readonly`: attempts a write outside `/tmp` and exits with a known failure code when the root filesystem is read-only.
- `sleep`: exceeds the profile timeout.
- `output`: emits more than the output limit.

The probe contains no shell and no external process launcher.

## Capability Profiles

The Phase A registry contains only local probe profiles. A profile specifies the exact local image reference and expected Docker image ID; a mutable tag alone is never trusted. Tests build the probe, inspect its image ID, and inject that exact ID into the registry.

No profile has network, browser, subprocess, cache write, host file write, channel send, publish, or production-switch permission. The host executor launching Docker is trusted infrastructure, not a capability delegated to the runner.

## Docker Image Identity

Before execution the executor runs a fixed `docker image inspect` argument array and compares the returned image ID with `CapabilityProfile.expected_image_id`. Mismatch returns `capability_image_identity_mismatch` before `docker run`. The receipt records only the verified image ID.

## Receipt Semantics

| Result | Meaning | Starts container |
|---|---|---|
| `passed` | Fixed command completed inside all limits | Yes |
| `blocked` / `capability_profile_unknown` | Profile is absent | No |
| `blocked` / `capability_input_too_large` | Input exceeds profile limit | No |
| `blocked` / `capability_image_identity_mismatch` | Local image differs from profile | No |
| `blocked` / `capability_timeout` | Deadline exceeded and cleanup attempted | Yes |
| `blocked` / `capability_output_limit_exceeded` | Captured output exceeds cap | Yes |
| `blocked` / `capability_command_failed` | Probe returned non-zero | Yes |
| `blocked` / `capability_cleanup_failed` | Container cleanup could not be confirmed | Yes |
| `blocked` / `capability_runtime_unavailable` | Docker is absent or unusable | No |

All receipts are fail-closed. A receipt never becomes a `ControlledCollectorEnvelope` in Phase A.

## Validation and Audit Rules

- Request input must be bytes and within the fixed profile byte limit.
- Profile ID is an exact registry key.
- Docker arguments are constructed from constants and profile values only; no shell is invoked.
- The process environment sent to the container is the explicit two-variable allowlist only.
- Captured output is hashed with SHA-256 and never copied to logs, receipts, evidence, or tests.
- Execution trace records booleans and numeric limits: `network_none`, `read_only_rootfs`, `no_new_privileges`, `all_capabilities_dropped`, `host_mount_count=0`, `container_env_count=2`, and configured resource limits.
- Host temporary state is held in a per-execution temporary directory owned by the executor and is removed before a receipt is returned. Its path is never recorded.
- A cleanup error is a blocking result even when the command otherwise exits 0.

## Test Strategy

Tests use the locally-built scratch probe and real Docker engine, plus unit fakes for unavailable runtime paths.

1. Unknown profile and oversized input fail before any Docker command is invoked.
2. Image ID mismatch fails before `docker run`.
3. Success profile returns a hash-only receipt with all offline enforcement trace fields true.
4. Network probe fails with `capability_command_failed`; receipt confirms `network_none=true` and has no raw output.
5. Read-only probe cannot write outside `/tmp`.
6. Sleep probe returns `capability_timeout`; generated container is absent after cleanup.
7. Output probe returns `capability_output_limit_exceeded`; raw marker text is absent from serialized receipt.
8. Argument-builder tests prove no host mount, Docker socket, privileged flag, host network, shell, extra environment, or capability add appears.
9. Missing/unusable Docker returns `capability_runtime_unavailable` without a host process crash.
10. Existing 186 intelligence-pipeline tests remain green in both OpenClaw instances.

## Rollout

1. Build and test the executor as an isolated shadow module; do not wire it into `ControlledCollectorRunner`.
2. Record local Docker capability evidence in the shadow audit only.
3. Run default/work test suites, adversarial probe tests, compile checks, hash comparison, and CodeRabbit review.
4. Update public documentation and Obsidian without enabling a real runner.
5. Begin a separate Phase B design only after this milestone is sealed.

## Acceptance Criteria

- No container executed by Phase A can open a network connection, access host mounts, inherit secrets, write its root filesystem, add privileges, or survive the configured limits.
- All runtime outputs are hash-only and cleanup is verified.
- The executor is not registered to any real controlled source.
- Existing source collection, QA, publishing, V10, schedules, and production switches remain unchanged.
- Both OpenClaw instances pass their full suites and final CodeRabbit review has 0 unresolved issues.
