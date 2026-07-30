const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWeeklySnapshot } = require("./helpers/weekly-fixture");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { readZipEntries } = require("../src/ooxml");

function xmlElements(xml, tagName) {
  const paired = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "g");
  const selfClosing = new RegExp(`<${tagName}\\b[^>]*/>`, "g");
  return [...String(xml).matchAll(paired), ...String(xml).matchAll(selfClosing)].map((match) => match[0]);
}

function xmlAttribute(element, attributeName) {
  return new RegExp(`(?:^|\\s)${attributeName}="([^"]*)"`).exec(element)?.[1];
}

function xmlTextContent(xml) {
  const decode = (value) => String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
  return xmlElements(xml, "w:t")
    .map((element) => decode(element.replace(/^<w:t\\b[^>]*>|<\/w:t>$/g, "")))
    .join("");
}

test("atomically publishes matching HTML, DOCX, content, and manifest", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot({
    content: {
      title: `${"很长的周度洞察标题".repeat(18)} <script>alert(1)</script>`,
    },
  });

  const result = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const artifactDir = path.join(root, snapshot.artifact_id);
  const manifest = JSON.parse(await fs.readFile(path.join(artifactDir, "manifest.json"), "utf8"));
  const html = await fs.readFile(path.join(artifactDir, "index.html"), "utf8");
  const docx = await fs.readFile(path.join(artifactDir, `${snapshot.artifact_id}.docx`));
  const entries = readZipEntries(docx);
  const customProps = entries.get("docProps/custom.xml").toString("utf8");
  const documentXml = entries.get("word/document.xml").toString("utf8");

  assert.equal(result.artifact_id, snapshot.artifact_id);
  assert.equal(manifest.content_sha256, snapshot.content_sha256);
  assert.equal(manifest.source_run_id, snapshot.source_run_id);
  assert.equal(manifest.version, snapshot.version);
  assert.deepEqual(manifest.section_anchors, [
    "core_insight",
    "verified_facts",
    "lenovo_china_implications",
  ]);
  assert.match(html, new RegExp(`name="weekly:artifact_id" content="${snapshot.artifact_id}"`));
  assert.match(html, /id="core_insight"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /期级战略建议/);
  assert.match(customProps, new RegExp(snapshot.content_sha256));
  assert.match(customProps, new RegExp(snapshot.source_run_id));
  assert.match(documentXml, /w:name="core_insight"/);
  assert.equal(manifest.files.html.sha256.length, 64);
  assert.equal(manifest.files.docx.sha256.length, 64);
});

test("DOCX declares CJK-safe business styles and real bullet numbering", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-docx-style-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();

  const result = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const docx = await fs.readFile(path.join(result.artifact_dir, `${snapshot.artifact_id}.docx`));
  const entries = readZipEntries(docx);
  const contentTypes = entries.get("[Content_Types].xml")?.toString("utf8") || "";
  const documentRels = entries.get("word/_rels/document.xml.rels")?.toString("utf8") || "";
  const documentXml = entries.get("word/document.xml")?.toString("utf8") || "";
  const stylesXml = entries.get("word/styles.xml")?.toString("utf8") || "";
  const numberingXml = entries.get("word/numbering.xml")?.toString("utf8") || "";

  const overrides = new Map(xmlElements(contentTypes, "Override").map((element) => [xmlAttribute(element, "PartName"), element]));
  assert.equal(xmlAttribute(overrides.get("/word/styles.xml"), "ContentType"), "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml");
  assert.equal(xmlAttribute(overrides.get("/word/numbering.xml"), "ContentType"), "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");

  const relationships = new Map(xmlElements(documentRels, "Relationship").map((element) => [xmlAttribute(element, "Type"), element]));
  assert.equal(xmlAttribute(relationships.get("http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"), "Target"), "styles.xml");
  assert.equal(xmlAttribute(relationships.get("http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering"), "Target"), "numbering.xml");

  const styles = new Map(xmlElements(stylesXml, "w:style").map((element) => [xmlAttribute(element, "w:styleId"), element]));
  for (const styleId of ["Normal", "WeeklyTitle"]) {
    const style = styles.get(styleId);
    assert.ok(style, `missing ${styleId}`);
    assert.match(style, /<w:rFonts\b[^>]*w:ascii="Arial Unicode MS"[^>]*w:hAnsi="Arial Unicode MS"[^>]*w:eastAsia="Arial Unicode MS"/);
    assert.match(style, /<w:lang\b[^>]*w:val="zh-CN"[^>]*w:eastAsia="zh-CN"/);
  }
  for (const style of styles.values()) {
    assert.ok(style.indexOf("<w:pPr>") < style.indexOf("<w:rPr>"), `paragraph properties must precede run properties in ${xmlAttribute(style, "w:styleId")}`);
  }

  const numId = /<w:numPr>[\s\S]*?<w:numId w:val="([^"]+)"\/>[\s\S]*?<\/w:numPr>/.exec(documentXml)?.[1];
  const num = xmlElements(numberingXml, "w:num").find((element) => xmlAttribute(element, "w:numId") === numId);
  const abstractNumId = /<w:abstractNumId w:val="([^"]+)"\/>/.exec(num)?.[1];
  const abstractNum = xmlElements(numberingXml, "w:abstractNum").find((element) => xmlAttribute(element, "w:abstractNumId") === abstractNumId);
  assert.match(abstractNum, /<w:numFmt w:val="bullet"\/>/);
  assert.doesNotMatch(xmlTextContent(documentXml), /•/);
});

test("DOCX emits unique Word-safe bookmarks without blank end paragraphs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-docx-bookmark-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = createWeeklySnapshot();
  const snapshot = createWeeklySnapshot({
    content: {
      sections: base.content.sections.map((section, index) => ({
        ...section,
        anchor: `thesis_same_long_prefix_for_collision_${index}_${"suffix".repeat(4)}`,
      })),
    },
  });

  const result = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const docx = await fs.readFile(path.join(result.artifact_dir, `${snapshot.artifact_id}.docx`));
  const entries = readZipEntries(docx);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") || "";
  const bookmarkStarts = xmlElements(documentXml, "w:bookmarkStart");
  const names = bookmarkStarts.map((element) => xmlAttribute(element, "w:name"));

  assert.equal(names.length, snapshot.content.sections.length);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) {
    assert.match(name, /^[A-Za-z][A-Za-z0-9_]*$/);
    assert.ok(name.length <= 40, `bookmark exceeds Word limit: ${name}`);
  }
  assert.doesNotMatch(documentXml, /<w:p><w:bookmarkEnd\b[^>]*\/><\/w:p>/);
});

test("a DOCX failure leaves no visible half-publication", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-fail-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();

  await assert.rejects(
    publishWeeklySnapshot(snapshot, {
      publishRoot: root,
      renderDocx() {
        throw new Error("simulated DOCX failure");
      },
    }),
    /simulated DOCX failure/,
  );
  await assert.rejects(fs.stat(path.join(root, snapshot.artifact_id)), { code: "ENOENT" });
  const names = await fs.readdir(root);
  assert.deepEqual(names, []);
});

test("concurrent identical publications converge on one validated artifact", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-race-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();
  const [first, second] = await Promise.all([
    publishWeeklySnapshot(snapshot, { publishRoot: root }),
    publishWeeklySnapshot(snapshot, { publishRoot: root }),
  ]);
  assert.equal(first.content_sha256, snapshot.content_sha256);
  assert.equal(second.content_sha256, snapshot.content_sha256);
  assert.equal([first, second].filter((item) => item.unchanged).length, 1);
  assert.deepEqual((await fs.readdir(root)).filter((name) => name.startsWith(".stage-")), []);
});

test("an existing artifact cannot gain public authorization in place", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-authorization-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();
  await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const publicSnapshot = createWeeklySnapshot({
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: "separate-release",
    },
  });
  await assert.rejects(
    publishWeeklySnapshot(publicSnapshot, { publishRoot: root }),
    /already exists with different content/i,
  );
});

test("bad image URLs render an accessible fallback", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-image-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot({
    content: {
      media: [{
        id: "arch_01",
        kind: "architecture",
        src: "https://invalid.example/broken.png",
        alt: "架构图替代文本",
        caption: "图片暂不可用",
        source_label: "Example",
        source_url: null,
      }],
    },
  });
  const result = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(result.artifact_dir, "index.html"), "utf8");
  assert.match(html, /图像暂不可用/);
  assert.match(html, /架构图替代文本/);
  assert.match(html, /data-weekly-media/);
  assert.doesNotMatch(html, /javascript:/);
});

test("publishes an explicit no-selection issue without invented sections", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-publish-empty-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot({
    artifact_id: "wsi-2026-w31-empty",
    source_run_id: "weekly-run-2026-w31-empty",
    content: {
      status: "no_selection",
      selected_theses: 0,
      sections: [],
      evidence: [],
      media: [],
    },
  });
  const result = await publishWeeklySnapshot(snapshot, { publishRoot: root });
  const html = await fs.readFile(path.join(result.artifact_dir, "index.html"), "utf8");
  assert.match(html, /没有通过证据门槛的战略判断/);
  assert.deepEqual(result.section_anchors, []);
});
