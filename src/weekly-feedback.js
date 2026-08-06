const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { canonicalSha256 } = require("./weekly-insight-contract");
const { readZipEntries } = require("./ooxml");
const { DEFAULT_WEEKLY_FEEDBACK_DOCX_MAX_BYTES } = require("./weekly-limits");

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

function locateBookmarkedSections(documentXml, expectedAnchors, bookmarkNames = {}, options = {}) {
  const sections = {};
  const starts = [...documentXml.matchAll(/<w:bookmarkStart\b[^>]*\/>/g)].map((match) => ({
    index: match.index,
    xml: match[0],
    id: /\bw:id="([^"]+)"/.exec(match[0])?.[1],
    name: /\bw:name="([^"]+)"/.exec(match[0])?.[1],
  }));
  for (const anchor of expectedAnchors) {
    const bookmarkName = bookmarkNames[anchor] || anchor;
    const matches = starts.filter((start) => start.name === bookmarkName);
    if (!matches.length && options.allowMissingBookmarks) {
      sections[anchor] = null;
      continue;
    }
    if (matches.length !== 1 || !matches[0].id) throw new Error(`DOCX missing or duplicate section bookmark: ${anchor}`);
    const start = matches[0];
    const endPattern = new RegExp(`<w:bookmarkEnd\\b[^>]*\\bw:id="${escapeRegExp(start.id)}"[^>]*/>`);
    const afterStart = start.index + start.xml.length;
    const end = endPattern.exec(documentXml.slice(afterStart));
    if (!end) throw new Error(`DOCX missing section bookmark end: ${anchor}`);
    sections[anchor] = {
      start: start.index,
      end: afterStart + end.index + end[0].length,
      text: textFromXml(documentXml.slice(start.index, afterStart + end.index)),
    };
  }
  return sections;
}

function parseBookmarkedSections(documentXml, expectedAnchors, bookmarkNames = {}) {
  return Object.fromEntries(
    Object.entries(locateBookmarkedSections(documentXml, expectedAnchors, bookmarkNames))
      .map(([anchor, section]) => [anchor, section?.text ?? null]),
  );
}

function normalizeWordText(xml) {
  return ["t", "instrText", "delText"].reduce(
    (normalized, tag) => normalized.replace(
      new RegExp(`(<w:${tag}\\b[^>]*>)[\\s\\S]*?(<\\/w:${tag}>)`, "g"),
      "$1<weekly-text/>$2",
    ),
    xml,
  );
}

function documentXmlForOverall(documentXml, locatedSections, textChangedAnchors) {
  return Object.entries(locatedSections)
    .filter(([, section]) => section)
    .sort((left, right) => right[1].start - left[1].start)
    .reduce(
      (xml, [anchor, section]) => {
        if (!textChangedAnchors.has(anchor)) return xml;
        return `${xml.slice(0, section.start)}${normalizeWordText(xml.slice(section.start, section.end))}${xml.slice(section.end)}`;
      },
      documentXml,
    );
}

function mediaManifest(entries) {
  return [...entries.entries()]
    .filter(([name]) => name.startsWith("word/media/") && name.length > "word/media/".length)
    .map(([name, value]) => ({
      name,
      sha256: crypto.createHash("sha256").update(value).digest("hex"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function documentRelationshipsManifest(entries) {
  const name = "word/_rels/document.xml.rels";
  const value = entries.get(name);
  if (!value) throw new Error("Invalid DOCX: document relationships are missing");
  return {
    name,
    sha256: crypto.createHash("sha256").update(value).digest("hex"),
  };
}

function readDocxContract(buffer, expectedAnchors, options = {}) {
  const { allowMissingBookmarks = false, ...zipOptions } = options;
  const entries = readZipEntries(buffer, zipOptions);
  const customXml = entries.get("docProps/custom.xml")?.toString("utf8");
  const documentXml = entries.get("word/document.xml")?.toString("utf8");
  if (!customXml || !documentXml) throw new Error("Invalid DOCX: required parts are missing");
  const properties = parseCustomProperties(customXml);
  let bookmarkNames = {};
  if (properties.section_bookmarks) {
    try {
      bookmarkNames = JSON.parse(properties.section_bookmarks);
    } catch (error) {
      throw new Error("Invalid DOCX: section_bookmarks is not valid JSON");
    }
    if (!bookmarkNames || Array.isArray(bookmarkNames) || typeof bookmarkNames !== "object") {
      throw new Error("Invalid DOCX: section_bookmarks must be an object");
    }
    const resolvedNames = expectedAnchors.map((anchor) => bookmarkNames[anchor]);
    if (resolvedNames.some((name) => typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name))) {
      throw new Error("Invalid DOCX: section_bookmarks does not cover every section");
    }
    if (new Set(resolvedNames).size !== resolvedNames.length) {
      throw new Error("Invalid DOCX: section_bookmarks contains duplicate names");
    }
  }
  const locatedSections = locateBookmarkedSections(documentXml, expectedAnchors, bookmarkNames, {
    allowMissingBookmarks,
  });
  const media = mediaManifest(entries);
  const documentRelationships = documentRelationshipsManifest(entries);
  return {
    properties,
    sections: Object.fromEntries(
      Object.entries(locatedSections).map(([anchor, section]) => [anchor, section?.text ?? null]),
    ),
    document_text: textFromXml(documentXml),
    document_xml: documentXml,
    located_sections: locatedSections,
    media,
    document_relationships: documentRelationships,
    content_fingerprint: canonicalSha256({
      document_xml: documentXml,
      document_relationships: documentRelationships,
      media,
    }),
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
    maxDocxBytes = DEFAULT_WEEKLY_FEEDBACK_DOCX_MAX_BYTES,
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
    const edited = readDocxContract(editedDocx, anchors, { ...zipOptions, allowMissingBookmarks: true });
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
    const textChangedAnchors = new Set(sectionDiffs.map((diff) => diff.anchor));
    const originalOverallFingerprint = canonicalSha256({
      document_xml: documentXmlForOverall(original.document_xml, original.located_sections, textChangedAnchors),
      document_relationships: original.document_relationships,
      media: original.media,
    });
    const editedOverallFingerprint = canonicalSha256({
      document_xml: documentXmlForOverall(edited.document_xml, edited.located_sections, textChangedAnchors),
      document_relationships: edited.document_relationships,
      media: edited.media,
    });
    if (originalOverallFingerprint !== editedOverallFingerprint) {
      sectionDiffs.push({
        anchor: "overall",
        before_sha256: originalOverallFingerprint,
        after_sha256: editedOverallFingerprint,
        before: excerpt(original.document_text),
        after: excerpt(edited.document_text),
      });
    }
    if (sectionDiffs.length) finalHash = edited.content_fingerprint;
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
