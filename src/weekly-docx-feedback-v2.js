const crypto = require("node:crypto");
const { SaxesParser } = require("saxes");
const { readZipEntries } = require("./ooxml");
const { validateWeeklySnapshot } = require("./weekly-insight-contract");

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const MAX_DOCX_BYTES = 8 * 1024 * 1024;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 512;
const MAX_XML_ELEMENTS = 100_000;
const MAX_XML_DEPTH = 128;
const MAX_PROCESS_MILLISECONDS = 10_000;

class WeeklyFeedbackValidationError extends Error {
  constructor(message) {
    super(message);
    this.expose = true;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Canonical JSON rejects non-finite numbers");
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function expandedName(uri, local) {
  return uri ? `{${uri}}${local}` : local;
}

function parseStrictXml(payload, partName, startedAt) {
  let xml;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  } catch (error) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${partName} must use valid UTF-8`);
  }
  if (xml.includes("\0")) throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${partName} must use valid UTF-8`);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${partName} cannot contain DTD or entity declarations`);
  }
  const parser = new SaxesParser({ xmlns: true });
  const stack = [];
  let root = null;
  let elements = 0;
  parser.on("opentag", (tag) => {
    elements += 1;
    if (elements > MAX_XML_ELEMENTS || stack.length + 1 > MAX_XML_DEPTH) {
      throw new WeeklyFeedbackValidationError("Invalid DOCX: XML exceeds the element or depth limit");
    }
    if (Date.now() - startedAt > MAX_PROCESS_MILLISECONDS) {
      throw new WeeklyFeedbackValidationError("Invalid DOCX: validation exceeded its processing limit");
    }
    const attributes = Object.values(tag.attributes)
      .filter((attribute) => attribute.uri !== XMLNS_NAMESPACE)
      .map((attribute) => [
        expandedName(attribute.uri, attribute.local),
        String(attribute.value).normalize("NFC"),
      ])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    const node = {
      tag: expandedName(tag.uri, tag.local),
      attributes,
      children: [],
      text: "",
    };
    if (stack.length) stack[stack.length - 1].children.push(node);
    else if (!root) root = node;
    else throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${partName} has multiple XML roots`);
    stack.push(node);
  });
  parser.on("text", (text) => {
    if (stack.length) stack[stack.length - 1].text += text;
  });
  parser.on("cdata", (text) => {
    if (stack.length) stack[stack.length - 1].text += text;
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  try {
    parser.write(xml).close();
  } catch (error) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX XML (${partName}): ${error.message}`);
  }
  if (!root || stack.length) throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${partName} is malformed XML`);
  return root;
}

function attribute(node, localName) {
  const match = node.attributes.find(([name]) => name === localName || name.endsWith(`}${localName}`));
  return match?.[1];
}

function walk(root) {
  const output = [];
  const visit = (node) => {
    output.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return output;
}

function descendantText(node) {
  return `${node.text}${node.children.map(descendantText).join("")}`;
}

function parseFlatUniqueStringMap(value, label) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${label} is invalid JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${label} must be an object`);
  }
  const keyMatches = [...value.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)]
    .map((match) => JSON.parse(`"${match[1]}"`));
  if (new Set(keyMatches).size !== keyMatches.length) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${label} contains duplicate keys`);
  }
  if (Object.values(parsed).some((item) => typeof item !== "string")) {
    throw new WeeklyFeedbackValidationError(`Invalid DOCX: ${label} values must be strings`);
  }
  return parsed;
}

function collectProperties(root) {
  const properties = {};
  for (const property of root.children) {
    const name = attribute(property, "name");
    if (!name) continue;
    if (Object.prototype.hasOwnProperty.call(properties, name)) {
      throw new WeeklyFeedbackValidationError("Invalid DOCX: duplicate custom properties");
    }
    properties[name] = descendantText(property);
  }
  return properties;
}

function normalizeBookmarkText(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC").trim();
}

function indexDocument(root) {
  const elements = [];
  const positions = new Map();
  const subtreeEnds = new Map();
  const visit = (node) => {
    positions.set(node, elements.length);
    elements.push(node);
    node.children.forEach(visit);
    subtreeEnds.set(node, elements.length - 1);
  };
  visit(root);
  return { elements, positions, subtreeEnds };
}

function documentResidualSha256(root, bookmarkNames, expectedIds, positionsById, startedAt) {
  const { elements, positions, subtreeEnds } = indexDocument(root);
  const anchorById = Object.fromEntries(
    Object.entries(bookmarkNames).map(([anchor, name]) => [expectedIds[name], anchor]),
  );
  const intervals = Object.entries(anchorById)
    .map(([id, anchor]) => [positionsById.starts[id], positionsById.ends[id], id, anchor])
    .sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index][0] < intervals[index - 1][1]) {
      throw new WeeklyFeedbackValidationError("DOCX reader-section bookmark ranges must not overlap");
    }
  }
  const structureHashById = {};
  for (const [start, end, id] of intervals) {
    const tokens = elements.slice(start + 1, end).map((node) => [node.tag, node.attributes]);
    structureHashById[id] = sha256(Buffer.from(canonicalJson(tokens)));
  }
  const bookmarkStartTag = `{${WORD_NAMESPACE}}bookmarkStart`;
  const bookmarkEndTag = `{${WORD_NAMESPACE}}bookmarkEnd`;
  const tokens = [];
  const visit = (node) => {
    if (Date.now() - startedAt > MAX_PROCESS_MILLISECONDS) {
      throw new WeeklyFeedbackValidationError("Invalid DOCX: validation exceeded its processing limit");
    }
    const position = positions.get(node);
    const subtreeEnd = subtreeEnds.get(node);
    if (intervals.some(([start, end]) => start < position && subtreeEnd < end)) return;
    const id = attribute(node, "id");
    if (node.tag === bookmarkStartTag && Object.prototype.hasOwnProperty.call(anchorById, id)) {
      tokens.push(["reader-section", anchorById[id], structureHashById[id]]);
      return;
    }
    if (node.tag === bookmarkEndTag && Object.prototype.hasOwnProperty.call(anchorById, id)) return;
    tokens.push(["open", node.tag, node.attributes]);
    if (node.text && node.text.trim()) {
      tokens.push(["text", node.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC")]);
    }
    node.children.forEach(visit);
    tokens.push(["close", node.tag]);
  };
  visit(root);
  return sha256(Buffer.from(canonicalJson(tokens)));
}

function sectionTexts(root, expectedIds) {
  const buffers = Object.fromEntries(Object.values(expectedIds).map((id) => [id, []]));
  const active = new Set();
  const startTag = `{${WORD_NAMESPACE}}bookmarkStart`;
  const endTag = `{${WORD_NAMESPACE}}bookmarkEnd`;
  const textTag = `{${WORD_NAMESPACE}}t`;
  const tabTag = `{${WORD_NAMESPACE}}tab`;
  const paragraphTag = `{${WORD_NAMESPACE}}p`;
  const breaks = new Set([`{${WORD_NAMESPACE}}br`, `{${WORD_NAMESPACE}}cr`]);
  const visit = (node) => {
    const id = attribute(node, "id");
    if (node.tag === startTag && Object.prototype.hasOwnProperty.call(buffers, id)) active.add(id);
    else if (node.tag === endTag && Object.prototype.hasOwnProperty.call(buffers, id)) active.delete(id);
    else if (node.tag === textTag && node.text) active.forEach((key) => buffers[key].push(node.text));
    else if (node.tag === tabTag) active.forEach((key) => buffers[key].push("\t"));
    else if (breaks.has(node.tag)) active.forEach((key) => buffers[key].push("\n"));
    node.children.forEach(visit);
    if (node.tag === paragraphTag) active.forEach((key) => buffers[key].push("\n"));
  };
  visit(root);
  return Object.fromEntries(Object.entries(buffers).map(([id, parts]) => [id, normalizeBookmarkText(parts.join(""))]));
}

function packageReceipts(entries) {
  return new Map(
    [...entries.entries()]
      .filter(([name]) => name !== "word/document.xml")
      .map(([name, value]) => [name, [sha256(value), value.length]]),
  );
}

function parseDocxContract(docx, expectedAnchors) {
  if (!Buffer.isBuffer(docx) || !docx.length || docx.length > MAX_DOCX_BYTES) {
    throw new WeeklyFeedbackValidationError("DOCX payload is missing or too large (8 MiB maximum)");
  }
  const startedAt = Date.now();
  const entries = readZipEntries(docx, {
    maxEntryBytes: MAX_ZIP_ENTRY_BYTES,
    maxTotalBytes: MAX_ZIP_TOTAL_BYTES,
    maxEntries: MAX_ZIP_ENTRIES,
    rejectEncrypted: true,
  });
  for (const name of ["[Content_Types].xml", "docProps/custom.xml", "word/document.xml"]) {
    if (!entries.has(name)) throw new WeeklyFeedbackValidationError(`Invalid DOCX: required part is missing: ${name}`);
  }
  const customRoot = parseStrictXml(entries.get("docProps/custom.xml"), "docProps/custom.xml", startedAt);
  const documentRoot = parseStrictXml(entries.get("word/document.xml"), "word/document.xml", startedAt);
  const properties = collectProperties(customRoot);
  const bookmarkNames = parseFlatUniqueStringMap(properties.section_bookmarks || "{}", "section_bookmarks");
  if (
    Object.keys(bookmarkNames).length !== expectedAnchors.length ||
    expectedAnchors.some((anchor) => !Object.prototype.hasOwnProperty.call(bookmarkNames, anchor)) ||
    Object.values(bookmarkNames).some((name) => !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) ||
    new Set(Object.values(bookmarkNames)).size !== expectedAnchors.length
  ) {
    throw new WeeklyFeedbackValidationError("DOCX bookmark mapping does not match every reader section anchor");
  }
  const startTag = `{${WORD_NAMESPACE}}bookmarkStart`;
  const endTag = `{${WORD_NAMESPACE}}bookmarkEnd`;
  const startsByName = new Map();
  const starts = {};
  const ends = {};
  const elements = walk(documentRoot);
  elements.forEach((node, position) => {
    if (node.tag === startTag) {
      const name = attribute(node, "name");
      const id = attribute(node, "id");
      if (!name || id === undefined || Object.prototype.hasOwnProperty.call(starts, id)) {
        throw new WeeklyFeedbackValidationError("DOCX bookmark starts must have globally unique ids and names");
      }
      starts[id] = position;
      startsByName.set(name, [...(startsByName.get(name) || []), id]);
    } else if (node.tag === endTag) {
      const id = attribute(node, "id");
      if (id === undefined || Object.prototype.hasOwnProperty.call(ends, id)) {
        throw new WeeklyFeedbackValidationError("DOCX bookmark ends must have globally unique ids");
      }
      ends[id] = position;
    }
  });
  if (
    Object.keys(starts).length !== Object.keys(ends).length ||
    Object.keys(starts).some((id) => ends[id] === undefined || ends[id] <= starts[id])
  ) {
    throw new WeeklyFeedbackValidationError("DOCX bookmark starts and ends must form ordered one-to-one pairs");
  }
  const expectedIds = {};
  for (const name of Object.values(bookmarkNames)) {
    const ids = startsByName.get(name) || [];
    if (ids.length !== 1) throw new WeeklyFeedbackValidationError("DOCX is missing a unique reader-section bookmark pair");
    expectedIds[name] = ids[0];
  }
  const textsById = sectionTexts(documentRoot, expectedIds);
  return {
    properties,
    bookmarkNames,
    sections: Object.fromEntries(
      Object.entries(bookmarkNames).map(([anchor, name]) => [anchor, textsById[expectedIds[name]]]),
    ),
    packageReceipts: packageReceipts(entries),
    documentResidualSha256: documentResidualSha256(
      documentRoot,
      bookmarkNames,
      expectedIds,
      { starts, ends },
      startedAt,
    ),
  };
}

function changedPackageParts(before, after, beforeResidual, afterResidual) {
  const names = new Set([...before.keys(), ...after.keys()]);
  const parts = new Set();
  for (const name of names) {
    if (canonicalJson(before.get(name)) === canonicalJson(after.get(name))) continue;
    if (name === "[Content_Types].xml") parts.add("content_types");
    else if (name.startsWith("word/media/")) parts.add("media");
    else if (name.endsWith(".rels") || name.includes("/_rels/")) parts.add("relationships");
    else if (name.startsWith("docProps/")) parts.add("properties");
    else if (/^word\/(header|footer)\d+\.xml$/.test(name)) parts.add("headers_footers");
    else if (["word/styles.xml", "word/numbering.xml", "word/settings.xml", "word/fontTable.xml"].includes(name) || name.startsWith("word/theme/")) parts.add("formatting");
    else parts.add("package");
  }
  if (beforeResidual !== afterResidual) parts.add("document_structure");
  return [...parts].sort();
}

function packageState(receipts, documentResidualSha256) {
  return canonicalJson({
    schema_version: "weekly-insight-docx-package-state/v1",
    document_residual_sha256: documentResidualSha256,
    entries: [...receipts.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([entryPath, receipt]) => ({ path: entryPath, sha256: receipt[0], size_bytes: receipt[1] })),
  });
}

function feedbackAreaMap(snapshot) {
  const map = new Map();
  for (const topic of snapshot.content.topics || []) {
    for (const section of topic.facts?.sections || []) map.set(section.anchor, ["facts"]);
    for (const finding of topic.findings?.items || []) map.set(finding.anchor, ["findings"]);
    if (topic.industry_impact?.anchor) map.set(topic.industry_impact.anchor, ["industry_impact"]);
    if (topic.strategic_recommendation?.anchor) {
      map.set(topic.strategic_recommendation.anchor, ["lenovo_china_implication", "strategic_recommendation"]);
    }
    for (const action of topic.strategic_recommendation?.actions || []) {
      if (action.anchor) map.set(action.anchor, ["lenovo_china_implication", "strategic_recommendation"]);
    }
  }
  return map;
}

function validateBinding(contract, snapshot, label) {
  for (const [key, value] of Object.entries({
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    version: snapshot.version,
    content_sha256: snapshot.content_sha256,
  })) {
    if (contract.properties[key] !== value) throw new WeeklyFeedbackValidationError(`${label} DOCX ${key} binding mismatch`);
  }
}

function buildWeeklyDocxFeedback({ snapshot: input, systemDocx, humanDocx, feedbackId }) {
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(String(feedbackId || ""))) throw new WeeklyFeedbackValidationError("Invalid feedback_id");
  const rawSnapshot = Object.fromEntries([
    "schema_version",
    "artifact_id",
    "source_run_id",
    "version",
    "approved_candidate_sha256",
    "content_sha256",
    "approval",
    "publication",
    "content",
  ].filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, input[key]]));
  const snapshot = validateWeeklySnapshot(rawSnapshot);
  const anchors = snapshot.section_anchors;
  const system = parseDocxContract(systemDocx, anchors);
  const human = parseDocxContract(humanDocx, anchors);
  validateBinding(system, snapshot, "System");
  validateBinding(human, snapshot, "Human final");
  if (canonicalJson(system.bookmarkNames) !== canonicalJson(human.bookmarkNames)) {
    throw new WeeklyFeedbackValidationError("System and human DOCX bookmark mappings differ");
  }
  const sectionDiffs = anchors
    .filter((anchor) => system.sections[anchor] !== human.sections[anchor])
    .map((anchor) => ({
      anchor,
      before_sha256: sha256(Buffer.from(system.sections[anchor], "utf8")),
      after_sha256: sha256(Buffer.from(human.sections[anchor], "utf8")),
      before: system.sections[anchor],
      after: human.sections[anchor],
    }));
  const changedParts = changedPackageParts(
    system.packageReceipts,
    human.packageReceipts,
    system.documentResidualSha256,
    human.documentResidualSha256,
  );
  let packageDiff = null;
  if (changedParts.length) {
    const before = packageState(system.packageReceipts, system.documentResidualSha256);
    const after = packageState(human.packageReceipts, human.documentResidualSha256);
    packageDiff = {
      before_sha256: sha256(Buffer.from(before, "utf8")),
      after_sha256: sha256(Buffer.from(after, "utf8")),
      before,
      after,
      changed_parts: changedParts,
      summary: "",
    };
  }
  if (!sectionDiffs.length && !packageDiff) throw new WeeklyFeedbackValidationError("Human final Word does not contain any changes");
  const adapter = {
    schema_version: "weekly-insight-docx-diff/v2",
    feedback_id: feedbackId,
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    version: snapshot.version,
    draft_content_sha256: snapshot.content_sha256,
    docx: {
      system_draft_sha256: sha256(systemDocx),
      system_draft_size_bytes: systemDocx.length,
      human_final_sha256: sha256(humanDocx),
      human_final_size_bytes: humanDocx.length,
    },
    section_diffs: sectionDiffs,
    package_diff: packageDiff,
  };
  const areaMap = feedbackAreaMap(snapshot);
  const areas = new Set();
  sectionDiffs.forEach((diff) => (areaMap.get(diff.anchor) || []).forEach((area) => areas.add(area)));
  if (packageDiff) areas.add("overall");
  return {
    adapter,
    adapterBytes: Buffer.from(canonicalJson(adapter), "utf8"),
    section_anchors: sectionDiffs.map((diff) => diff.anchor),
    feedback_areas: [...areas].sort(),
  };
}

module.exports = {
  buildWeeklyDocxFeedback,
  canonicalJson,
  parseDocxContract,
};
