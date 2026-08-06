const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const jpegCodec = require("jpeg-js");
const { readZipEntries } = require("../src/ooxml");
const { createZip } = require("../src/ooxml");
const { validateWeeklySnapshot } = require("../src/weekly-insight-contract");
const { publishWeeklySnapshot, loadWeeklyMediaAssets } = require("../src/weekly-insight-publisher");
const { renderWeeklyDocx } = require("../src/weekly-insight-renderer");
const { saveWeeklyFeedback } = require("../src/weekly-feedback");
const { createWeeklySnapshot, createWeeklyV2Snapshot, createWeeklyV3Snapshot } = require("./helpers/weekly-fixture");

test("accepts v3 facts, findings, impact, and issue recommendation while preserving v1 and v2", () => {
  const v3 = validateWeeklySnapshot(createWeeklyV3Snapshot());
  assert.equal(v3.schema_version, "weekly-insight-publication/v3");
  assert.deepEqual(v3.section_anchors, [
    "thesis_runtime_001_facts",
    "finding-agent-volume",
    "thesis_runtime_001_industry",
    "recommendation_agent_governance_recommendation",
  ]);
  assert.equal(v3.content.topics[0].facts.terms[0].term, "CSRF");
  assert.equal(validateWeeklySnapshot(createWeeklyV2Snapshot()).schema_version, "weekly-insight-publication/v2");
  assert.equal(validateWeeklySnapshot(createWeeklySnapshot()).schema_version, "weekly-insight-publication/v1");
});

test("v3 enforces one to three findings, strict topic fields, references, and visual semantics", () => {
  const base = createWeeklyV3Snapshot();
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics: [{ ...base.content.topics[0], findings: [] }] } })),
    /one to three|1\.\.3|findings/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics: [{ ...base.content.topics[0], kicker: "private" }] } })),
    /unknown field.*kicker/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics: [{
      ...base.content.topics[0],
      facts: { ...base.content.topics[0].facts, headline: "not allowed" },
    }] } })),
    /unknown field.*headline/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics: [{
      ...base.content.topics[0],
      findings: [{ ...base.content.topics[0].findings[0], paragraphs: [] }],
    }] } })),
    /findings\[0\]\.paragraphs/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { media: [{ ...base.content.media[0], logic_summary: undefined }] } })),
    /logic_summary/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { media: [{ ...base.content.media[0], logic_type: "decorative" }] } })),
    /logic_type/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics: [{ ...base.content.topics[0], findings: [{ ...base.content.topics[0].findings[0], evidence_ids: ["missing"] }] }] } })),
    /unknown evidence id/i,
  );
  for (const [topics, expected] of [
    [[null], /Invalid content\.topics\[0\]$/],
    [[{ ...base.content.topics[0], facts: null }], /Invalid content\.topics\[0\]\.facts$/],
    [[{ ...base.content.topics[0], findings: [false] }], /Invalid content\.topics\[0\]\.findings\[0\]$/],
  ]) {
    assert.throws(() => validateWeeklySnapshot(createWeeklyV3Snapshot({ content: { topics } })), expected);
  }
});

test("v3 HTML and DOCX use the same reading order without preview or legacy labels", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v3-publish-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV3Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const documentXml = readZipEntries(
    await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)),
  );
  const wordDocument = documentXml.get("word/document.xml").toString("utf8");
  const htmlOrder = [
    'id="thesis_runtime_001_facts"',
    'id="finding-agent-volume"',
    'id="thesis_runtime_001_industry"',
    'id="strategic-recommendations"',
    'id="evidence-sources"',
  ];
  const wordOrder = ["事实与案例", "Agent 数量增长推动统一治理", "产业影响", "战略建议", "证据来源"];
  for (const [document, labels] of [[html, htmlOrder], [wordDocument, wordOrder]]) {
    let prior = -1;
    for (const label of labels) {
      const next = document.indexOf(label);
      assert.ok(next > prior, `${label} must follow the previous reading layer`);
      prior = next;
    }
    assert.doesNotMatch(document, /INTERNAL PREVIEW|内部预览|Word 可编辑预览|联想中国区启示|期级战略建议|kicker|standfirst/);
    assert.doesNotMatch(document, /让模型进入万全推理加速链路/);
  }
  for (const copy of ["CSRF", "攻击者诱导已登录用户的浏览器提交未经用户确认的请求", "dependency", "Agent 调用连接器访问企业系统"]) {
    assert.match(html, new RegExp(copy));
    assert.match(wordDocument, new RegExp(copy));
  }
  assert.ok(documentXml.has("word/media/1-architecture-agent-governance.png"));
  assert.match(wordDocument, /<w:drawing>/);
  assert.match(documentXml.get("word/_rels/document.xml.rels").toString("utf8"), /relationships\/image/);
  assert.equal((html.match(/id="strategic-recommendations"/g) || []).length, 1);
  assert.ok(wordDocument.indexOf("发现 1") < wordDocument.indexOf("Agent 数量增长推动统一治理"));
  assert.deepEqual(receipt.section_anchors, validateWeeklySnapshot(snapshot).section_anchors);
});

test("v3 media loading uses real JPEG dimensions and blocks unapproved or oversized remote assets", async () => {
  const snapshot = validateWeeklySnapshot(createWeeklyV3Snapshot());
  const jpeg = jpegCodec.encode({
    width: 120,
    height: 80,
    data: Buffer.alloc(120 * 80 * 4, 0xff),
  }, 80).data;
  const [loaded] = await loadWeeklyMediaAssets(snapshot, { loadMedia: async () => jpeg });
  assert.equal(loaded.width, 120);
  assert.equal(loaded.height, 80);

  const remote = createWeeklyV3Snapshot({ content: { media: [{
    ...snapshot.content.media[0],
    src: "https://cdn.example.com/architecture.jpg",
    source_url: "https://research.example.com/report",
  }] } });
  await assert.rejects(loadWeeklyMediaAssets(remote, {
    mediaAllowedHosts: ["assets.example.com"],
  }), /not allowlisted/i);
  let fetchOptions;
  await assert.rejects(loadWeeklyMediaAssets(remote, {
    mediaAllowedHosts: ["cdn.example.com"],
    lookupHost: async () => [{ address: "203.0.113.10", family: 4 }],
    fetchImpl: async (_url, options) => {
      fetchOptions = options;
      return new Response(new Uint8Array(64), { status: 200 });
    },
    mediaMaxBytes: 32,
  }), /exceeds 32 bytes/i);
  assert.equal(fetchOptions.redirect, "error");
});

test("v3 Word media keeps native size for small images and distinct package names", () => {
  const fixture = createWeeklyV3Snapshot();
  const snapshot = validateWeeklySnapshot(createWeeklyV3Snapshot({
    content: {
      media: [
        { ...fixture.content.media[0], id: "image/a" },
        { ...fixture.content.media[0], id: "image?a" },
      ],
      topics: [{
        ...fixture.content.topics[0],
        facts: {
          ...fixture.content.topics[0].facts,
          media_ids: ["image/a", "image?a"],
        },
      }],
    },
  }));
  const docx = renderWeeklyDocx(snapshot, { mediaAssets: [
    { id: "image/a", buffer: Buffer.from("one"), extension: "png", width: 100, height: 50 },
    { id: "image?a", buffer: Buffer.from("two"), extension: "png", width: 100, height: 50 },
  ] });
  const entries = readZipEntries(docx);
  assert.ok(entries.has("word/media/1-image-a.png"));
  assert.ok(entries.has("word/media/2-image-a.png"));
  assert.match(entries.get("word/document.xml").toString("utf8"), /<wp:extent cx="952500" cy="476250"\/>/);
});

test("v3 edited Word reports facts, findings, impact, and issue recommendation diffs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v3-feedback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV3Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  entries.set("word/document.xml", Buffer.from(entries.get("word/document.xml").toString("utf8")
    .replace("漏洞已修复，公开披露与修复时间均可回溯。", "漏洞已修复，公开披露、修复时间与影响边界均可回溯。")
    .replace("统一清单、最小权限、操作审计、环境隔离和停用能力", "统一清单、最小权限、操作审计、环境隔离、恢复和停用能力")
    .replace("统一清单、所有者、权限、运行记录、版本和停用入口", "统一清单、所有者、权限、运行记录、恢复记录、版本和停用入口")));
  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "校准事实、产业影响和战略建议。",
    editedDocx: createZip([...entries.entries()]),
  });
  assert.deepEqual(result.section_diffs.map((item) => item.anchor), [
    "thesis_runtime_001_facts",
    "thesis_runtime_001_industry",
    "recommendation_agent_governance_recommendation",
  ]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
});

test("v3 media failure leaves no HTML or Word half-publication", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v3-media-fail-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV3Snapshot();
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: root,
      loadMedia: async () => { throw new Error("simulated media failure"); },
    }),
    /simulated media failure/,
  );
  assert.deepEqual(await fs.readdir(root), []);
});
