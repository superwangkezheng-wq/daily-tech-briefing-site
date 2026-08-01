const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWeeklySnapshot, createWeeklyV2Snapshot } = require("./helpers/weekly-fixture");
const { buildWeeklyInsightCache } = require("../src/weekly-insight-index");
const { createServer, SITE_CONFIG } = require("../server");

test("weekly routes enforce per-request preview authorization and keep feedback private", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-server-"));
  const original = {
    weeklySourceDir: SITE_CONFIG.weeklySourceDir,
    weeklyCacheDir: SITE_CONFIG.weeklyCacheDir,
    weeklyFeedbackDir: SITE_CONFIG.weeklyFeedbackDir,
    weeklyPreviewToken: SITE_CONFIG.weeklyPreviewToken,
  };
  SITE_CONFIG.weeklySourceDir = path.join(root, "source");
  SITE_CONFIG.weeklyCacheDir = path.join(root, "cache");
  SITE_CONFIG.weeklyFeedbackDir = path.join(root, "feedback");
  SITE_CONFIG.weeklyPreviewToken = "gate5-preview-secret";
  await fs.mkdir(SITE_CONFIG.weeklySourceDir, { recursive: true });
  const internal = createWeeklyV2Snapshot({
    content: { title: "内部预览：不得出现在公开 API" },
  });
  const publicSnapshot = createWeeklySnapshot({
    artifact_id: "wsi-public-2026-w29",
    source_run_id: "weekly-run-public-w29",
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: "public-release-w29",
    },
    content: {
      title: "公开周度洞察",
      period: {
        start: "2026-07-13",
        end: "2026-07-19",
        label: "2026 W29",
        as_of: "2026-07-19T23:59:59+08:00",
      },
    },
  });
  await Promise.all([
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal.json"), JSON.stringify(internal)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "public.json"), JSON.stringify(publicSnapshot)),
  ]);
  await buildWeeklyInsightCache();

  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Object.assign(SITE_CONFIG, original);
    await fs.rm(root, { recursive: true, force: true });
  });

  const publicIndexResponse = await fetch(`${base}/api/insights`);
  const publicIndex = await publicIndexResponse.json();
  assert.equal(publicIndex.count, 1);
  assert.equal(publicIndex.insights[0].artifact_id, publicSnapshot.artifact_id);
  assert.doesNotMatch(JSON.stringify(publicIndex), /内部预览/);
  assert.equal(publicIndex.insights[0].publication.authorization_id, undefined);

  const previewIndex = await fetch(`${base}/api/insights?preview_token=gate5-preview-secret`).then((res) => res.json());
  assert.equal(previewIndex.count, 2);
  const internalIndexItem = previewIndex.insights.find((item) => item.artifact_id === internal.artifact_id);
  assert.equal(internalIndexItem.content_schema_version, "weekly-insight-publication/v2");
  assert.equal(internalIndexItem.selected_topics, 1);
  assert.equal((await fetch(`${base}/insights/${internal.artifact_id}`)).status, 404);
  const internalPage = await fetch(`${base}/insights/${internal.artifact_id}?preview_token=gate5-preview-secret`);
  assert.equal(internalPage.status, 200);
  assert.match(await internalPage.text(), /内部预览/);

  const internalApi = await fetch(`${base}/api/insights/${internal.artifact_id}?preview_token=gate5-preview-secret`).then((res) => res.json());
  assert.equal(internalApi.approval, undefined);
  assert.equal(internalApi.approved_candidate_sha256, undefined);
  assert.equal(internalApi.publication.authorization_id, undefined);

  assert.equal((await fetch(`${base}/api/insights/${internal.artifact_id}/word`)).status, 404);
  const word = await fetch(`${base}/api/insights/${internal.artifact_id}/word?preview_token=gate5-preview-secret`);
  assert.equal(word.status, 200);
  assert.match(word.headers.get("content-type"), /wordprocessingml/);

  const unauthorizedFeedback = await fetch(`${base}/api/insights/${internal.artifact_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionAnchor: "overall", comment: "should not store" }),
  });
  assert.equal(unauthorizedFeedback.status, 404);
  const feedback = await fetch(`${base}/api/insights/${internal.artifact_id}/feedback?preview_token=gate5-preview-secret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sectionAnchor: "thesis_agent_context_state_control_what_changed",
      comment: "请校准事实段落。",
    }),
  });
  assert.equal(feedback.status, 201);
  const feedbackBody = await feedback.json();
  assert.equal(feedbackBody.receipt.artifact_id, internal.artifact_id);
  assert.equal(feedbackBody.receipt.draft_content_sha256, internal.content_sha256);
  assert.equal(Object.prototype.hasOwnProperty.call(feedbackBody.receipt, "file_path"), false);
  assert.equal((await fs.readdir(SITE_CONFIG.weeklyFeedbackDir)).length, 1);
});
