const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createZip, readZipEntries } = require("../src/ooxml");
const { validateWeeklySnapshot } = require("../src/weekly-insight-contract");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { saveWeeklyFeedback } = require("../src/weekly-feedback");
const { buildWeeklyInsightCache, getWeeklyInsights } = require("../src/weekly-insight-index");
const { createWeeklySnapshot, createWeeklyV2Snapshot } = require("./helpers/weekly-fixture");

test("accepts the topic-first v2 contract while preserving v1", () => {
  const v2 = validateWeeklySnapshot(createWeeklyV2Snapshot());
  assert.equal(v2.schema_version, "weekly-insight-publication/v2");
  assert.equal(v2.content.selected_topics, 1);
  assert.equal(v2.content.topics[0].article_sections.length, 3);
  assert.ok(v2.section_anchors.includes("thesis_agent_context_state_control_industry"));
  assert.ok(v2.section_anchors.includes("recommendation_context_pilot_recommendation"));

  const v1 = validateWeeklySnapshot(createWeeklySnapshot());
  assert.equal(v1.schema_version, "weekly-insight-publication/v1");
  assert.equal(v1.content.selected_theses, 2);
});

test("v2 enforces topic counts, required roles, strict fields, and references", () => {
  const base = createWeeklyV2Snapshot();
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({ content: { selected_topics: 2 } })),
    /selected_topics.*topics/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({
      content: { topics: [{ ...base.content.topics[0], article_sections: base.content.topics[0].article_sections.slice(0, 2) }] },
    })),
    /article_sections/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({
      content: { topics: [{ ...base.content.topics[0], basis_thesis_ids: ["private"] }] },
    })),
    /unknown field.*basis_thesis_ids/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({
      content: {
        topics: [{
          ...base.content.topics[0],
          article_sections: base.content.topics[0].article_sections.map((section, index) => (
            index === 0 ? { ...section, evidence_ids: ["missing"] } : section
          )),
        }],
      },
    })),
    /unknown evidence id/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({ content: { strategic_recommendations: undefined } })),
    /strategic_recommendations.*array/i,
  );
});

test("v2 accepts zero through five topics without inventing content", () => {
  const base = createWeeklyV2Snapshot();
  const cloneTopic = (index) => {
    const topic = structuredClone(base.content.topics[0]);
    topic.topic_id = `topic-agent-context-state-${index}`;
    topic.thesis_id = `thesis-agent-context-state-${index}`;
    for (const section of topic.article_sections) section.anchor = `${section.anchor.slice(0, 60)}_${index}`;
    topic.industry_impact.anchor = `topic_${index}_industry`;
    topic.lenovo_china_implication.anchor = `topic_${index}_lenovo`;
    return topic;
  };
  const empty = validateWeeklySnapshot(createWeeklyV2Snapshot({
    content: { status: "no_selection", selected_topics: 0, topics: [], strategic_recommendations: [] },
  }));
  assert.equal(empty.content.topics.length, 0);
  for (let count = 1; count <= 5; count += 1) {
    const topics = Array.from({ length: count }, (_, index) => cloneTopic(index + 1));
    assert.equal(validateWeeklySnapshot(createWeeklyV2Snapshot({
      content: { selected_topics: count, topics },
    })).content.topics.length, count);
  }
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV2Snapshot({ content: { selected_topics: 6 } })),
    /0\.\.5/,
  );
});

test("v2 HTML and DOCX share topic-first reading order and never expose audit basis", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v2-publish-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV2Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  assert.equal(receipt.content_schema_version, "weekly-insight-publication/v2");
  assert.equal(receipt.selected_topics, 1);
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const docx = await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`));
  const documentXml = readZipEntries(docx).get("word/document.xml").toString("utf8");

  const htmlOrder = [
    'id="weekly-synthesis"',
    'id="topic-agent-context-state"',
    'id="thesis_agent_context_state_control_industry"',
    'id="thesis_agent_context_state_control_lenovo"',
    'id="strategic-recommendations"',
    'id="evidence-sources"',
  ];
  const wordOrder = ["本期技术主线", "同一个模型为什么能差三倍", "产业影响", "联想中国区启示", "期级战略建议", "证据来源"];
  for (const [document, labels] of [[html, htmlOrder], [documentXml, wordOrder]]) {
    let prior = -1;
    for (const label of labels) {
      const next = document.indexOf(label);
      assert.ok(next > prior, `${label} must follow the previous reading layer`);
      prior = next;
    }
    assert.doesNotMatch(document, /basis_thesis_ids|建议依据|战略动态\s*1/);
  }
  assert.equal((html.match(/id="strategic-recommendations"/g) || []).length, 1);
  assert.doesNotMatch(html, /topic-recommendation/);
  assert.match(html, /class="topic-analysis-pair"/);
  assert.deepEqual(receipt.section_anchors, validateWeeklySnapshot(snapshot).section_anchors);
});

test("v2 edited Word produces section-level topic and issue recommendation diffs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v2-feedback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV2Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const documentXml = entries.get("word/document.xml").toString("utf8")
    .replace("平台竞争将从模型选择扩展到状态质量、回放和成本归因。", "平台竞争将扩展到状态质量、回放、成本归因与隐私控制。")
    .replace("选择两类可回放任务，比较成功率、成本与状态错误。", "选择三类可回放任务，比较成功率、成本与状态错误。");
  entries.set("word/document.xml", Buffer.from(documentXml));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "修改产业影响与期级建议。",
    editedDocx: createZip([...entries.entries()]),
  });
  assert.deepEqual(result.section_diffs.map((item) => item.anchor), [
    "thesis_agent_context_state_control_industry",
    "recommendation_context_pilot_recommendation",
  ]);
});

test("the existing cache scan indexes v2 metadata but keeps internal previews hidden", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v2-index-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourceDir = path.join(root, "source");
  const publishRoot = path.join(root, "cache");
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(path.join(sourceDir, "w31-v2.json"), JSON.stringify(createWeeklyV2Snapshot()));

  const built = await buildWeeklyInsightCache({ sourceDir, publishRoot });
  assert.equal(built.published.length, 1);
  assert.equal(built.published[0].content_schema_version, "weekly-insight-publication/v2");
  assert.equal(built.published[0].selected_topics, 1);
  assert.equal((await getWeeklyInsights({ publishRoot, includeUnpublished: false })).count, 0);
  assert.equal((await getWeeklyInsights({ publishRoot, includeUnpublished: true })).count, 1);
});

test("v2 supports zero recommendations and escapes long reader-facing copy", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v2-edge-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV2Snapshot();
  const snapshot = createWeeklyV2Snapshot({
    content: {
      title: `<script>alert(1)</script>${"长标题".repeat(90)}`,
      strategic_recommendations: [],
      media: [{ ...base.content.media[0], src: null }],
    },
  });
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /id="strategic-recommendations"/);
  assert.match(html, /图像暂不可用/);
});
