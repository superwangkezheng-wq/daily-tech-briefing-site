const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createZip, readZipEntries } = require("../src/ooxml");
const { canonicalSha256, validateWeeklySnapshot } = require("../src/weekly-insight-contract");
const { publishWeeklySnapshot, loadWeeklyMediaAssets } = require("../src/weekly-insight-publisher");
const { buildWeeklyInsightCache } = require("../src/weekly-insight-index");
const { saveWeeklyFeedback } = require("../src/weekly-feedback");
const { createValidPng, createLargeOneBitPng } = require("./helpers/image-fixture");
const { writeV41BundleManifest } = require("./helpers/weekly-bundle-fixture");
const {
  createWeeklySnapshot,
  createWeeklyV2Snapshot,
  createWeeklyV3Snapshot,
  createWeeklyV4Snapshot,
  createWeeklyV41Snapshot,
} = require("./helpers/weekly-fixture");

function replaceTopic(snapshot, topic) {
  return createWeeklyV4Snapshot({
    topicCount: snapshot.content.selected_topics,
    content: { ...snapshot.content, topics: [topic, ...snapshot.content.topics.slice(1)] },
  });
}

async function readDirIfPresent(directory) {
  try {
    return await fs.readdir(directory);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
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
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV4Snapshot({ version: "4.2" })),
    /version|profile/i,
  );
});

test("v4.1 consumes numbered reader sections and private sidecar media without leaking machine metadata", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-1-bundle-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, "bundle");
  const mediaDir = path.join(mediaRoot, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  const comparisonPng = createValidPng(0);
  const architecturePng = createValidPng(1);
  await Promise.all([
    fs.writeFile(path.join(mediaDir, "agentforger-csrf-comparison.png"), comparisonPng),
    fs.writeFile(path.join(mediaDir, "agent-control-chain.png"), architecturePng),
  ]);

  const base = createWeeklyV41Snapshot();
  const topic = base.content.topics[0];
  const caseStudySection = topic.facts.sections[1];
  const architectureSection = topic.facts.sections[3];
  const sections = topic.facts.sections.map((section) => {
    if (section.section_id === caseStudySection.section_id) {
      return { ...section, media_ids: ["agentforger-comparison"] };
    }
    if (section.section_id === architectureSection.section_id) {
      return { ...section, media_ids: ["agent-governance-stack"] };
    }
    return section;
  });
  const media = [
    {
      id: "agentforger-comparison",
      kind: "image",
      asset_ref: "media/agentforger-csrf-comparison.png",
      asset_sha256: crypto.createHash("sha256").update(comparisonPng).digest("hex"),
      mime_type: "image/png",
      size_bytes: comparisonPng.length,
      width: 1,
      height: 1,
      alt: "传统 CSRF 与 AgentForger 持续执行链对比",
      caption: "Zenity 对比了单次状态变更与 Agent 创建、授权和调度链路。",
      source_label: "example.com",
      source_url: "https://example.com/weekly-v4",
      usage_rights: "内部分析引用并保留出处",
      target_section_id: caseStudySection.section_id,
      evidence_ids: ["evidence-v4"],
      rights_scope: "internal_only",
      rights_basis: "第三方原图尚未取得公开转载许可。",
      logic_type: "comparison",
      logic_summary: "传统 CSRF 完成一次状态变更；AgentForger 继续创建并调度具备既有授权的 Agent。",
    },
    {
      id: "agent-governance-stack",
      kind: "architecture",
      asset_ref: "media/agent-control-chain.png",
      asset_sha256: crypto.createHash("sha256").update(architecturePng).digest("hex"),
      mime_type: "image/png",
      size_bytes: architecturePng.length,
      width: 1,
      height: 1,
      alt: "企业 Agent 治理的四层控制面",
      caption: "模型判断、人工确认、策略控制和执行隔离共同限制 Agent 的运行范围。",
      source_label: "example.com",
      source_url: "https://example.com/weekly-v4",
      usage_rights: "本项目依据公开事实原创绘制",
      target_section_id: architectureSection.section_id,
      evidence_ids: ["evidence-v4"],
      rights_scope: "public_allowed",
      rights_basis: "原创关系图，可随内容发布并保留公开事实来源。",
      logic_type: "stack",
      logic_summary: "四层控制叠加约束身份、授权、工具、运行时间和操作结果。",
    },
  ];
  const snapshot = createWeeklyV41Snapshot({ content: {
    ...base.content,
    topics: [{
      ...topic,
      facts: { ...topic.facts, sections },
    }],
    media,
  } });
  await writeV41BundleManifest(mediaRoot, snapshot);

  const normalized = validateWeeklySnapshot(snapshot);
  assert.equal(normalized.version, "4.1");
  assert.deepEqual(normalized.content.topics[0].facts.sections.map((section) => section.sequence_label), ["①", "②", "③", "④", "⑤"]);
  assert.equal(normalized.content.topics[0].facts.term_note_groups.length, 3);
  assert.equal(normalized.content.topics[0].facts.terms.length, 5);
  assert.equal(normalized.content.topics[0].findings.title, "发现");
  assert.deepEqual(normalized.content.topics[0].facts.term_note_groups[0].reader_texts, [
    "CSRF：攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
    "连接器：让 Agent 调用邮件、文件、数据库等外部系统的接口及授权配置。",
  ]);
  assert.equal(normalized.publication.release_eligible, false);

  const receipt = await publishWeeklySnapshot(snapshot, {
    publishRoot: path.join(root, "published"),
    mediaBundleRoot: mediaRoot,
  });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");
  const styles = entries.get("word/styles.xml").toString("utf8");
  assert.equal((html.match(/class="v4-fact-index"/g) || []).length, 5);
  assert.equal((html.match(/class="v4-term-notes"/g) || []).length, 3);
  assert.match(html, /class="v4-fact-index"[^>]*>①<\/span>/);
  assert.match(html, /class="v4-fact-index"[^>]*>⑤<\/span>/);
  assert.match(word, />①　公开事件与发生条件<\/w:t>/);
  assert.match(word, />⑤　证据边界与适用范围<\/w:t>/);
  assert.match(word, /<w:pStyle w:val="WeeklyTopicSequence"\/>/);
  assert.match(styles, /w:styleId="WeeklyTopicSequence"[\s\S]*?<w:sz w:val="22"\/>/);
  assert.match(html, /<body class="weekly-page weekly-detail-page weekly-detail-page--v4 weekly-detail-page--v4-1">/);
  assert.match(html, />关键发现<\/h2>/);
  assert.match(word, />关键发现<\/w:t>/);
  assert.doesNotMatch(html, />发现<\/h2>/);
  assert.doesNotMatch(word, />发现<\/w:t>/);
  assert.doesNotMatch(html, /data-copy-anchor=/);
  assert.match(html, /class="topic-references"><span>source<\/span>/);
  assert.match(word, />source \[1\]<\/w:t>/);
  assert.match(html, /说明：内部分析引用并保留出处/);
  assert.match(word, /说明：内部分析引用并保留出处/);
  assert.doesNotMatch(html, /使用说明：/);
  assert.doesNotMatch(word, /使用说明：/);
  assert.match(
    html,
    /<ul class="v4-strategy-points"><li>擎天、百应与 AI Foundry[^<]+<\/li><li>交付统一停用入口、撤权验证和任务成功率报告。<\/li><\/ul>/,
  );
  const strategyTextIndex = word.indexOf("擎天、百应与 AI Foundry");
  assert.notEqual(strategyTextIndex, -1);
  const strategyParagraphStart = word.lastIndexOf("<w:p>", strategyTextIndex);
  const strategyParagraphEnd = word.indexOf("</w:p>", strategyTextIndex);
  const strategyParagraph = word.slice(strategyParagraphStart, strategyParagraphEnd);
  assert.match(strategyParagraph, /<w:numPr>/);
  const finalFactText = normalized.content.topics[0].facts.sections.at(-1).paragraphs.at(-1);
  const finalFactIndex = word.indexOf(finalFactText);
  assert.notEqual(finalFactIndex, -1);
  const finalFactSourceIndex = word.indexOf(">source [", finalFactIndex);
  assert.notEqual(finalFactSourceIndex, -1);
  const finalFactSourceParagraphStart = word.lastIndexOf("<w:p>", finalFactSourceIndex);
  const precedingParagraphStart = word.lastIndexOf("<w:p>", finalFactSourceParagraphStart - 1);
  const precedingParagraph = word.slice(precedingParagraphStart, finalFactSourceParagraphStart);
  const sourceParagraph = word.slice(
    finalFactSourceParagraphStart,
    word.indexOf("</w:p>", finalFactSourceParagraphStart),
  );
  assert.match(precedingParagraph, /<w:keepNext\/>/);
  assert.doesNotMatch(sourceParagraph, /<w:keepNext\/>/);
  const comparisonBase64 = comparisonPng.toString("base64");
  const architectureBase64 = architecturePng.toString("base64");
  assert.equal(html.split(comparisonBase64).length - 1, 1);
  assert.equal(html.split(architectureBase64).length - 1, 1);
  const embeddedMedia = [...entries.entries()]
    .filter(([name]) => name.startsWith("word/media/"));
  assert.equal(embeddedMedia.length, 2);
  assert.deepEqual(embeddedMedia.map(([name, value]) => ({
    name,
    sha256: crypto.createHash("sha256").update(value).digest("hex"),
  })), [
    {
      name: "word/media/1-agentforger-comparison.png",
      sha256: crypto.createHash("sha256").update(comparisonPng).digest("hex"),
    },
    {
      name: "word/media/2-agent-governance-stack.png",
      sha256: crypto.createHash("sha256").update(architecturePng).digest("hex"),
    },
  ]);
  const mechanismSection = topic.facts.sections[2];
  const evidenceSection = topic.facts.sections[4];
  assert.ok(html.indexOf(caseStudySection.anchor) < html.indexOf(comparisonBase64));
  assert.ok(html.indexOf(comparisonBase64) < html.indexOf(mechanismSection.anchor));
  assert.ok(html.indexOf(architectureSection.anchor) < html.indexOf(architectureBase64));
  assert.ok(html.indexOf(architectureBase64) < html.indexOf(evidenceSection.anchor));
  for (const rightsNote of [
    "内部分析引用并保留出处",
    "本项目依据公开事实原创绘制",
  ]) {
    assert.match(html, new RegExp(rightsNote));
    assert.match(word, new RegExp(rightsNote));
  }
  for (const document of [html, word]) {
    assert.doesNotMatch(document, /asset_ref|asset_sha256|rights_scope|rights_basis|internal_only|public_allowed|logic_type|logic_summary/);
  }

  const scanned = await buildWeeklyInsightCache({
    sourceDir: mediaRoot,
    publishRoot: path.join(root, "scanned"),
  });
  assert.deepEqual(scanned.errors, []);
  assert.deepEqual(scanned.published.map((item) => item.artifact_id), [snapshot.artifact_id]);

  const manifestPath = path.join(mediaRoot, "bundle-manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.content_sha256 = "0".repeat(64);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const rejectedManifest = await buildWeeklyInsightCache({
    sourceDir: mediaRoot,
    publishRoot: path.join(root, "manifest-rejected"),
  });
  assert.deepEqual(rejectedManifest.published, []);
  assert.equal(rejectedManifest.errors.length, 1);
  assert.match(rejectedManifest.errors[0].error, /bundle manifest|content.*hash|identity/i);
});

test("v4.1 fails closed on sidecar traversal, symlinks, byte tampering, and internal-only public release", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-1-safety-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, "bundle");
  const mediaDir = path.join(mediaRoot, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  const png = createValidPng();
  await Promise.all([
    fs.writeFile(path.join(mediaDir, "agentforger-csrf-comparison.png"), png),
    fs.writeFile(path.join(mediaDir, "agent-control-chain.png"), png),
  ]);

  function bundledMedia(id, targetSection, assetRef = "media/agentforger-csrf-comparison.png", overrides = {}) {
    return {
      id,
      kind: "image",
      asset_ref: assetRef,
      asset_sha256: crypto.createHash("sha256").update(png).digest("hex"),
      mime_type: "image/png",
      size_bytes: png.length,
      width: 1,
      height: 1,
      alt: "Agent 事实关系图",
      caption: "图示只呈现目标事实小节已经核对的关系。",
      source_label: "example.com",
      source_url: "https://example.com/weekly-v4",
      usage_rights: "内部分析引用并保留出处",
      target_section_id: targetSection.section_id,
      evidence_ids: ["evidence-v4"],
      rights_scope: "internal_only",
      rights_basis: "第三方资料尚未取得公开转载许可。",
      logic_type: "flow",
      logic_summary: "事件按已核对的顺序推进。",
      ...overrides,
    };
  }

  function oneTopicSnapshot(mediaPatch = {}) {
    const base = createWeeklyV41Snapshot();
    const topic = base.content.topics[0];
    const target = topic.facts.sections[0];
    const architectureTarget = topic.facts.sections[3];
    const media = { ...bundledMedia("fact-image", target), ...mediaPatch };
    const architecture = bundledMedia(
      "architecture-image",
      architectureTarget,
      "media/agent-control-chain.png",
      {
        kind: "architecture",
        rights_scope: "public_allowed",
        rights_basis: "测试原创关系图。",
        logic_type: "stack",
        logic_summary: "四层控制共同限定 Agent 的执行范围。",
      },
    );
    return createWeeklyV41Snapshot({ content: {
      ...base.content,
      topics: [{
        ...topic,
        facts: {
          ...topic.facts,
          sections: topic.facts.sections.map((section, index) => {
            if (index === 0) return { ...section, media_ids: [media.id] };
            if (index === 3) return { ...section, media_ids: [architecture.id] };
            return section;
          }),
        },
      }],
      media: [media, architecture],
    } });
  }

  assert.throws(
    () => validateWeeklySnapshot(oneTopicSnapshot({ asset_ref: "media/../outside.png" })),
    /asset.ref|media/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(oneTopicSnapshot({ asset_ref: "media/nested/fact.png" })),
    /asset.ref|media/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(oneTopicSnapshot({ mime_type: "image/jpeg" })),
    /mime.type/i,
  );

  const missingRoot = path.join(root, "missing-root");
  await assert.rejects(
    publishWeeklySnapshot(oneTopicSnapshot(), { publishRoot: missingRoot }),
    /bundle root/i,
  );
  assert.deepEqual(await readDirIfPresent(missingRoot), []);

  const tampered = oneTopicSnapshot({ asset_sha256: "0".repeat(64) });
  const tamperedRoot = path.join(root, "tampered");
  await writeV41BundleManifest(mediaRoot, tampered);
  await assert.rejects(
    publishWeeklySnapshot(tampered, { publishRoot: tamperedRoot, mediaBundleRoot: mediaRoot }),
    /hash|receipt|bundle manifest|bundled weekly media/i,
  );
  assert.deepEqual(await readDirIfPresent(tamperedRoot), []);

  await fs.writeFile(path.join(root, "outside.png"), png);
  await fs.symlink(path.join(root, "outside.png"), path.join(mediaDir, "linked.png"));
  const symlinked = oneTopicSnapshot({ asset_ref: "media/linked.png" });
  const symlinkRoot = path.join(root, "symlinked");
  await writeV41BundleManifest(mediaRoot, symlinked);
  await assert.rejects(
    publishWeeklySnapshot(symlinked, { publishRoot: symlinkRoot, mediaBundleRoot: mediaRoot }),
    /symbolic|bundled weekly media/i,
  );
  assert.deepEqual(await readDirIfPresent(symlinkRoot), []);

  const bundleLink = path.join(root, "bundle-link");
  await writeV41BundleManifest(mediaRoot, oneTopicSnapshot());
  await fs.symlink(mediaRoot, bundleLink);
  const symlinkBundleRoot = path.join(root, "symlink-bundle-root");
  await assert.rejects(
    publishWeeklySnapshot(oneTopicSnapshot(), {
      publishRoot: symlinkBundleRoot,
      mediaBundleRoot: bundleLink,
    }),
    /bundle root|symbolic/i,
  );
  assert.deepEqual(await readDirIfPresent(symlinkBundleRoot), []);

  for (const [label, mediaPatch] of [
    ["size", { size_bytes: png.length + 1 }],
    ["width", { width: 2 }],
    ["height", { height: 2 }],
  ]) {
    const publishRoot = path.join(root, `mismatch-${label}`);
    const mismatchSnapshot = oneTopicSnapshot(mediaPatch);
    await writeV41BundleManifest(mediaRoot, mismatchSnapshot);
    await assert.rejects(
      publishWeeklySnapshot(mismatchSnapshot, { publishRoot, mediaBundleRoot: mediaRoot }),
      /metadata|size mismatch|receipt|bundle manifest|bundled weekly media/i,
    );
    assert.deepEqual(await readDirIfPresent(publishRoot), []);
  }

  await fs.mkdir(path.join(mediaDir, "directory.png"));
  const directoryRoot = path.join(root, "directory-asset");
  const directorySnapshot = oneTopicSnapshot({ asset_ref: "media/directory.png" });
  await writeV41BundleManifest(mediaRoot, directorySnapshot);
  await assert.rejects(
    publishWeeklySnapshot(directorySnapshot, {
      publishRoot: directoryRoot,
      mediaBundleRoot: mediaRoot,
    }),
    /regular file|bundled weekly media/i,
  );
  assert.deepEqual(await readDirIfPresent(directoryRoot), []);

  const completeBase = createWeeklyV41Snapshot({ topicCount: 3 });
  const completeMedia = completeBase.content.topics.map((topic, index) => (
    bundledMedia(`internal-fact-${index + 1}`, topic.facts.sections[0])
  ));
  const completeTopics = completeBase.content.topics.map((topic, index) => ({
    ...topic,
    facts: {
      ...topic.facts,
      sections: topic.facts.sections.map((section, sectionIndex) => sectionIndex === 0
        ? { ...section, media_ids: [completeMedia[index].id] }
        : section),
    },
  }));
  const completePreview = createWeeklyV41Snapshot({
    topicCount: 3,
    publication: { release_eligible: false },
    content: { ...completeBase.content, topics: completeTopics, media: completeMedia },
  });
  assert.equal(validateWeeklySnapshot(completePreview).publication.release_eligible, false);
  assert.throws(
    () => validateWeeklySnapshot(createWeeklyV41Snapshot({
      topicCount: 3,
      publication: {
        public_enabled: true,
        visibility: "public",
        authorization_id: "cannot-publish-internal-media",
        release_eligible: false,
      },
      content: { ...completeBase.content, topics: completeTopics, media: completeMedia },
    })),
    /release.eligible|internal|public/i,
  );
});

test("v4.1 rejects duplicate bundle authorities and oversized manifest entries", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-1-manifest-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundleRoot = path.join(root, "bundle");
  const mediaDir = path.join(bundleRoot, "media");
  await fs.mkdir(mediaDir, { recursive: true });
  const png = createValidPng();
  await Promise.all([
    fs.writeFile(path.join(mediaDir, "agentforger-csrf-comparison.png"), png),
    fs.writeFile(path.join(mediaDir, "agent-control-chain.png"), png),
  ]);
  const base = createWeeklyV41Snapshot();
  const topic = base.content.topics[0];
  const target = topic.facts.sections[0];
  const architectureTarget = topic.facts.sections[3];
  const comparisonMedia = {
    id: "fact-image",
    kind: "image",
    asset_ref: "media/agentforger-csrf-comparison.png",
    asset_sha256: crypto.createHash("sha256").update(png).digest("hex"),
    mime_type: "image/png",
    size_bytes: png.length,
    width: 1,
    height: 1,
    alt: "Agent 事实关系图",
    caption: "图示只呈现目标事实小节已经核对的关系。",
    source_label: "example.com",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "内部分析引用并保留出处",
    target_section_id: target.section_id,
    evidence_ids: ["evidence-v4"],
    rights_scope: "internal_only",
    rights_basis: "第三方资料尚未取得公开转载许可。",
    logic_type: "comparison",
    logic_summary: "入口、授权与持续执行形成需要治理的控制链。",
  };
  const architectureMedia = {
    ...comparisonMedia,
    id: "architecture-image",
    kind: "architecture",
    asset_ref: "media/agent-control-chain.png",
    target_section_id: architectureTarget.section_id,
    rights_scope: "public_allowed",
    rights_basis: "测试原创关系图。",
    logic_type: "stack",
  };
  const snapshot = createWeeklyV41Snapshot({ content: {
    ...base.content,
    topics: [{
      ...topic,
      facts: {
        ...topic.facts,
        sections: topic.facts.sections.map((section, index) => {
          if (index === 0) return { ...section, media_ids: [comparisonMedia.id] };
          if (index === 3) return { ...section, media_ids: [architectureMedia.id] };
          return section;
        }),
      },
    }],
    media: [comparisonMedia, architectureMedia],
  } });

  const manifest = await writeV41BundleManifest(bundleRoot, snapshot);
  const duplicatePayload = Buffer.from("{}", "utf8");
  await fs.writeFile(path.join(bundleRoot, "duplicate-candidate.json"), duplicatePayload);
  manifest.entries.push({
    path: "duplicate-candidate.json",
    role: "analysis_candidate",
    sha256: crypto.createHash("sha256").update(duplicatePayload).digest("hex"),
    size_bytes: duplicatePayload.length,
  });
  manifest.bundle_entries_sha256 = canonicalSha256(manifest.entries);
  await fs.writeFile(path.join(bundleRoot, "bundle-manifest.json"), JSON.stringify(manifest, null, 2));
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "duplicate-role"),
      mediaBundleRoot: bundleRoot,
    }),
    /bundle manifest.*(?:duplicate|role|authority)/i,
  );

  await writeV41BundleManifest(bundleRoot, snapshot);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "oversized-entry"),
      mediaBundleRoot: bundleRoot,
      bundleEntryMaxBytes: 8,
    }),
    /bundle manifest.*(?:large|size|bytes)/i,
  );

  await writeV41BundleManifest(bundleRoot, snapshot, { snapshotPath: "renamed-snapshot.json" });
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "renamed-snapshot"),
      mediaBundleRoot: bundleRoot,
    }),
    /bundle manifest.*(?:identity|snapshot.*path|entry order)/i,
  );

  await writeV41BundleManifest(bundleRoot, snapshot);
  const snapshotAlias = path.join(bundleRoot, "snapshot-alias.json");
  await fs.symlink(path.join(bundleRoot, "weekly-insight-publication-v4.json"), snapshotAlias);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "symlink-alias"),
      mediaBundleRoot: bundleRoot,
      sourcePath: snapshotAlias,
    }),
    /bundle manifest.*snapshot path/i,
  );

  const bundleDirectoryAlias = path.join(root, "bundle-directory-alias");
  await fs.symlink(bundleRoot, bundleDirectoryAlias);
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "symlink-directory-alias"),
      mediaBundleRoot: bundleRoot,
      sourcePath: path.join(bundleDirectoryAlias, "weekly-insight-publication-v4.json"),
    }),
    /bundle manifest.*snapshot path/i,
  );

  const reordered = await writeV41BundleManifest(bundleRoot, snapshot);
  const editableExportIndex = reordered.entries.findIndex((entry) => entry.role === "editable_export");
  const editableSourceIndex = reordered.entries.findIndex((entry) => entry.role === "editable_source");
  [reordered.entries[editableExportIndex], reordered.entries[editableSourceIndex]] = [
    reordered.entries[editableSourceIndex],
    reordered.entries[editableExportIndex],
  ];
  reordered.bundle_entries_sha256 = canonicalSha256(reordered.entries);
  await fs.writeFile(
    path.join(bundleRoot, "bundle-manifest.json"),
    JSON.stringify(reordered, null, 2),
  );
  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: path.join(root, "reordered-editable"),
      mediaBundleRoot: bundleRoot,
    }),
    /bundle manifest.*(?:entry order|editable)/i,
  );

  const rejectEntryMutation = async (label, mutate) => {
    const mutated = await writeV41BundleManifest(bundleRoot, snapshot);
    await mutate(mutated.entries);
    mutated.bundle_entries_sha256 = canonicalSha256(mutated.entries);
    await fs.writeFile(
      path.join(bundleRoot, "bundle-manifest.json"),
      JSON.stringify(mutated, null, 2),
    );
    await assert.rejects(
      publishWeeklySnapshot(snapshot, {
        publishRoot: path.join(root, label),
        mediaBundleRoot: bundleRoot,
      }),
      /bundle manifest.*(?:entry order|duplicate|role|authority)/i,
    );
  };
  await rejectEntryMutation("missing-editable-source", async (entries) => {
    entries.splice(entries.findIndex((entry) => entry.role === "editable_source"), 1);
  });
  await rejectEntryMutation("renamed-reader-media", async (entries) => {
    const entry = entries.find((item) => item.role === "reader_media");
    const renamedPath = "media/renamed-comparison.png";
    await fs.copyFile(path.join(bundleRoot, entry.path), path.join(bundleRoot, renamedPath));
    entry.path = renamedPath;
  });
  await rejectEntryMutation("renamed-editable-export", async (entries) => {
    const entry = entries.find((item) => item.role === "editable_export");
    const renamedPath = "media/renamed-fact.svg";
    await fs.copyFile(path.join(bundleRoot, entry.path), path.join(bundleRoot, renamedPath));
    entry.path = renamedPath;
  });
  await rejectEntryMutation("duplicate-editable-source", async (entries) => {
    const entry = entries.find((item) => item.role === "editable_source");
    const duplicatePath = "media/duplicate-fact.drawio";
    await fs.copyFile(path.join(bundleRoot, entry.path), path.join(bundleRoot, duplicatePath));
    entries.splice(entries.indexOf(entry) + 1, 0, { ...entry, path: duplicatePath });
  });
  await rejectEntryMutation("renamed-support-entry", async (entries) => {
    const entry = entries.find((item) => item.role === "visual_plan");
    const renamedPath = "renamed-visual-plan.json";
    await fs.copyFile(path.join(bundleRoot, entry.path), path.join(bundleRoot, renamedPath));
    entry.path = renamedPath;
  });
  await rejectEntryMutation("reordered-support-entries", async (entries) => {
    [entries[entries.length - 2], entries[entries.length - 1]] = [
      entries[entries.length - 1], entries[entries.length - 2],
    ];
  });

  await writeV41BundleManifest(bundleRoot, snapshot);
  await fs.writeFile(path.join(bundleRoot, "legacy-v3-snapshot.json"), "{}\n");
  const coLocatedReceipt = await publishWeeklySnapshot(snapshot, {
    publishRoot: path.join(root, "co-located-entry"),
    mediaBundleRoot: bundleRoot,
    sourcePath: path.join(bundleRoot, "weekly-insight-publication-v4.json"),
  });
  assert.equal(coLocatedReceipt.artifact_id, snapshot.artifact_id);
});

test("v4.1 rejects missing, duplicated, or mismatched media placement metadata", () => {
  const base = createWeeklyV41Snapshot();
  const topic = base.content.topics[0];
  const target = topic.facts.sections[0];
  const media = {
    id: "fact-image",
    kind: "image",
    asset_ref: "media/fact.png",
    asset_sha256: "0".repeat(64),
    mime_type: "image/png",
    size_bytes: 128,
    width: 1,
    height: 1,
    alt: "Agent 事实关系图",
    caption: "图示只呈现目标事实小节已经核对的关系。",
    source_label: "example.com",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目依据公开事实原创绘制",
    target_section_id: target.section_id,
    evidence_ids: ["evidence-v4"],
    rights_scope: "public_allowed",
    rights_basis: "原创关系图，可随内容发布。",
    logic_type: "flow",
    logic_summary: "事件按已核对的顺序推进。",
  };
  function withMedia(mediaPatch = {}, topicPatch = topic) {
    return createWeeklyV41Snapshot({ content: {
      ...base.content,
      topics: [topicPatch],
      media: [{ ...media, ...mediaPatch }],
    } });
  }
  assert.throws(
    () => validateWeeklySnapshot(base),
    /requires at least one.*image/i,
  );
  const placedTopic = {
    ...topic,
    facts: {
      ...topic.facts,
      sections: topic.facts.sections.map((section, index) => index === 0
        ? { ...section, media_ids: [media.id] }
        : section),
    },
  };
  assert.equal(validateWeeklySnapshot(withMedia({}, placedTopic)).content.media.length, 1);
  const duplicateTopic = {
    ...placedTopic,
    facts: {
      ...placedTopic.facts,
      sections: placedTopic.facts.sections.map((section, index) => index === 1
        ? { ...section, media_ids: [media.id] }
        : section),
    },
  };
  assert.throws(
    () => validateWeeklySnapshot(withMedia({}, duplicateTopic)),
    /exactly one fact placement/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(withMedia({ target_section_id: topic.facts.sections[1].section_id }, placedTopic)),
    /target section mismatch/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(withMedia({ evidence_ids: ["other-evidence"] }, placedTopic)),
    /evidence must belong/i,
  );
  assert.throws(
    () => validateWeeklySnapshot(withMedia({ source_url: "https://other.example.com/source" }, placedTopic)),
    /source must match/i,
  );
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

test("v4.0 preserves unnumbered fact headings and each term's original paragraph placement", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-article-flow-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot();
  const firstTopic = base.content.topics[0];
  const firstSection = firstTopic.facts.sections[0];
  const addedSections = [
    {
      anchor: "thesis_v4_01_case_study",
      section_id: "case_study_01",
      role: "case_study",
      kind: "case_study",
      title: "公开案例",
      paragraphs: ["公开案例补充可核查的利用条件与结果。"],
      items: [],
      evidence_ids: ["evidence-v4"],
      media_ids: [],
    },
    {
      anchor: "thesis_v4_01_historical_context",
      section_id: "historical_context_01",
      role: "historical_context",
      kind: "historical_context",
      title: "历史背景与边界",
      paragraphs: ["历史材料只用于说明事件出现的时间条件。"],
      items: [],
      evidence_ids: ["evidence-v4"],
      media_ids: [],
    },
  ];
  const snapshot = createWeeklyV4Snapshot({ content: {
    ...base.content,
    topics: [{
      ...firstTopic,
      facts: {
        ...firstTopic.facts,
        sections: [{
          ...firstSection,
          paragraphs: [
            "公开事件涉及 CSRF 类请求问题，时间与成立条件均可核对。",
            firstSection.paragraphs[1],
          ],
        }, ...firstTopic.facts.sections.slice(1), ...addedSections],
        terms: [{
          term: "CSRF",
          explanation: "攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
          first_section_id: firstSection.section_id,
          after_section_anchor: firstSection.anchor,
          after_paragraph_index: 0,
          reader_text: "CSRF：攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
        }, ...firstTopic.facts.terms],
      },
    }],
  } });
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(receipt.artifact_dir, "index.html"), "utf8");
  const entries = readZipEntries(await fs.readFile(path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`)));
  const word = entries.get("word/document.xml").toString("utf8");

  assert.equal((html.match(/class="v4-fact-index"/g) || []).length, 0);
  assert.match(word, />公开事件与发生条件<\/w:t>/);
  assert.match(word, />历史背景与边界<\/w:t>/);
  assert.doesNotMatch(word, /　(?:公开事件与发生条件|历史背景与边界)<\/w:t>/);
  assert.equal((html.match(/class="v4-term-line"/g) || []).length, 2);
  assert.equal((html.match(/class="v4-term-notes"/g) || []).length, 0);
  assert.doesNotMatch(html, /weekly-detail-page--v4-1/);
  assert.match(html, />发现<\/h2>/);
  assert.doesNotMatch(html, />关键发现<\/h2>/);
  assert.match(html, /data-copy-anchor=/);
  assert.match(html, /class="topic-references"><span>证据<\/span>/);
  assert.doesNotMatch(html, /class="topic-references"><span>source<\/span>/);
  assert.doesNotMatch(html, /class="v4-strategy-points"/);
  assert.match(word, />发现<\/w:t>/);
  assert.doesNotMatch(word, />关键发现<\/w:t>/);
  assert.doesNotMatch(word, />source \[[0-9]+\]<\/w:t>/);
  const v40StrategyText = snapshot.content.topics[0].strategic_recommendation.paragraphs[0];
  const v40StrategyIndex = word.indexOf(v40StrategyText);
  assert.notEqual(v40StrategyIndex, -1);
  const v40StrategyParagraph = word.slice(
    word.lastIndexOf("<w:p>", v40StrategyIndex),
    word.indexOf("</w:p>", v40StrategyIndex),
  );
  assert.doesNotMatch(v40StrategyParagraph, /<w:numPr>/);
  const orderedMarkers = [
    "公开事件涉及 CSRF",
    "CSRF：攻击者诱导",
    firstSection.paragraphs[1],
    "连接器：让 Agent",
    "技术机制和控制关系",
  ];
  for (const document of [html, word]) {
    const positions = orderedMarkers.map((marker) => {
      const index = document.indexOf(marker);
      assert.notEqual(index, -1, `missing marker: ${marker}`);
      return index;
    });
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
  const csrfParagraphStart = word.lastIndexOf("<w:p>", word.indexOf("CSRF：攻击者诱导"));
  const csrfParagraphEnd = word.indexOf("</w:p>", word.indexOf("CSRF：攻击者诱导"));
  const connectorParagraphStart = word.lastIndexOf("<w:p>", word.indexOf("连接器：让 Agent"));
  assert.ok(connectorParagraphStart > csrfParagraphEnd);
  assert.doesNotMatch(word.slice(csrfParagraphStart, csrfParagraphEnd), /<w:br\/>/);
});

test("v4 HTML and DOCX share the four-layer order and section-bound term sequence", async (t) => {
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
  assert.deepEqual(await readDirIfPresent(failedRoot), []);
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
  assert.deepEqual(await readDirIfPresent(publishRoot), []);

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
