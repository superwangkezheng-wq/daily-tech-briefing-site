const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWeeklySnapshot } = require("./helpers/weekly-fixture");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { createZip, readZipEntries } = require("../src/ooxml");
const { parseBookmarkedSections, saveWeeklyFeedback } = require("../src/weekly-feedback");

test("binds an edited Word to the exact artifact and records section-level diffs", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-feedback-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publishRoot = path.join(root, "published");
  const feedbackDir = path.join(root, "feedback");
  const snapshot = createWeeklySnapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  const documentXml = entries.get("word/document.xml").toString("utf8")
    .replace("成本、时延与可靠性需要在同一评测口径下观察。", "成本、时延、能耗与可靠性需要使用统一评测口径。");
  entries.set("word/document.xml", Buffer.from(documentXml));
  const editedDocx = createZip([...entries.entries()]);

  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir,
    sectionAnchor: "core_insight",
    comment: "补充能耗维度。",
    editedDocx,
  });
  assert.equal(result.artifact_id, snapshot.artifact_id);
  assert.equal(result.draft_content_sha256, snapshot.content_sha256);
  assert.equal(result.final_content_sha256.length, 64);
  assert.notEqual(result.final_content_sha256, snapshot.content_sha256);
  assert.deepEqual(result.section_diffs.map((item) => item.anchor), ["core_insight"]);
  assert.match(result.section_diffs[0].before, /成本、时延与可靠性/);
  assert.match(result.section_diffs[0].after, /成本、时延、能耗与可靠性/);
  const stored = JSON.parse(await fs.readFile(result.file_path, "utf8"));
  assert.equal(stored.source_run_id, snapshot.source_run_id);
  assert.equal(stored.comment, "补充能耗维度。");
});

test("rejects an edited Word copied from another artifact", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-feedback-mismatch-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const entries = readZipEntries(await fs.readFile(docxPath));
  entries.set(
    "docProps/custom.xml",
    Buffer.from(entries.get("docProps/custom.xml").toString("utf8").replace(snapshot.artifact_id, "wsi-other-artifact")),
  );
  await assert.rejects(
    saveWeeklyFeedback({
      snapshot,
      manifest: receipt,
      originalDocxPath: docxPath,
      feedbackDir: path.join(root, "feedback"),
      sectionAnchor: "overall",
      comment: "mismatch",
      editedDocx: createZip([...entries.entries()]),
    }),
    /artifact_id mismatch/i,
  );
});

test("text-only feedback remains bound to the draft hash", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-feedback-text-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = createWeeklySnapshot();
  const receipt = await publishWeeklySnapshot(snapshot, { publishRoot: path.join(root, "published") });
  const docxPath = path.join(receipt.artifact_dir, `${snapshot.artifact_id}.docx`);
  const result = await saveWeeklyFeedback({
    snapshot,
    manifest: receipt,
    originalDocxPath: docxPath,
    feedbackDir: path.join(root, "feedback"),
    sectionAnchor: "verified_facts",
    comment: "建议补充一条反证。",
  });
  assert.equal(result.final_content_sha256, snapshot.content_sha256);
  assert.deepEqual(result.section_diffs, []);
});

test("joins Word runs within paragraphs and treats bookmark ids literally", () => {
  const xml = `<w:document><w:body><w:p><w:bookmarkStart w:id="1.*" w:name="core_insight"/><w:r><w:t>A</w:t></w:r><w:r><w:t>B</w:t></w:r></w:p><w:bookmarkEnd w:id="1XX"/><w:p><w:r><w:t>C</w:t></w:r></w:p><w:bookmarkEnd w:id="1.*"/></w:body></w:document>`;
  assert.equal(parseBookmarkedSections(xml, ["core_insight"]).core_insight, "AB\nC");
});

test("rejects unsafe artifact ids before constructing feedback paths", async () => {
  const snapshot = { artifact_id: "../../private", source_run_id: "run", version: "1", content_sha256: "a".repeat(64) };
  await assert.rejects(
    saveWeeklyFeedback({
      snapshot,
      manifest: { ...snapshot, section_anchors: [] },
      originalDocxPath: "/unused",
      feedbackDir: "/tmp/weekly-feedback-unsafe-id",
      sectionAnchor: "overall",
      comment: "unsafe",
    }),
    /invalid artifact_id/i,
  );
});
