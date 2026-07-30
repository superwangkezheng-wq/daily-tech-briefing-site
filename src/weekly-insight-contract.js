const crypto = require("node:crypto");

const SNAPSHOT_FIELDS = new Set([
  "schema_version",
  "artifact_id",
  "source_run_id",
  "version",
  "approved_candidate_sha256",
  "content_sha256",
  "approval",
  "publication",
  "content",
]);

const SECTION_KINDS = new Set([
  "core_insight",
  "verified_facts",
  "evidence",
  "mechanism",
  "industry_impact",
  "trend_assessment",
  "lenovo_china_implications",
  "strategic_recommendations",
  "counterevidence_scope",
]);

const CONTENT_FIELDS = new Set(["title", "dek", "period", "status", "selected_theses", "sections", "evidence", "media"]);
const PERIOD_FIELDS = new Set(["start", "end", "label", "as_of"]);
const SECTION_FIELDS = new Set(["anchor", "kind", "title", "summary", "items", "evidence_ids", "media_ids"]);
const EVIDENCE_FIELDS = new Set(["id", "title", "publisher", "source_url", "published_at", "accessed_at", "role", "note"]);
const MEDIA_FIELDS = new Set(["id", "kind", "src", "alt", "caption", "source_label", "source_url"]);
const APPROVAL_FIELDS = new Set(["status", "approval_id", "approved_at"]);
const PUBLICATION_FIELDS = new Set(["public_enabled", "visibility", "authorization_id"]);

function rejectUnknownFields(value, allowed, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${context}`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown field in ${context}: ${key}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalSha256(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function requireString(value, name, { max = 500, pattern } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max || (pattern && !pattern.test(normalized))) {
    throw new Error(`Invalid ${name}`);
  }
  return normalized;
}

function optionalString(value, name, max = 2000) {
  if (value === null || value === undefined || value === "") return "";
  return requireString(value, name, { max });
}

function optionalArray(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid ${name}; expected an array`);
  return value;
}

function normalizeHttpUrl(value, name, { nullable = false } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized && nullable) return null;
  try {
    const parsed = new URL(normalized);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("protocol or credentials");
    }
    return normalized;
  } catch (error) {
    throw new Error(`Invalid ${name}`);
  }
}

function validatePeriod(period) {
  if (!period || typeof period !== "object") throw new Error("Invalid content.period");
  rejectUnknownFields(period, PERIOD_FIELDS, "content.period");
  return {
    start: requireString(period.start, "content.period.start", { pattern: /^\d{4}-\d{2}-\d{2}$/ }),
    end: requireString(period.end, "content.period.end", { pattern: /^\d{4}-\d{2}-\d{2}$/ }),
    label: requireString(period.label, "content.period.label", { max: 80 }),
    as_of: requireString(period.as_of, "content.period.as_of", { max: 80 }),
  };
}

function validateSection(section, index) {
  if (!section || typeof section !== "object") throw new Error(`Invalid content.sections[${index}]`);
  rejectUnknownFields(section, SECTION_FIELDS, `content.sections[${index}]`);
  const anchor = requireString(section.anchor, `content.sections[${index}].anchor`, {
    max: 64,
    pattern: /^[a-z][a-z0-9_]{2,63}$/,
  });
  const kind = requireString(section.kind, `content.sections[${index}].kind`, { max: 80 });
  if (!SECTION_KINDS.has(kind)) throw new Error(`Invalid content.sections[${index}].kind`);
  const items = optionalArray(section.items, `content.sections[${index}].items`)
    .map((item, itemIndex) => requireString(item, `content.sections[${index}].items[${itemIndex}]`, { max: 4000 }));
  return {
    anchor,
    kind,
    title: requireString(section.title, `content.sections[${index}].title`, { max: 160 }),
    summary: optionalString(section.summary, `content.sections[${index}].summary`, 4000),
    items,
    evidence_ids: optionalArray(section.evidence_ids, `content.sections[${index}].evidence_ids`)
      .map((id) => requireString(id, "section.evidence_id", { max: 80 })),
    media_ids: optionalArray(section.media_ids, `content.sections[${index}].media_ids`)
      .map((id) => requireString(id, "section.media_id", { max: 80 })),
  };
}

function validateEvidence(evidence, index) {
  if (!evidence || typeof evidence !== "object") throw new Error(`Invalid content.evidence[${index}]`);
  rejectUnknownFields(evidence, EVIDENCE_FIELDS, `content.evidence[${index}]`);
  return {
    id: requireString(evidence.id, `content.evidence[${index}].id`, { max: 80 }),
    title: requireString(evidence.title, `content.evidence[${index}].title`, { max: 300 }),
    publisher: requireString(evidence.publisher, `content.evidence[${index}].publisher`, { max: 160 }),
    source_url: normalizeHttpUrl(evidence.source_url, `content.evidence[${index}].source_url`),
    published_at: optionalString(evidence.published_at, `content.evidence[${index}].published_at`, 80),
    accessed_at: requireString(evidence.accessed_at, `content.evidence[${index}].accessed_at`, { max: 80 }),
    role: requireString(evidence.role, `content.evidence[${index}].role`, { max: 80 }),
    note: optionalString(evidence.note, `content.evidence[${index}].note`, 2000),
  };
}

function validateMedia(media, index) {
  if (!media || typeof media !== "object") throw new Error(`Invalid content.media[${index}]`);
  rejectUnknownFields(media, MEDIA_FIELDS, `content.media[${index}]`);
  const kind = requireString(media.kind, `content.media[${index}].kind`, { max: 40 });
  if (!["image", "architecture", "benchmark"].includes(kind)) {
    throw new Error(`Invalid content.media[${index}].kind`);
  }
  return {
    id: requireString(media.id, `content.media[${index}].id`, { max: 80 }),
    kind,
    src: normalizeHttpUrl(media.src, `content.media[${index}].src`, { nullable: true }),
    alt: requireString(media.alt, `content.media[${index}].alt`, { max: 300 }),
    caption: optionalString(media.caption, `content.media[${index}].caption`, 1000),
    source_label: optionalString(media.source_label, `content.media[${index}].source_label`, 200),
    source_url: normalizeHttpUrl(media.source_url, `content.media[${index}].source_url`, { nullable: true }),
  };
}

function validateContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("Invalid content");
  }
  rejectUnknownFields(content, CONTENT_FIELDS, "content");
  const selectedTheses = content.selected_theses;
  if (!Number.isInteger(selectedTheses) || selectedTheses < 0 || selectedTheses > 4) {
    throw new Error("Invalid content.selected_theses; expected 0..4");
  }
  const status = requireString(content.status, "content.status", { max: 40 });
  if (!["complete", "partial", "no_selection"].includes(status)) throw new Error("Invalid content.status");
  if ((selectedTheses === 0) !== (status === "no_selection")) {
    throw new Error("content.status and selected_theses are inconsistent");
  }
  const sections = optionalArray(content.sections, "content.sections").map(validateSection);
  const anchors = sections.map((section) => section.anchor);
  if (new Set(anchors).size !== anchors.length) throw new Error("Duplicate section anchor");

  const evidence = optionalArray(content.evidence, "content.evidence").map(validateEvidence);
  const media = optionalArray(content.media, "content.media").map(validateMedia);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const mediaIds = new Set(media.map((item) => item.id));
  if (evidenceIds.size !== evidence.length) throw new Error("Duplicate evidence id");
  if (mediaIds.size !== media.length) throw new Error("Duplicate media id");
  for (const section of sections) {
    for (const id of section.evidence_ids) {
      if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id: ${id}`);
    }
    for (const id of section.media_ids) {
      if (!mediaIds.has(id)) throw new Error(`Unknown media id: ${id}`);
    }
  }

  return {
    title: requireString(content.title, "content.title", { max: 500 }),
    dek: optionalString(content.dek, "content.dek", 2000),
    period: validatePeriod(content.period),
    status,
    selected_theses: selectedTheses,
    sections,
    evidence,
    media,
  };
}

function validateWeeklySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Weekly insight snapshot must be an object");
  }
  for (const key of Object.keys(snapshot)) {
    if (!SNAPSHOT_FIELDS.has(key)) throw new Error(`Unknown field at website seam: ${key}`);
  }
  if (snapshot.schema_version !== "weekly-insight-publication/v1") {
    throw new Error("Unsupported schema_version");
  }
  const artifactId = requireString(snapshot.artifact_id, "artifact_id", {
    max: 100,
    pattern: /^[a-z0-9][a-z0-9-]{2,99}$/,
  });
  const sourceRunId = requireString(snapshot.source_run_id, "source_run_id", { max: 160 });
  const version = requireString(snapshot.version, "version", { max: 40 });
  const approvedHash = requireString(snapshot.approved_candidate_sha256, "approved_candidate_sha256", {
    pattern: /^[a-f0-9]{64}$/,
    max: 64,
  });
  const declaredContentHash = requireString(snapshot.content_sha256, "content_sha256", {
    pattern: /^[a-f0-9]{64}$/,
    max: 64,
  });
  rejectUnknownFields(snapshot.approval, APPROVAL_FIELDS, "approval");
  if (snapshot.approval.status !== "approved") throw new Error("Snapshot is not approved");
  const approval = {
    status: "approved",
    approval_id: requireString(snapshot.approval.approval_id, "approval.approval_id", { max: 160 }),
    approved_at: requireString(snapshot.approval.approved_at, "approval.approved_at", { max: 80 }),
  };
  const publicationInput = snapshot.publication || {};
  rejectUnknownFields(publicationInput, PUBLICATION_FIELDS, "publication");
  const publicEnabled = publicationInput.public_enabled === true;
  const visibility = publicationInput.visibility || "internal_preview";
  const authorizationId = optionalString(publicationInput.authorization_id, "publication.authorization_id", 160) || null;
  if (publicEnabled && (visibility !== "public" || !authorizationId)) {
    throw new Error("public_enabled requires visibility=public and publication.authorization_id");
  }
  if (!publicEnabled && visibility !== "internal_preview") {
    throw new Error("Unpublished snapshots must use internal_preview visibility");
  }

  const content = validateContent(snapshot.content);
  const contentHash = canonicalSha256(content);
  if (contentHash !== declaredContentHash) throw new Error("content_sha256 does not match canonical content");
  return {
    schema_version: snapshot.schema_version,
    artifact_id: artifactId,
    source_run_id: sourceRunId,
    version,
    approved_candidate_sha256: approvedHash,
    content_sha256: contentHash,
    approval,
    publication: {
      public_enabled: publicEnabled,
      visibility,
      authorization_id: authorizationId,
    },
    content,
    section_anchors: content.sections.map((section) => section.anchor),
  };
}

module.exports = {
  canonicalJson,
  canonicalSha256,
  validateWeeklySnapshot,
};
