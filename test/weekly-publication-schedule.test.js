const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { evaluateWeeklyRelease } = require("../src/weekly-publication-schedule");
const { buildWeeklyInsightCache } = require("../src/weekly-insight-index");
const { createWeeklyV3Snapshot } = require("./helpers/weekly-fixture");

function publicV3(overrides = {}) {
  return createWeeklyV3Snapshot({
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: "public-release-w31-v3",
    },
    ...overrides,
  });
}

test("default weekly release is the following Monday at 10:30 Asia/Shanghai", () => {
  const snapshot = publicV3();
  const early = evaluateWeeklyRelease(snapshot, { now: new Date("2026-08-03T02:29:59.000Z") });
  assert.equal(early.publish_at, "2026-08-03T10:30:00+08:00");
  assert.equal(early.eligible, false);
  const onTime = evaluateWeeklyRelease(snapshot, { now: new Date("2026-08-03T02:30:00.000Z") });
  assert.equal(onTime.eligible, true);
});

test("a recorded issue override can delay or hold but cannot weaken snapshot visibility or period", () => {
  const snapshot = publicV3();
  const identity = {
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    actor: "release-owner",
    recorded_at: "2026-08-03T09:00:00+08:00",
  };
  assert.equal(evaluateWeeklyRelease(snapshot, {
    now: new Date("2026-08-03T04:00:00.000Z"),
    override: { ...identity, publish_at: "2026-08-03T13:00:00+08:00" },
  }).eligible, false);
  assert.equal(evaluateWeeklyRelease(snapshot, {
    now: new Date("2026-08-04T04:00:00.000Z"),
    override: { ...identity, hold: true },
  }).reason, "held_by_override");
  assert.throws(
    () => evaluateWeeklyRelease(snapshot, { override: { ...identity, visibility: "internal_preview" } }),
    /visibility.*approved snapshot/i,
  );
  assert.throws(
    () => evaluateWeeklyRelease(snapshot, { override: { ...identity, period_start: "2026-07-20" } }),
    /period.*approved snapshot/i,
  );
});

test("existing scanner holds an early public issue without creating a blank artifact and still builds internal preview", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-schedule-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const publishRoot = path.join(root, "cache");
  await fs.mkdir(sourceDir, { recursive: true });
  const publicSnapshot = publicV3();
  const internalSnapshot = createWeeklyV3Snapshot({
    artifact_id: "wsi-2026-w31-v3-preview",
    source_run_id: "weekly-run-2026-w31-v3-preview",
  });
  await Promise.all([
    fs.writeFile(path.join(sourceDir, "public.json"), JSON.stringify(publicSnapshot)),
    fs.writeFile(path.join(sourceDir, "internal.json"), JSON.stringify(internalSnapshot)),
  ]);
  const result = await buildWeeklyInsightCache({
    sourceDir,
    publishRoot,
    now: new Date("2026-08-03T02:00:00.000Z"),
  });
  assert.deepEqual(result.published.map((item) => item.artifact_id), [internalSnapshot.artifact_id]);
  assert.deepEqual(result.deferred.map((item) => item.artifact_id), [publicSnapshot.artifact_id]);
  await assert.rejects(fs.stat(path.join(publishRoot, publicSnapshot.artifact_id)), { code: "ENOENT" });
});

test("a deferred issue is removed from the rebuilt index even when an older artifact directory remains", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-schedule-stale-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const publishRoot = path.join(root, "cache");
  await fs.mkdir(sourceDir, { recursive: true });
  const snapshot = publicV3();
  await fs.writeFile(path.join(sourceDir, "public.json"), JSON.stringify(snapshot));
  const released = await buildWeeklyInsightCache({
    sourceDir,
    publishRoot,
    now: new Date("2026-08-03T02:30:00.000Z"),
  });
  assert.deepEqual(released.published.map((item) => item.artifact_id), [snapshot.artifact_id]);
  const deferred = await buildWeeklyInsightCache({
    sourceDir,
    publishRoot,
    now: new Date("2026-08-03T02:00:00.000Z"),
  });
  assert.deepEqual(deferred.published, []);
  assert.deepEqual(deferred.deferred.map((item) => item.artifact_id), [snapshot.artifact_id]);
  assert.equal((await fs.stat(path.join(publishRoot, snapshot.artifact_id))).isDirectory(), true);
  const index = JSON.parse(await fs.readFile(path.join(publishRoot, "index.json"), "utf8"));
  assert.equal(index.count, 0);
});

test("existing scanner reads an audited per-issue release override sidecar", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-override-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const publishRoot = path.join(root, "cache");
  const overrideFile = path.join(root, "release-overrides.json");
  await fs.mkdir(sourceDir, { recursive: true });
  const snapshot = publicV3();
  await fs.writeFile(path.join(sourceDir, "public.json"), JSON.stringify(snapshot));
  await fs.writeFile(overrideFile, JSON.stringify({
    schema_version: "weekly-insight-release-overrides/v1",
    overrides: [{
      artifact_id: snapshot.artifact_id,
      source_run_id: snapshot.source_run_id,
      publish_at: "2026-08-03T09:45:00+08:00",
      actor: "release-owner",
      recorded_at: "2026-08-03T09:00:00+08:00",
    }],
  }));
  const result = await buildWeeklyInsightCache({
    sourceDir,
    publishRoot,
    releaseOverridesFile: overrideFile,
    now: new Date("2026-08-03T02:00:00.000Z"),
  });
  assert.deepEqual(result.published.map((item) => item.artifact_id), [snapshot.artifact_id]);
});
