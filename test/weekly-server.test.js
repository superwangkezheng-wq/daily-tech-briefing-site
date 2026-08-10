const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  createWeeklySnapshot,
  createWeeklyV2Snapshot,
  createWeeklyV3Snapshot,
  createWeeklyV4Snapshot,
  createWeeklyV41Snapshot,
} = require("./helpers/weekly-fixture");
const { createValidPng } = require("./helpers/image-fixture");
const { writeV41BundleManifest } = require("./helpers/weekly-bundle-fixture");
const { createZip, readZipEntries } = require("../src/ooxml");
const { buildWeeklyInsightCache } = require("../src/weekly-insight-index");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { createServer, SITE_CONFIG } = require("../server");

test("weekly routes enforce per-request preview authorization and keep feedback private", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-server-"));
  const original = {
    weeklySourceDir: SITE_CONFIG.weeklySourceDir,
    weeklyCacheDir: SITE_CONFIG.weeklyCacheDir,
    weeklyFeedbackDir: SITE_CONFIG.weeklyFeedbackDir,
    weeklyPreviewToken: SITE_CONFIG.weeklyPreviewToken,
    weeklyFeedbackToken: SITE_CONFIG.weeklyFeedbackToken,
  };
  SITE_CONFIG.weeklySourceDir = path.join(root, "source");
  SITE_CONFIG.weeklyCacheDir = path.join(root, "cache");
  SITE_CONFIG.weeklyFeedbackDir = path.join(root, "feedback");
  SITE_CONFIG.weeklyPreviewToken = "gate5-preview-secret";
  SITE_CONFIG.weeklyFeedbackToken = "gate5-feedback-secret";
  await fs.mkdir(SITE_CONFIG.weeklySourceDir, { recursive: true });
  const internal = createWeeklyV2Snapshot({
    content: { title: "内部预览：不得出现在公开 API" },
  });
  const internalV3 = createWeeklyV3Snapshot();
  const internalV4 = createWeeklyV4Snapshot();
  const internalV41Base = createWeeklyV41Snapshot({
    artifact_id: "wsi-internal-v4-1-route-test",
    source_run_id: "weekly-run-internal-v4-1-route-test",
  });
  const internalV41Topic = internalV41Base.content.topics[0];
  const internalV41Target = internalV41Topic.facts.sections[1];
  const internalV41ArchitectureTarget = internalV41Topic.facts.sections[3];
  const internalV41Image = createValidPng(1);
  const internalV41Media = {
    id: "internal-v4-1-route-image",
    kind: "image",
    asset_ref: "media/agentforger-csrf-comparison.png",
    asset_sha256: crypto.createHash("sha256").update(internalV41Image).digest("hex"),
    mime_type: "image/png",
    size_bytes: internalV41Image.length,
    width: 1,
    height: 1,
    alt: "仅限内部预览的 Agent 执行链图",
    caption: "这张测试图只用于验证 v4.1 私有媒体路由。",
    source_label: "example.com",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "第三方版权；仅限内部预览。",
    target_section_id: internalV41Target.section_id,
    evidence_ids: ["evidence-v4"],
    rights_scope: "internal_only",
    rights_basis: "未取得公开转载许可。",
    logic_type: "flow",
    logic_summary: "仅验证私有媒体随受保护页面交付。",
  };
  const internalV41ArchitectureMedia = {
    ...internalV41Media,
    id: "internal-v4-1-route-architecture",
    kind: "architecture",
    asset_ref: "media/agent-control-chain.png",
    target_section_id: internalV41ArchitectureTarget.section_id,
    rights_scope: "public_allowed",
    rights_basis: "测试原创关系图。",
    logic_type: "stack",
    logic_summary: "测试架构图用于验证固定 v4.1 bundle 路径。",
  };
  const internalV41 = createWeeklyV41Snapshot({
    artifact_id: internalV41Base.artifact_id,
    source_run_id: internalV41Base.source_run_id,
    content: {
      ...internalV41Base.content,
      topics: [{
        ...internalV41Topic,
        facts: {
          ...internalV41Topic.facts,
          sections: internalV41Topic.facts.sections.map((section) => {
            if (section.section_id === internalV41Target.section_id) {
              return { ...section, media_ids: [internalV41Media.id] };
            }
            if (section.section_id === internalV41ArchitectureTarget.section_id) {
              return { ...section, media_ids: [internalV41ArchitectureMedia.id] };
            }
            return section;
          }),
        },
      }],
      media: [internalV41Media, internalV41ArchitectureMedia],
    },
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
  const internalV41BundleRoot = path.join(root, "internal-v4-1-bundle");
  const internalV41BundleMediaDir = path.join(internalV41BundleRoot, "media");
  await fs.mkdir(internalV41BundleMediaDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(internalV41BundleMediaDir, "agentforger-csrf-comparison.png"),
      internalV41Image,
    ),
    fs.writeFile(
      path.join(internalV41BundleMediaDir, "agent-control-chain.png"),
      internalV41Image,
    ),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal.json"), JSON.stringify(internal)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal-v3.json"), JSON.stringify(internalV3)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal-v4.json"), JSON.stringify(internalV4)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "public.json"), JSON.stringify(publicSnapshot)),
  ]);
  await writeV41BundleManifest(internalV41BundleRoot, internalV41, {
    snapshotPath: "weekly-insight-publication-v4.json",
  });
  await publishWeeklySnapshot(internalV41, {
    publishRoot: SITE_CONFIG.weeklyCacheDir,
    mediaBundleRoot: internalV41BundleRoot,
    sourcePath: path.join(internalV41BundleRoot, "weekly-insight-publication-v4.json"),
  });
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
  assert.equal(publicIndex.insights.some((item) => item.artifact_id === internalV41.artifact_id), false);
  assert.doesNotMatch(JSON.stringify(publicIndex), /内部预览/);
  assert.equal(publicIndex.insights[0].publication.authorization_id, undefined);

  const previewIndex = await fetch(`${base}/api/insights?preview_token=gate5-preview-secret`).then((res) => res.json());
  assert.equal(previewIndex.count, 5);
  const internalIndexItem = previewIndex.insights.find((item) => item.artifact_id === internal.artifact_id);
  assert.equal(internalIndexItem.content_schema_version, "weekly-insight-publication/v2");
  assert.equal(internalIndexItem.selected_topics, 1);
  const v3IndexItem = previewIndex.insights.find((item) => item.artifact_id === internalV3.artifact_id);
  assert.equal(v3IndexItem.content_schema_version, "weekly-insight-publication/v3");
  assert.equal(v3IndexItem.selected_topics, 1);
  const v4IndexItem = previewIndex.insights.find((item) => item.artifact_id === internalV4.artifact_id);
  assert.equal(v4IndexItem.content_schema_version, "weekly-insight-publication/v4");
  assert.equal(v4IndexItem.issue_kind, "topic_preview");
  assert.equal(v4IndexItem.selected_topics, 1);
  assert.deepEqual(v4IndexItem.reader_sections, ["事实与案例", "发现", "产业影响", "战略建议"]);
  assert.equal(
    previewIndex.insights.find((item) => item.artifact_id === internalV41.artifact_id)?.version,
    "4.1",
  );
  assert.deepEqual(
    previewIndex.insights.find((item) => item.artifact_id === internalV41.artifact_id)?.reader_sections,
    ["事实与案例", "关键发现", "产业影响", "战略建议"],
  );
  assert.equal((await fetch(`${base}/insights/${internal.artifact_id}`)).status, 404);
  const internalPage = await fetch(`${base}/insights/${internal.artifact_id}?preview_token=gate5-preview-secret`);
  assert.equal(internalPage.status, 200);
  assert.match(await internalPage.text(), /内部预览/);
  assert.equal((await fetch(`${base}/insights/${internalV3.artifact_id}`)).status, 404);
  const v3Page = await fetch(`${base}/insights/${internalV3.artifact_id}?preview_token=gate5-preview-secret`);
  assert.equal(v3Page.status, 200);
  const v3Html = await v3Page.text();
  assert.match(v3Html, /事实与案例/);
  assert.doesNotMatch(v3Html, /内部预览|联想中国区启示|期级战略建议/);
  assert.equal((await fetch(`${base}/insights/${internalV4.artifact_id}`)).status, 404);
  const v4Page = await fetch(`${base}/insights/${internalV4.artifact_id}?preview_token=gate5-preview-secret`);
  assert.equal(v4Page.status, 200);
  const v4Html = await v4Page.text();
  assert.match(v4Html, /事实与案例/);
  assert.match(v4Html, /专题 01\/01/);
  assert.doesNotMatch(v4Html, /dependency|面向整期|期级战略建议/);
  assert.equal((await fetch(`${base}/insights/${internalV41.artifact_id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/insights/${internalV41.artifact_id}`)).status, 404);
  assert.equal((await fetch(`${base}/api/insights/${internalV41.artifact_id}/word`)).status, 404);
  const v41Page = await fetch(`${base}/insights/${internalV41.artifact_id}?preview_token=gate5-preview-secret`);
  assert.equal(v41Page.status, 200);
  const v41Html = await v41Page.text();
  assert.ok(v41Html.includes(internalV41Image.toString("base64")));
  assert.match(v41Html, />通过 Codex 反馈</);
  assert.match(v41Html, />上传修改后 Word</);
  assert.doesNotMatch(v41Html, />提交校准反馈</);
  assert.equal(
    (await fetch(`${base}/api/insights/${internalV41.artifact_id}?preview_token=gate5-preview-secret`)).status,
    200,
  );
  const v41Word = await fetch(
    `${base}/api/insights/${internalV41.artifact_id}/word?preview_token=gate5-preview-secret`,
  );
  assert.equal(v41Word.status, 200);
  assert.match(v41Word.headers.get("content-type"), /wordprocessingml/);
  const v41SystemWord = Buffer.from(await v41Word.arrayBuffer());
  const publicMediaRoute = await fetch(`${base}/weekly-assets/agentforger-csrf-comparison.png`);
  assert.doesNotMatch(publicMediaRoute.headers.get("content-type") || "", /^image\//);
  assert.notDeepEqual(Buffer.from(await publicMediaRoute.arrayBuffer()), internalV41Image);

  const internalApi = await fetch(`${base}/api/insights/${internal.artifact_id}?preview_token=gate5-preview-secret`).then((res) => res.json());
  assert.equal(internalApi.approval, undefined);
  assert.equal(internalApi.approved_candidate_sha256, undefined);
  assert.equal(internalApi.publication.authorization_id, undefined);

  assert.equal((await fetch(`${base}/api/insights/${internal.artifact_id}/word`)).status, 404);
  const word = await fetch(`${base}/api/insights/${internal.artifact_id}/word?preview_token=gate5-preview-secret`);
  assert.equal(word.status, 200);
  assert.match(word.headers.get("content-type"), /wordprocessingml/);
  const v3Word = await fetch(`${base}/api/insights/${internalV3.artifact_id}/word?preview_token=gate5-preview-secret`);
  assert.equal(v3Word.status, 200);
  assert.match(v3Word.headers.get("content-type"), /wordprocessingml/);
  assert.equal((await fetch(`${base}/api/insights/${internalV4.artifact_id}/word`)).status, 404);
  const v4Word = await fetch(`${base}/api/insights/${internalV4.artifact_id}/word?preview_token=gate5-preview-secret`);
  assert.equal(v4Word.status, 200);
  assert.match(v4Word.headers.get("content-type"), /wordprocessingml/);

  const unauthorizedFeedback = await fetch(`${base}/api/insights/${internalV41.artifact_id}/feedback?preview_token=gate5-preview-secret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feedbackId: "019d1234-5678-7abc-8def-0123456789ab", editedDocxBase64: v41SystemWord.toString("base64") }),
  });
  assert.equal(unauthorizedFeedback.status, 404);
  const editedEntries = readZipEntries(v41SystemWord);
  const editedDocument = editedEntries.get("word/document.xml").toString("utf8");
  assert.match(editedDocument, /背景与原因在此时同时聚集/);
  editedEntries.set(
    "word/document.xml",
    Buffer.from(editedDocument.replace("背景与原因在此时同时聚集", "背景、原因与时机在此时同时聚集")),
  );
  const feedbackId = "019d1234-5678-7abc-8def-0123456789ab";
  const feedback = await fetch(`${base}/api/insights/${internalV41.artifact_id}/feedback?preview_token=gate5-preview-secret`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-weekly-feedback-token": "gate5-feedback-secret",
    },
    body: JSON.stringify({
      feedbackId,
      editedDocxBase64: createZip([...editedEntries.entries()]).toString("base64"),
    }),
  });
  assert.equal(feedback.status, 201);
  const feedbackBody = await feedback.json();
  assert.equal(feedbackBody.receipt.artifact_id, internalV41.artifact_id);
  assert.equal(feedbackBody.receipt.draft_content_sha256, internalV41.content_sha256);
  assert.deepEqual(feedbackBody.receipt.feedback_areas, ["findings"]);
  assert.equal(feedbackBody.receipt.calibration_status, "pending_review");
  const bundlePath = path.join(SITE_CONFIG.weeklyFeedbackDir, internalV41.artifact_id, feedbackId);
  assert.deepEqual((await fs.readdir(bundlePath)).sort(), [
    "adapter-record.json",
    "human-final.docx",
    "outbox-manifest.json",
    "system-draft.docx",
  ]);
  const outboxManifest = JSON.parse(await fs.readFile(path.join(bundlePath, "outbox-manifest.json"), "utf8"));
  const wbrReceipt = {
    status: "written",
    feedback_id: feedbackId,
    artifact_id: internalV41.artifact_id,
    source_run_id: internalV41.source_run_id,
    draft_content_sha256: internalV41.content_sha256,
    bundle_sha256: "a".repeat(64),
    bundle_path: "/private/wbr/path/must-not-be-persisted",
    written_at: "2026-08-09T12:00:00+08:00",
  };
  const ackRequest = (receipt = wbrReceipt) => fetch(`${base}/api/insights/${internalV41.artifact_id}/feedback-ack?preview_token=gate5-preview-secret`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-weekly-feedback-token": "gate5-feedback-secret",
    },
    body: JSON.stringify({
      feedbackId,
      bundleSha256: outboxManifest.bundle_sha256,
      wbrReceipt: receipt,
    }),
  });
  assert.equal((await ackRequest()).status, 201);
  assert.equal((await ackRequest({ ...wbrReceipt, status: "already_present", written_at: null })).status, 200);
  const ackRecord = JSON.parse(await fs.readFile(path.join(bundlePath, "ack.json"), "utf8"));
  assert.equal(ackRecord.wbr_receipt.artifact_id, internalV41.artifact_id);
  assert.equal(Object.prototype.hasOwnProperty.call(ackRecord.wbr_receipt, "bundle_path"), false);

  const unchangedFeedback = await fetch(`${base}/api/insights/${internalV41.artifact_id}/feedback?preview_token=gate5-preview-secret`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-weekly-feedback-token": "gate5-feedback-secret",
    },
    body: JSON.stringify({
      feedbackId: "019d1234-5678-7abc-8def-0123456789ac",
      editedDocxBase64: v41SystemWord.toString("base64"),
    }),
  });
  assert.equal(unchangedFeedback.status, 400);
  assert.match((await unchangedFeedback.json()).error, /does not contain any changes/i);

  const blockedOutbox = path.join(root, "blocked-outbox");
  await fs.writeFile(blockedOutbox, "not a directory");
  SITE_CONFIG.weeklyFeedbackDir = blockedOutbox;
  const originalConsoleError = console.error;
  console.error = () => {};
  let failedFeedback;
  try {
    failedFeedback = await fetch(`${base}/api/insights/${internalV41.artifact_id}/feedback?preview_token=gate5-preview-secret`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-weekly-feedback-token": "gate5-feedback-secret",
      },
      body: JSON.stringify({
        feedbackId: "019d1234-5678-7abc-8def-0123456789ad",
        editedDocxBase64: createZip([...editedEntries.entries()]).toString("base64"),
      }),
    });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failedFeedback.status, 500);
  const failedFeedbackBody = await failedFeedback.json();
  assert.equal(failedFeedbackBody.error, "Word 反馈处理失败，请稍后重试");
  assert.doesNotMatch(JSON.stringify(failedFeedbackBody), /blocked-outbox|ENOTDIR|mkdir/i);
});
