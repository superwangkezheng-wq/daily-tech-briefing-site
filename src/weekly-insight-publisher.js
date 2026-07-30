const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { validateWeeklySnapshot } = require("./weekly-insight-contract");
const { renderWeeklyHtml, renderWeeklyDocx, wordBookmarkName } = require("./weekly-insight-renderer");
const { readZipEntries } = require("./ooxml");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileReceipt(filePath) {
  const value = await fsp.readFile(filePath);
  return { sha256: sha256(value), bytes: value.length };
}

async function readMatchingArtifact(artifactDir, snapshot) {
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) return null;
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(artifactDir, "manifest.json"), "utf8"));
    if (
      manifest.schema_version !== "weekly-insight-publication-manifest/v1" ||
      manifest.artifact_id !== snapshot.artifact_id ||
      manifest.source_run_id !== snapshot.source_run_id ||
      manifest.version !== snapshot.version ||
      manifest.approved_candidate_sha256 !== snapshot.approved_candidate_sha256 ||
      manifest.content_sha256 !== snapshot.content_sha256 ||
      JSON.stringify(manifest.publication) !== JSON.stringify(snapshot.publication) ||
      JSON.stringify(manifest.section_anchors) !== JSON.stringify(snapshot.section_anchors)
    ) {
      return null;
    }
    for (const [key, name] of [
      ["html", "index.html"],
      ["docx", `${snapshot.artifact_id}.docx`],
      ["content", "content.json"],
    ]) {
      const actual = await fileReceipt(path.join(artifactDir, name));
      if (actual.sha256 !== manifest.files?.[key]?.sha256 || actual.bytes !== manifest.files?.[key]?.bytes) {
        return null;
      }
    }
    return manifest;
  } catch (error) {
    return null;
  }
}

function verifyDocx(docx, snapshot) {
  const entries = readZipEntries(docx);
  const custom = entries.get("docProps/custom.xml")?.toString("utf8") || "";
  const document = entries.get("word/document.xml")?.toString("utf8") || "";
  for (const value of [snapshot.artifact_id, snapshot.source_run_id, snapshot.version, snapshot.content_sha256]) {
    if (!custom.includes(value)) throw new Error(`DOCX receipt mismatch: ${value}`);
  }
  for (const anchor of snapshot.section_anchors) {
    if (!document.includes(`w:name="${wordBookmarkName(anchor)}"`)) throw new Error(`DOCX missing section anchor: ${anchor}`);
  }
}

function verifyHtml(html, snapshot) {
  for (const [key, value] of [
    ["artifact_id", snapshot.artifact_id],
    ["source_run_id", snapshot.source_run_id],
    ["version", snapshot.version],
    ["content_sha256", snapshot.content_sha256],
  ]) {
    if (!html.includes(`name="weekly:${key}" content="${value}"`)) throw new Error(`HTML receipt mismatch: ${key}`);
  }
  for (const anchor of snapshot.section_anchors) {
    if (!html.includes(`id="${anchor}"`)) throw new Error(`HTML missing section anchor: ${anchor}`);
  }
}

async function publishWeeklySnapshot(input, options = {}) {
  const snapshot = validateWeeklySnapshot(input);
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) {
    throw new Error("Invalid artifact_id for publication path");
  }
  const publishRoot = path.resolve(options.publishRoot || ".cache/weekly-insights");
  const htmlRenderer = options.renderHtml || renderWeeklyHtml;
  const docxRenderer = options.renderDocx || renderWeeklyDocx;
  const artifactDir = path.join(publishRoot, snapshot.artifact_id);
  const stageDir = path.join(publishRoot, `.stage-${snapshot.artifact_id}-${crypto.randomUUID()}`);
  await fsp.mkdir(publishRoot, { recursive: true });

  if (fs.existsSync(artifactDir)) {
    const existing = await readMatchingArtifact(artifactDir, snapshot);
    if (existing) return { ...existing, artifact_dir: artifactDir, unchanged: true };
    throw new Error(`Artifact already exists with different content: ${snapshot.artifact_id}`);
  }

  try {
    await fsp.mkdir(stageDir, { recursive: false });
    const html = htmlRenderer(snapshot);
    await fsp.writeFile(path.join(stageDir, "index.html"), html, "utf8");
    const docx = docxRenderer(snapshot);
    if (!Buffer.isBuffer(docx)) throw new Error("DOCX renderer must return a Buffer");
    await fsp.writeFile(path.join(stageDir, `${snapshot.artifact_id}.docx`), docx);
    const { section_anchors, ...approvedSnapshot } = snapshot;
    await fsp.writeFile(path.join(stageDir, "content.json"), JSON.stringify(approvedSnapshot, null, 2), "utf8");

    verifyHtml(html, snapshot);
    verifyDocx(docx, snapshot);
    const manifest = {
      schema_version: "weekly-insight-publication-manifest/v1",
      artifact_id: snapshot.artifact_id,
      source_run_id: snapshot.source_run_id,
      version: snapshot.version,
      approved_candidate_sha256: snapshot.approved_candidate_sha256,
      content_sha256: snapshot.content_sha256,
      section_anchors: snapshot.section_anchors,
      publication: snapshot.publication,
      period: snapshot.content.period,
      title: snapshot.content.title,
      dek: snapshot.content.dek,
      status: snapshot.content.status,
      selected_theses: snapshot.content.selected_theses,
      committed_at: new Date().toISOString(),
      files: {
        html: await fileReceipt(path.join(stageDir, "index.html")),
        docx: await fileReceipt(path.join(stageDir, `${snapshot.artifact_id}.docx`)),
        content: await fileReceipt(path.join(stageDir, "content.json")),
      },
    };
    await fsp.writeFile(path.join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    try {
      await fsp.rename(stageDir, artifactDir);
    } catch (renameError) {
      const existing = await readMatchingArtifact(artifactDir, snapshot);
      if (!existing) throw renameError;
      await fsp.rm(stageDir, { recursive: true, force: true });
      return { ...existing, artifact_dir: artifactDir, unchanged: true };
    }
    return { ...manifest, artifact_dir: artifactDir, unchanged: false };
  } catch (error) {
    await fsp.rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { publishWeeklySnapshot, verifyHtml, verifyDocx, readMatchingArtifact };
