const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { canonicalSha256 } = require("./weekly-insight-contract");
const { readZipEntries } = require("./ooxml");

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseCustomProperties(xml) {
  const properties = {};
  const pattern = /<property\b[^>]*\bname="([^"]+)"[^>]*>[\s\S]*?<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>[\s\S]*?<\/property>/g;
  for (const match of xml.matchAll(pattern)) properties[decodeXml(match[1])] = decodeXml(match[2]);
  return properties;
}

function textFromXml(xml) {
  return decodeXml(
    String(xml || "")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBookmarkedSections(documentXml, expectedAnchors) {
  const sections = {};
  const starts = [...documentXml.matchAll(/<w:bookmarkStart\b[^>]*\/>/g)].map((match) => ({
    index: match.index,
    xml: match[0],
    id: /\bw:id="([^"]+)"/.exec(match[0])?.[1],
    name: /\bw:name="([^"]+)"/.exec(match[0])?.[1],
  }));
  for (const anchor of expectedAnchors) {
    const matches = starts.filter((start) => start.name === anchor);
    if (matches.length !== 1 || !matches[0].id) throw new Error(`DOCX missing or duplicate section bookmark: ${anchor}`);
    const start = matches[0];
    const endPattern = new RegExp(`<w:bookmarkEnd\\b[^>]*\\bw:id="${escapeRegExp(start.id)}"[^>]*/>`);
    const afterStart = start.index + start.xml.length;
    const end = endPattern.exec(documentXml.slice(afterStart));
    if (!end) throw new Error(`DOCX missing section bookmark end: ${anchor}`);
    sections[anchor] = textFromXml(documentXml.slice(start.index, afterStart + end.index));
  }
  return sections;
}

function readDocxContract(buffer, expectedAnchors, options = {}) {
  const entries = readZipEntries(buffer, options);
  const customXml = entries.get("docProps/custom.xml")?.toString("utf8");
  const documentXml = entries.get("word/document.xml")?.toString("utf8");
  if (!customXml || !documentXml) throw new Error("Invalid DOCX: required parts are missing");
  return {
    properties: parseCustomProperties(customXml),
    sections: parseBookmarkedSections(documentXml, expectedAnchors),
  };
}

function excerpt(value, max = 1200) {
  const normalized = String(value || "");
  return normalized.length <= max ? normalized : `${normalized.slice(0, max)}…`;
}

async function saveWeeklyFeedback(options) {
  const {
    snapshot,
    manifest,
    originalDocxPath,
    feedbackDir,
    sectionAnchor = "overall",
    comment,
    editedDocx,
    maxDocxBytes = 8 * 1024 * 1024,
  } = options;
  const normalizedComment = String(comment || "").trim();
  if (!normalizedComment || normalizedComment.length > 4000) throw new Error("Feedback comment must be 1..4000 characters");
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) {
    throw new Error("Invalid artifact_id for feedback file path");
  }
  const anchors = manifest.section_anchors || [];
  if (sectionAnchor !== "overall" && !anchors.includes(sectionAnchor)) throw new Error("Unknown feedback section anchor");
  for (const key of ["artifact_id", "source_run_id", "version", "content_sha256"]) {
    if (manifest[key] !== snapshot[key]) throw new Error(`Manifest ${key} mismatch`);
  }

  let finalHash = snapshot.content_sha256;
  let sectionDiffs = [];
  if (editedDocx) {
    if (!Buffer.isBuffer(editedDocx) || editedDocx.length > maxDocxBytes) throw new Error("Edited DOCX is invalid or too large");
    const zipOptions = { maxEntryBytes: Math.min(maxDocxBytes * 2, 16 * 1024 * 1024) };
    const original = readDocxContract(await fsp.readFile(originalDocxPath), anchors, zipOptions);
    const edited = readDocxContract(editedDocx, anchors, zipOptions);
    const expected = {
      artifact_id: snapshot.artifact_id,
      source_run_id: snapshot.source_run_id,
      version: snapshot.version,
      content_sha256: snapshot.content_sha256,
    };
    for (const [key, value] of Object.entries(expected)) {
      if (original.properties[key] !== value) throw new Error(`Original DOCX ${key} mismatch`);
      if (edited.properties[key] !== value) throw new Error(`Edited DOCX ${key} mismatch`);
    }
    sectionDiffs = anchors
      .filter((anchor) => original.sections[anchor] !== edited.sections[anchor])
      .map((anchor) => ({
        anchor,
        before_sha256: canonicalSha256(original.sections[anchor]),
        after_sha256: canonicalSha256(edited.sections[anchor]),
        before: excerpt(original.sections[anchor]),
        after: excerpt(edited.sections[anchor]),
      }));
    finalHash = canonicalSha256(edited.sections);
  }

  const record = {
    schema_version: "weekly-insight-feedback/v1",
    feedback_id: crypto.randomUUID(),
    received_at: new Date().toISOString(),
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    version: snapshot.version,
    draft_content_sha256: snapshot.content_sha256,
    final_content_sha256: finalHash,
    section_anchor: sectionAnchor,
    comment: normalizedComment,
    edited_docx_supplied: Boolean(editedDocx),
    section_diffs: sectionDiffs,
  };
  await fsp.mkdir(feedbackDir, { recursive: true });
  const filePath = path.join(feedbackDir, `${snapshot.artifact_id}-${record.feedback_id}.json`);
  await fsp.writeFile(filePath, JSON.stringify(record, null, 2), { encoding: "utf8", flag: "wx" });
  return { ...record, file_path: filePath };
}

module.exports = {
  parseCustomProperties,
  parseBookmarkedSections,
  readDocxContract,
  saveWeeklyFeedback,
};
