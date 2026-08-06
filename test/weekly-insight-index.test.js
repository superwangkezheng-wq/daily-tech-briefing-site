const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWeeklySnapshot } = require("./helpers/weekly-fixture");
const {
  buildWeeklyInsightCache,
  getWeeklyInsights,
  getWeeklyInsight,
} = require("../src/weekly-insight-index");

test("indexes approved snapshots but hides internal previews from public reads", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-index-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const publishRoot = path.join(root, "cache");
  await fs.mkdir(sourceDir, { recursive: true });
  const internal = createWeeklySnapshot();
  const publicSnapshot = createWeeklySnapshot({
    artifact_id: "wsi-2026-w29",
    source_run_id: "weekly-run-2026-w29",
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: "public-release-2026-w29",
    },
    content: {
      period: {
        start: "2026-07-13",
        end: "2026-07-19",
        label: "2026 W29",
        as_of: "2026-07-19T23:59:59+08:00",
      },
    },
  });
  await Promise.all([
    fs.writeFile(path.join(sourceDir, "internal.json"), JSON.stringify(internal)),
    fs.writeFile(path.join(sourceDir, "public.json"), JSON.stringify(publicSnapshot)),
    fs.writeFile(path.join(sourceDir, "broken.json"), "{broken"),
    fs.writeFile(path.join(sourceDir, "malformed-publication.json"), JSON.stringify({
      schema_version: "weekly-insight-publication-v4",
    })),
  ]);

  const result = await buildWeeklyInsightCache({ sourceDir, publishRoot });
  assert.equal(result.published.length, 2);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.errors.map((item) => item.source_file).sort(), [
    "broken.json",
    "malformed-publication.json",
  ]);

  const publicIndex = await getWeeklyInsights({ publishRoot, includeUnpublished: false });
  assert.deepEqual(publicIndex.insights.map((item) => item.artifact_id), ["wsi-2026-w29"]);
  const previewIndex = await getWeeklyInsights({ publishRoot, includeUnpublished: true });
  assert.equal(previewIndex.insights.length, 2);
  assert.equal(await getWeeklyInsight(internal.artifact_id, { publishRoot, includeUnpublished: false }), null);
  assert.equal((await getWeeklyInsight(internal.artifact_id, { publishRoot, includeUnpublished: true })).artifact_id, internal.artifact_id);
});

test("does not accept a path traversal artifact id", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-traversal-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await getWeeklyInsight("../../private", { publishRoot: root, includeUnpublished: true }), null);
});
