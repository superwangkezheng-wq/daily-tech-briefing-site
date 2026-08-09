const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createZip, readZipEntries } = require("../src/ooxml");
const { saveWeeklyFeedback } = require("../src/weekly-feedback");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { wordBookmarkName } = require("../src/weekly-insight-renderer");
const { createValidPng } = require("./helpers/image-fixture");
const { createWeeklyV4Snapshot } = require("./helpers/weekly-fixture");

function removeBookmarkedRegion(documentXml, anchor) {
  const name = wordBookmarkName(anchor);
  const startPattern = new RegExp(`<w:bookmarkStart\\b[^>]*\\bw:id="([^"]+)"[^>]*\\bw:name="${name}"[^>]*/>`);
  const start = startPattern.exec(documentXml);
  assert.ok(start, `fixture must contain bookmark ${anchor}`);
  const paragraphMatches = [...documentXml.slice(0, start.index).matchAll(/<w:p(?:\s[^>]*)?>/g)];
  const paragraphStart = paragraphMatches.at(-1)?.index ?? -1;
  const endPattern = new RegExp(`<w:bookmarkEnd\\b[^>]*\\bw:id="${start[1]}"[^>]*/>`);
  const end = endPattern.exec(documentXml.slice(start.index + start[0].length));
  assert.ok(end, `fixture must contain bookmark end ${anchor}`);
  const endIndex = start.index + start[0].length + end.index + end[0].length;
  const paragraphEnd = documentXml.indexOf("</w:p>", endIndex);
  assert.ok(paragraphStart >= 0 && paragraphEnd >= 0, `fixture must contain bookmarked paragraphs for ${anchor}`);
  return `${documentXml.slice(0, paragraphStart)}${documentXml.slice(paragraphEnd + "</w:p>".length)}`;
}

test("v4 feedback records Word edits outside chapter bookmarks as an overall diff", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-overall-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const originalXml = entries.get("word/document.xml").toString("utf8");
  const editedTitle = `${snapshot.content.title}（终稿）`;
  const editedXml = originalXml.replace(snapshot.content.title, editedTitle);
  assert.notEqual(editedXml, originalXml, "fixture must edit the issue title outside chapter bookmarks");
  entries.set("word/document.xml", Buffer.from(editedXml));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "修改整期标题。",
    editedDocx: createZip([...entries.entries()]),
  });

  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["overall"]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
  assert.match(result.section_diffs[0].before, new RegExp(snapshot.content.title));
  assert.match(result.section_diffs[0].after, new RegExp(editedTitle));
});

test("v4 feedback records a topic-title edit outside chapter bookmarks", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-topic-title-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const originalXml = entries.get("word/document.xml").toString("utf8");
  const topicTitle = snapshot.content.topics[0].title;
  const editedXml = originalXml.replace(topicTitle, `${topicTitle}（人工校准）`);
  assert.notEqual(editedXml, originalXml, "fixture must edit the topic title outside chapter bookmarks");
  entries.set("word/document.xml", Buffer.from(editedXml));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "修改专题标题。",
    editedDocx: createZip([...entries.entries()]),
  });

  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["overall"]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
});

test("v4 feedback records non-text XML edits inside a chapter bookmark", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-section-xml-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const originalXml = entries.get("word/document.xml").toString("utf8");
  const bookmarkMarker = `w:name="${receipt.section_anchors[0]}"/>`;
  const editedXml = originalXml.replace(bookmarkMarker, `${bookmarkMarker}<w:proofErr w:type="spellStart"/>`);
  assert.notEqual(editedXml, originalXml, "fixture must edit XML inside a chapter bookmark");
  entries.set("word/document.xml", Buffer.from(editedXml));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: receipt.section_anchors[0],
    comment: "修改专题内格式。",
    editedDocx: createZip([...entries.entries()]),
  });

  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["overall"]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
});

test("v4 feedback records replaced Word media as an overall diff", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot();
  const media = {
    id: "feedback-architecture-v4",
    kind: "architecture",
    src: "https://assets.example.com/feedback-architecture.png",
    alt: "Agent 治理架构图",
    caption: "模型、人工和确定性控制的关系。",
    source_label: "依据公开资料绘制",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目绘制",
    logic_type: "dependency",
    logic_summary: "生产元数据不进入读者页面。",
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
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const originalDocx = await fs.readFile(docxPath);
  const unchanged = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "确认原样上传。",
    editedDocx: createZip([...readZipEntries(originalDocx).entries()]),
  });
  assert.deepEqual(unchanged.section_diffs, []);
  assert.equal(unchanged.final_content_sha256, snapshot.content_sha256);

  const entries = readZipEntries(originalDocx);
  const mediaName = [...entries.keys()].find((name) => name.startsWith("word/media/"));
  assert.ok(mediaName, "fixture must contain an embedded Word image");
  const replacement = Buffer.from(entries.get(mediaName));
  replacement[replacement.length - 1] ^= 1;
  entries.set(mediaName, replacement);

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "替换架构图。",
    editedDocx: createZip([...entries.entries()]),
  });

  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["overall"]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
  assert.notEqual(result.section_diffs[0].before_sha256, result.section_diffs[0].after_sha256);
});

test("v4 feedback records swapped Word image relationships as an overall diff", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-media-rels-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklyV4Snapshot();
  const media = ["a", "b"].map((suffix) => ({
    id: `feedback-architecture-v4-${suffix}`,
    kind: "architecture",
    src: `https://assets.example.com/feedback-architecture-${suffix}.png`,
    alt: `Agent 治理架构图 ${suffix}`,
    caption: `图 ${suffix === "a" ? "1" : "2"}｜模型、人工和确定性控制的关系。`,
    source_label: "依据公开资料绘制",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "本项目绘制",
    logic_type: "dependency",
    logic_summary: "生产元数据不进入读者页面。",
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
  const receipt = await publishWeeklySnapshot(snapshot, {
    publishRoot: path.join(root, "published"),
    loadMedia: async (item) => createValidPng(item.id.endsWith("-b") ? 1 : 0),
  });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const relsName = "word/_rels/document.xml.rels";
  const rels = entries.get(relsName).toString("utf8");
  const targets = [...rels.matchAll(/Target="(media\/[^"]+)"/g)].map((match) => match[1]);
  assert.equal(targets.length, 2, "fixture must contain two image relationships");
  const swapped = rels
    .replace(targets[0], "__WEEKLY_MEDIA_TARGET_SWAP__")
    .replace(targets[1], targets[0])
    .replace("__WEEKLY_MEDIA_TARGET_SWAP__", targets[1]);
  assert.notEqual(swapped, rels, "fixture must swap the displayed image relationships");
  entries.set(relsName, Buffer.from(swapped));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "交换两张架构图的显示位置。",
    editedDocx: createZip([...entries.entries()]),
  });

  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["overall"]);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
});

test("v4 feedback records a deleted topic instead of rejecting its missing bookmarks", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-v4-feedback-topic-delete-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklyV4Snapshot({ topicCount: 2 });
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const firstTopicAnchors = receipt.section_anchors.slice(0, 6);
  let editedXml = entries.get("word/document.xml").toString("utf8");
  for (const anchor of firstTopicAnchors) editedXml = removeBookmarkedRegion(editedXml, anchor);
  entries.set("word/document.xml", Buffer.from(editedXml));

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "overall",
    comment: "删除第一个专题，保留第二个专题作为人工终稿。",
    editedDocx: createZip([...entries.entries()]),
  });

  for (const anchor of firstTopicAnchors) {
    const diff = result.section_diffs.find((item) => item.anchor === anchor);
    assert.ok(diff, `deleted section must be recorded: ${anchor}`);
    assert.equal(diff.after, "");
  }
  assert.ok(result.section_diffs.some((item) => item.anchor === "overall"));
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
});
