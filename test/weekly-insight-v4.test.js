const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createZip, readZipEntries } = require("../src/ooxml");
const { validateWeeklySnapshot } = require("../src/weekly-insight-contract");
const { publishWeeklySnapshot, loadWeeklyMediaAssets } = require("../src/weekly-insight-publisher");
const { saveWeeklyFeedback } = require("../src/weekly-feedback");
const { createValidPng, createLargeOneBitPng } = require("./helpers/image-fixture");
const {
  createWeeklySnapshot,
  createWeeklyV2Snapshot,
  createWeeklyV3Snapshot,
  createWeeklyV4Snapshot,
} = require("./helpers/weekly-fixture");

function replaceTopic(snapshot, topic) {
  return createWeeklyV4Snapshot({
    topicCount: snapshot.content.selected_topics,
    content: { ...snapshot.content, topics: [topic, ...snapshot.content.topics.slice(1)] },
  });
}

test("accepts v4 rich topics and preserves v1 through v3 compatibility", () => {
  const snapshot = validateWeeklySnapshot(createWeeklyV4Snapshot());
  assert.equal(snapshot.schema_version, "weekly-insight-publication/v4");
  assert.equal(snapshot.content.issue_kind, "topic_preview");
  assert.equal(snapshot.publication.release_eligible, false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.content, "weekly_synthesis"), false);
  assert.deepEqual(snapshot.section_anchors, [
    "thesis_v4_01_what_changed",
    "thesis_v4_01_how_it_works",
    "thesis_v4_01_evidence_and_limits",
    "thesis_v4_01_finding_1",
    "thesis_v4_01_industry",
    "thesis_v4_01_recommendation",
  ]);
  assert.equal(validateWeeklySnapshot(createWeeklyV3Snapshot()).schema_version, "weekly-insight-publication/v3");
  assert.equal(validateWeeklySnapshot(createWeeklyV2Snapshot()).schema_version, "weekly-insight-publication/v2");
  assert.equal(validateWeeklySnapshot(createWeeklySnapshot()).schema_version, "weekly-insight-publication/v1");
});

test("v4 enforces the complete issue and topic preview release matrix", () => {
  for (const [topicCount, expectedStatus, expectedKind, releaseEligible] of [
    [0, "no_selection", "empty_preview", false],
    [1, "partial", "topic_preview", false],
    [2, "partial", "topic_preview", false],
    [3, "complete", "complete_issue", true],
    [4, "complete", "complete_issue", true],
    [5, "complete", "complete_issue", true],
  ]) {
    const snapshot = validateWeeklySnapshot(createWeeklyV4Snapshot({ topicCount }));
    assert.equal(snapshot.content.status, expectedStatus);
    assert.equal(snapshot.content.issue_kind, expectedKind);
    assert.equal(snapshot.publication.release_eligible, releaseEligible);
  }

  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({
      publication: {
        public_enabled: true,
        visibility: "public",
        authorization_id: "cannot-publish-a-preview",
      },
    })),
    /complete|release.eligible|topic.preview|public/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({
      topicCount: 3,
      publication: { release_eligible: false },
    })),
    /release.eligible|complete.issue/i,
  );
  for (const weeklySynthesis of [null, []]) {
    assert.throws(
      () => validateWeeklySnapshot(createWeeklyV4Snapshot({
        topicCount: 2,
        content: { weekly_synthesis: weeklySynthesis },
      })),
      /weekly_synthesis/i,
    );
  }
  assert.doesNotThrow(() => validateWeeklySnapshot(createWeeklyV4Snapshot({
    topicCount: 3,
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: "exact-hash-release-authorization",
    },
  })));
});

test("v4 rejects leaked audit fields, weak fact structure, and imprecise terms", () => {
  const base = createWeeklyV4Snapshot();
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({ content: {
      recommendation_placements: [],
    } })),
    /unknown field.*recommendation_placements/i,
  );

  const missingRole = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      sections: base.content.topics[0].facts.sections.filter((section) => section.role !== "evidence_and_limits"),
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, missingRole)), /evidence_and_limits|at least 3/i);

  const badLocation = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      terms: [{ ...base.content.topics[0].facts.terms[0], after_paragraph_index: 9 }],
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, badLocation)), /after_paragraph_index|paragraph/i);

  const badReaderText = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      terms: [{ ...base.content.topics[0].facts.terms[0], reader_text: "不匹配的解释" }],
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, badReaderText)), /reader_text/i);

  const notFirstOccurrence = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      sections: base.content.topics[0].facts.sections.map((section, index) => index === 0
        ? { ...section, paragraphs: ["连接器已经在这个更早段落出现。", ...section.paragraphs.slice(1)] }
        : section),
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, notFirstOccurrence)), /first|earlier|首次/i);

  const leakedImplication = {
    ...base.content.topics[0],
    strategic_recommendation: {
      ...base.content.topics[0].strategic_recommendation,
      implication_ids: ["internal-only"],
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, leakedImplication)), /unknown field.*implication_ids/i);

  const forbiddenLabel = {
    ...base.content.topics[0],
    strategic_recommendation: {
      ...base.content.topics[0].strategic_recommendation,
      paragraphs: ["这里不应继续使用启示这个读者标签。"],
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, forbiddenLabel)), /启示/);

  const formulaicFinding = {
    ...base.content.topics[0],
    findings: {
      ...base.content.topics[0].findings,
      items: [{
        ...base.content.topics[0].findings.items[0],
        paragraphs: ["治理不再是可选项，而是所有项目的统一前提。"],
      }],
    },
  };
  assert.throws(() => validateWeeklySnapshot(replaceTopic(base, formulaicFinding)), /formulaic|finding/i);

  assert.throws(
    () => validateWeeklySnapshot(replaceTopic(base, {
      ...base.content.topics[0],
      topic_id: "topic id with spaces",
    })),
    /topic_id/i,
  );

  for (const evidencePatch of [
    { title: "Agent 治理公开技术披露" },
    { publisher: "Example Research" },
    { role: "unknown_role" },
  ]) {
    assert.throws(
      () => validateWeeklySnapshot(createWeeklyV4Snapshot({ content: {
        evidence: [{ ...base.content.evidence[0], ...evidencePatch }],
      } })),
      /evidence|hostname|publisher|role/i,
    );
  }

  const unreferencedEvidence = {
    id: "unreferenced-evidence-v4",
    title: "internal.example.com",
    publisher: "internal.example.com",
    source_url: "https://internal.example.com/audit-note",
    published_at: "2026-07-31",
    accessed_at: "2026-07-31T09:30:00+08:00",
    role: "source_in",
    note: "合法形状也不能绕过 reader block 的引用约束。",
  };
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({ content: {
      ...base.content,
      evidence: [...base.content.evidence, unreferencedEvidence],
    } })),
    /unreferenced|evidence|引用/i,
  );

  const unreferencedMedia = {
    id: "unreferenced-media-v4",
    kind: "architecture",
    src: "https://assets.example.com/unreferenced.png",
    alt: "不应进入产物的内部附图",
    caption: "这张图没有挂到任何读者章节。",
    source_label: "依据公开资料绘制",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目绘制",
    logic_type: "dependency",
    logic_summary: "机器元数据不应成为保留未引用图片的理由。",
  };
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({ content: {
      ...base.content,
      media: [unreferencedMedia],
    } })),
    /unreferenced|media|引用/i,
  );
});

test("v4 uses issue-kind labels consistently in HTML and Word", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-label-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");

  for (const document of [html, word]) {
    assert.match(document, /单题内容评审/);
    assert.doesNotMatch(document, /1 个技术专题/);
  }
});

test("v4 renders expanded topics, optional synthesis, long titles, and escaped reader copy", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-rich-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot({ topicCount: 2 });
  const first = base.content.topics[0];
  const expandedTopic = {
    ...first,
    title: `${"超长专题标题".repeat(45)}<script>alert(1)</script>`,
    facts: {
      ...first.facts,
      sections: [
        ...first.facts.sections,
        {
          anchor: "thesis_v4_01_case_study",
          section_id: "case_study_01",
          role: "case_study",
          kind: "case_study",
          title: "公开案例",
          paragraphs: ["案例正文会把可核查条件与结果放在一起，不补写来源之外的结论。"],
          items: [],
          evidence_ids: ["evidence-v4"],
          media_ids: [],
        },
        {
          anchor: "thesis_v4_01_historical_context",
          section_id: "history_01",
          role: "historical_context",
          kind: "historical_context",
          title: "历史背景",
          paragraphs: ["背景材料用于解释事件出现的时间条件。<script>alert(2)</script>"],
          items: [],
          evidence_ids: ["evidence-v4"],
          media_ids: [],
        },
      ],
    },
    findings: {
      ...first.findings,
      items: [
        ...first.findings.items,
        {
          anchor: "thesis_v4_01_finding_2",
          finding_id: "finding-v4-01-2",
          title: "2、控制职责需要按技术边界拆分",
          paragraphs: ["模型、人类和确定性策略分别处理识别、批准与执行限制。"],
          evidence_ids: ["evidence-v4"],
        },
      ],
    },
  };
  const snapshot = createWeeklyV4Snapshot({
    topicCount: 2,
    content: {
      ...base.content,
      weekly_synthesis: {
        title: "跨专题机制只在证据支持时出现",
        paragraphs: ["这条主线由两个专题共同支持，并且只在本期显示一次。"],
      },
      topics: [expandedTopic, base.content.topics[1]],
    },
  });
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");

  assert.equal((html.match(/class="v4-synthesis"/g) || []).length, 1);
  assert.equal((word.match(/>本期主线</g) || []).length, 1);
  assert.equal((html.match(/class="v4-fact-section"/g) || []).length, 8);
  assert.equal((html.match(/class="v4-finding"/g) || []).length, 3);
  for (const document of [html, word]) {
    assert.doesNotMatch(document, /<script>alert\([12]\)<\/script>/);
    assert.match(document, /&lt;script&gt;alert\([12]\)&lt;\/script&gt;/);
  }
});

test("v4 HTML and DOCX share the four-layer order and exact term placement", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-order-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot({ topicCount: 3 });
  const firstTopic = {
    ...base.content.topics[0],
    strategic_recommendation: {
      ...base.content.topics[0].strategic_recommendation,
      actions: [{
        statement: "在唯一专题内放置已审计动作。",
        action: "建立并验收 Agent 统一停用入口。",
        decision_window: "下一次平台版本规划前",
      }],
    },
  };
  const snapshot = createWeeklyV4Snapshot({
    topicCount: 3,
    content: { ...base.content, topics: [firstTopic, ...base.content.topics.slice(1)] },
  });
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");

  for (const [document, labels] of [
    [html, [">事实与案例</h2>", ">发现</h2>", ">产业影响</h2>", ">战略建议</h2>"]],
    [word, [">事实与案例</w:t>", ">发现</w:t>", ">产业影响</w:t>", ">战略建议</w:t>"]],
  ]) {
    let prior = -1;
    for (const label of labels) {
      const next = document.indexOf(label);
      assert.ok(next > prior, `${label} must follow the previous reader layer`);
      prior = next;
    }
    assert.doesNotMatch(document, /发现\s*0[1-3]|dependency|logic_summary|面向整期|期级战略建议|让模型进入万全推理加速链路/);
  }
  assert.equal((html.match(/>发现<\/h2>/g) || []).length, 3);
  assert.equal((html.match(/>战略建议<\/h2>/g) || []).length, 3);
  assert.match(html, /专题 01\/03/);
  assert.match(html, /专题 03\/03/);
  assert.match(html, /data-feedback-docx data-max-bytes="8388608"/);
  for (const copy of [
    "在唯一专题内放置已审计动作。",
    "建立并验收 Agent 统一停用入口。",
    "下一次平台版本规划前",
  ]) {
    assert.equal((html.match(new RegExp(copy, "g")) || []).length, 1);
    assert.equal((word.match(new RegExp(copy, "g")) || []).length, 1);
  }
  assert.ok(html.indexOf("连接器授权决定") < html.indexOf("连接器：让 Agent"));
  assert.ok(html.indexOf("连接器：让 Agent") < html.indexOf("技术机制和控制关系"));
  assert.ok(word.indexOf("连接器授权决定") < word.indexOf("连接器：让 Agent"));
  assert.ok(word.indexOf("连接器：让 Agent") < word.indexOf("技术机制和控制关系"));
  for (const anchor of validateWeeklySnapshot(snapshot).section_anchors) {
    assert.match(html, new RegExp(`id="${anchor}"`));
    assert.match(word, new RegExp(`w:name="${anchor}"`));
  }
  assert.match(
    word,
    /<w:pPr><w:pStyle w:val="WeeklyEvidence"\/><w:keepNext\/><\/w:pPr><w:r>[\s\S]*?<w:t xml:space="preserve">\[1\] example\.com｜example\.com｜2026-07-31｜https:\/\/example\.com\/weekly-v4<\/w:t>/,
    "Word source metadata should stay with the evidence note that follows it",
  );
  assert.match(html, /example\.com · 2026-07-31/);
  assert.ok(html.indexOf("weekly-rail-actions") < html.indexOf("insight-hero"));
});

test("v4 hides media machine labels and atomically rolls back media failures", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot();
  const media = {
    id: "architecture-v4",
    kind: "architecture",
    src: "https://assets.example.com/architecture.png",
    alt: "Agent 四层治理关系图",
    caption: "图 1｜模型与人工负责判断，策略和执行隔离限制后果。",
    source_label: "依据公开资料绘制",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目绘制",
    logic_type: "dependency",
    logic_summary: "内部生产元数据不得进入读者页面。",
  };
  const topic = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      sections: base.content.topics[0].facts.sections.map((section, index) => index === 1
        ? { ...section, media_ids: [media.id] }
        : section),
    },
  };
  const snapshot = createWeeklyV4Snapshot({ content: {
    ...base.content,
    topics: [topic],
    media: [media],
  } });
  const png = createValidPng();
  const receipt = await publishWeeklySnapshot(snapshot, {
    publishRoot: path.join(root, "published"),
    loadMedia: async () => png,
  });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");
  for (const document of [html, word]) {
    assert.match(document, /模型与人工负责判断/);
    assert.doesNotMatch(document, /dependency|内部生产元数据不得/);
  }
  assert.ok(html.includes(`data:image/png;base64,${png.toString("base64")}`));
  assert.doesNotMatch(html, /src="https:\/\/assets\.example\.com\/architecture\.png"/);
  assert.ok([...entries.keys()].some((name) => name.startsWith("word/media/")));
  const embeddedImage = entries.get([...entries.keys()].find((name) => name.startsWith("word/media/")));
  assert.deepEqual(embeddedImage, png);

  const truncatedPng = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(truncatedPng);
  truncatedPng.writeUInt32BE(1200, 16);
  truncatedPng.writeUInt32BE(675, 20);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "truncated"),
      loadMedia: async () => truncatedPng,
    }),
    /PNG|image/i,
  );

  const corruptPng = Buffer.from(png);
  const idatTypeOffset = corruptPng.indexOf(Buffer.from("IDAT", "ascii"));
  assert.ok(idatTypeOffset > 0, "fixture must contain an IDAT chunk");
  corruptPng[idatTypeOffset + 4] ^= 1;
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "corrupt-png"),
      loadMedia: async () => corruptPng,
    }),
    /PNG|image|CRC|decode/i,
  );

  const oversizedPixelsPng = createLargeOneBitPng(50_000, 1_000);
  await assert.rejects(
    loadWeeklyMediaAssets(snapshot, {
      loadMedia: async () => oversizedPixelsPng,
    }),
    /PNG|pixels|too large|resolution/i,
  );

  const headerOnlyJpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  ]);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "header-only-jpeg"),
      loadMedia: async () => headerOnlyJpeg,
    }),
    /JPEG|image|scan|end/i,
  );

  const tablelessJpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xda, 0x00, 0x08,
    0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x2a,
    0xff, 0xd9,
  ]);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "tableless-jpeg"),
      loadMedia: async () => tablelessJpeg,
    }),
    /JPEG|image|decode|table/i,
  );

  const captionlessMedia = {
    ...media,
    caption: "",
    source_label: "",
    source_url: null,
  };
  for (const invalidMedia of [
    captionlessMedia,
    { ...media, src: null },
    { ...media, source_url: null },
    { ...media, usage_rights: "" },
    { ...media, caption: "Agent architecture diagram" },
  ]) {
    assert.throws(
      () => validateWeeklySnapshot(createWeeklyV4Snapshot({ content: {
        ...base.content,
        topics: [{
          ...base.content.topics[0],
          facts: {
            ...base.content.topics[0].facts,
            sections: base.content.topics[0].facts.sections.map((section, index) => index === 1
              ? { ...section, media_ids: [invalidMedia.id] }
              : section),
          },
        }],
        media: [invalidMedia],
      } })),
      /media|source|caption|rights/i,
    );
  }

  const failedRoot = path.join(root, "failed");
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: failedRoot,
      loadMedia: async () => { throw new Error("simulated v4 media failure"); },
    }),
    /simulated v4 media failure/,
  );
  assert.deepEqual(await fs.readdir(failedRoot), []);
});

test("v4 refuses to publish a Word that the feedback endpoint cannot accept", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-size-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot();
  const media = ["a", "b"].map((suffix) => ({
    id: `large-architecture-v4-${suffix}`,
    kind: "architecture",
    src: `https://assets.example.com/large-${suffix}.png`,
    alt: `大尺寸架构证据图 ${suffix}`,
    caption: `图 ${suffix === "a" ? "1" : "2"}｜用于验证 Word 导出与反馈入口采用相同上限。`,
    source_label: "依据公开资料绘制",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目绘制",
    logic_type: "dependency",
    logic_summary: "这项生产元数据只用于验证图的逻辑完整性。",
  }));
  const topic = {
    ...base.content.topics[0],
    facts: {
      ...base.content.topics[0].facts,
      sections: base.content.topics[0].facts.sections.map((section, index) => index === 1
        ? { ...section, media_ids: media.map((item) => item.id) }
        : section),
    },
  };
  const snapshot = createWeeklyV4Snapshot({ content: {
    ...base.content,
    topics: [topic],
    media,
  } });
  const publishRoot = path.join(root, "published");
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot,
      maxDocxBytes: 8 * 1024 * 1024,
      loadMedia: async (item) => createValidPng(item.id.endsWith("-b") ? 1 : 0, 4_300_000),
    }),
    /DOCX|Word|feedback|8[ ,]?388[ ,]?608|too large|exceeds/i,
  );
  assert.deepEqual(await fs.readdir(publishRoot), []);

  const cachedRoot = path.join(root, "cached");
  const firstReceipt = await publishWeeklySnapshot(snapshot, {
    publishRoot: cachedRoot,
    maxDocxBytes: 20 * 1024 * 1024,
    loadMedia: async (item) => createValidPng(item.id.endsWith("-b") ? 1 : 0, 4_300_000),
  });
  assert.ok(firstReceipt.files.docx.bytes > 8 * 1024 * 1024);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: cachedRoot,
      maxDocxBytes: 8 * 1024 * 1024,
      loadMedia: async () => { throw new Error("matching cache should not reload media"); },
    }),
    /DOCX|Word|feedback|8[ ,]?388[ ,]?608|too large|exceeds/i,
  );
});

test("v4 edited Word reports precise chapter diffs and unchanged Word keeps the draft hash", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const originalDocx = await fs.readFile(docxPath);
  const unchanged = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "确认 Word 未修改时不产生伪差异。",
    editedDocx: originalDocx,
  });
  assert.deepEqual(unchanged.section_diffs, []);
  assert.equal(unchanged.final_content_sha256, snapshot.content_sha256);

  const entries = readZipEntries(originalDocx);
  entries.set("word/document.xml", Buffer.from(entries.get("word/document.xml").toString("utf8")
    .replace("连接器：让 Agent", "连接器：用于让 Agent")
    .replace("背景与原因在此时同时聚集", "背景、原因和时机在此时同时聚集")
    .replace("企业客户会要求平台提供", "企业客户会进一步要求平台提供")
    .replace("擎天、百应与 AI Foundry 需要", "擎天、百应与 AI Foundry 均需要")));
  const edited = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "校准事实术语、发现、产业影响和战略建议。",
    editedDocx: createZip([...entries.entries()]),
  });
  assert.deepEqual(edited.section_diffs.map((item) => item.anchor), [
    "thesis_v4_01_what_changed",
    "thesis_v4_01_finding_1",
    "thesis_v4_01_industry",
    "thesis_v4_01_recommendation",
  ]);
});
