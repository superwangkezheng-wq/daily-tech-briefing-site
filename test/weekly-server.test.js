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
  await fs.mkdir(path.join(SITE_CONFIG.weeklySourceDir, "media"), { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(SITE_CONFIG.weeklySourceDir, "media", "agentforger-csrf-comparison.png"),
      internalV41Image,
    ),
    fs.writeFile(
      path.join(SITE_CONFIG.weeklySourceDir, "media", "agent-control-chain.png"),
      internalV41Image,
    ),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal.json"), JSON.stringify(internal)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal-v3.json"), JSON.stringify(internalV3)),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "internal-v4.json"), JSON.stringify(internalV4)),
    fs.writeFile(
      path.join(SITE_CONFIG.weeklySourceDir, "weekly-insight-publication-v4.json"),
      JSON.stringify(internalV41),
    ),
    fs.writeFile(path.join(SITE_CONFIG.weeklySourceDir, "public.json"), JSON.stringify(publicSnapshot)),
  ]);
  await writeV41BundleManifest(SITE_CONFIG.weeklySourceDir, internalV41, {
    snapshotPath: "weekly-insight-publication-v4.json",
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
  assert.ok((await v41Page.text()).includes(internalV41Image.toString("base64")));
  assert.equal(
    (await fetch(`${base}/api/insights/${internalV41.artifact_id}?preview_token=gate5-preview-secret`)).status,
    200,
  );
  const v41Word = await fetch(
    `${base}/api/insights/${internalV41.artifact_id}/word?preview_token=gate5-preview-secret`,
  );
  assert.equal(v41Word.status, 200);
  assert.match(v41Word.headers.get("content-type"), /wordprocessingml/);
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
