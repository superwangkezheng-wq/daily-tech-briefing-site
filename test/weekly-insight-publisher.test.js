const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createWeeklySnapshot } = require("./helpers/weekly-fixture");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { readZipEntries } = require("../src/ooxml");

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
