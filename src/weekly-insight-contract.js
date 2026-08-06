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

const V1_CONTENT_FIELDS = new Set(["title", "dek", "period", "status", "selected_theses", "sections", "evidence", "media"]);
const V2_CONTENT_FIELDS = new Set([
  "title", "dek", "period", "status", "selected_topics", "weekly_synthesis", "topics",
  "strategic_recommendations", "evidence", "media",
]);
const V3_CONTENT_FIELDS = new Set([
  "title", "dek", "period", "status", "selected_topics", "weekly_synthesis", "topics",
  "recommendation_title", "strategic_recommendations", "evidence", "media",
]);
const V4_CONTENT_FIELDS = new Set([
  "title", "dek", "period", "status", "issue_kind", "selected_topics", "weekly_synthesis",
  "topics", "evidence", "media",
]);
const PERIOD_FIELDS = new Set(["start", "end", "label", "as_of"]);
const SECTION_FIELDS = new Set(["anchor", "kind", "title", "summary", "items", "evidence_ids", "media_ids"]);
const TOPIC_FIELDS = new Set([
  "topic_id", "thesis_id", "kicker", "title", "standfirst", "article_sections",
  "industry_impact", "lenovo_china_implication",
]);
const V3_TOPIC_FIELDS = new Set([
  "topic_id", "thesis_id", "title", "facts", "findings", "industry_impact",
]);
const V3_FACTS_FIELDS = new Set([
  "anchor", "kind", "title", "paragraphs", "items", "terms", "evidence_ids", "media_ids",
]);
const V3_INDUSTRY_FIELDS = new Set([
  "anchor", "kind", "title", "headline", "paragraphs", "items", "evidence_ids", "media_ids",
]);
const V3_FINDING_FIELDS = new Set(["finding_id", "headline", "paragraphs", "evidence_ids"]);
const V4_TOPIC_FIELDS = new Set([
  "topic_id", "thesis_id", "sequence_label", "title", "facts", "findings",
  "industry_impact", "strategic_recommendation",
]);
const V4_FACTS_FIELDS = new Set(["title", "sections", "terms"]);
const V4_TERM_FIELDS = new Set([
  "term", "explanation", "first_section_id", "after_section_anchor", "after_paragraph_index",
  "reader_text",
]);
const V4_FINDINGS_FIELDS = new Set(["title", "items"]);
const V4_FINDING_FIELDS = new Set([
  "anchor", "finding_id", "title", "paragraphs", "evidence_ids",
]);
const V4_STRATEGIC_FIELDS = new Set([
  "anchor", "kind", "title", "headline", "paragraphs", "items", "evidence_ids", "media_ids",
  "actions",
]);
const V4_ACTION_FIELDS = new Set(["statement", "action", "decision_window"]);
const TERM_FIELDS = new Set(["term", "explanation"]);
const ARTICLE_SECTION_FIELDS = new Set([
  "anchor", "section_id", "role", "kind", "title", "paragraphs", "items", "evidence_ids", "media_ids",
]);
const ANALYSIS_BLOCK_FIELDS = new Set([
  "anchor", "kind", "title", "headline", "paragraphs", "items", "evidence_ids", "media_ids",
]);
const SYNTHESIS_FIELDS = new Set(["title", "paragraphs"]);
const RECOMMENDATION_FIELDS = new Set(["anchor", "headline", "rationale", "action", "decision_window"]);
const ARTICLE_ROLES = new Set([
  "what_changed", "how_it_works", "evidence_and_limits", "architecture", "capabilities",
  "benchmark", "comparison", "timeline", "case_study", "historical_context",
]);
const EVIDENCE_FIELDS = new Set(["id", "title", "publisher", "source_url", "published_at", "accessed_at", "role", "note"]);
const MEDIA_FIELDS = new Set([
  "id", "kind", "src", "alt", "caption", "source_label", "source_url", "usage_rights",
  "logic_type", "logic_summary",
]);
const VISUAL_LOGIC_TYPES = new Set(["causal", "comparison", "dependency", "flow", "stack", "timeline"]);
const APPROVAL_FIELDS = new Set(["status", "approval_id", "approved_at"]);
const PUBLICATION_FIELDS = new Set(["public_enabled", "visibility", "authorization_id"]);
const V4_PUBLICATION_FIELDS = new Set([...PUBLICATION_FIELDS, "release_eligible"]);

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

function requiredArray(value, name) {
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

function validateMedia(media, index, { requireVisualLogic = false } = {}) {
  if (!media || typeof media !== "object") throw new Error(`Invalid content.media[${index}]`);
  rejectUnknownFields(media, MEDIA_FIELDS, `content.media[${index}]`);
  const kind = requireString(media.kind, `content.media[${index}].kind`, { max: 40 });
  if (!["image", "architecture", "benchmark"].includes(kind)) {
    throw new Error(`Invalid content.media[${index}].kind`);
  }
  const normalized = {
    id: requireString(media.id, `content.media[${index}].id`, { max: 80 }),
    kind,
    src: normalizeHttpUrl(media.src, `content.media[${index}].src`, { nullable: true }),
    alt: requireString(media.alt, `content.media[${index}].alt`, { max: 300 }),
    caption: optionalString(media.caption, `content.media[${index}].caption`, 1000),
    source_label: optionalString(media.source_label, `content.media[${index}].source_label`, 200),
    source_url: normalizeHttpUrl(media.source_url, `content.media[${index}].source_url`, { nullable: true }),
  };
  if (Object.prototype.hasOwnProperty.call(media, "usage_rights")) {
    normalized.usage_rights = optionalString(
      media.usage_rights,
      `content.media[${index}].usage_rights`,
      200,
    );
  }
  if (Object.prototype.hasOwnProperty.call(media, "logic_type")) {
    normalized.logic_type = optionalString(media.logic_type, `content.media[${index}].logic_type`, 40);
  }
  if (Object.prototype.hasOwnProperty.call(media, "logic_summary")) {
    normalized.logic_summary = optionalString(media.logic_summary, `content.media[${index}].logic_summary`, 500);
  }
  if (normalized.logic_type && !VISUAL_LOGIC_TYPES.has(normalized.logic_type)) {
    throw new Error(`Invalid content.media[${index}].logic_type`);
  }
  if (requireVisualLogic && kind === "architecture" && !(normalized.logic_type && normalized.logic_summary)) {
    throw new Error(`Architecture content.media[${index}] requires logic_type and logic_summary`);
  }
  return normalized;
}

function validateV4Evidence(evidence, index) {
  const normalized = validateEvidence(evidence, index);
  const hostname = new URL(normalized.source_url).hostname.toLowerCase().replace(/^www\./, "");
  if (normalized.title !== hostname || normalized.publisher !== hostname) {
    throw new Error(`Invalid content.evidence[${index}]; title and publisher must match the source hostname`);
  }
  if (!["source_in", "source_out"].includes(normalized.role)) {
    throw new Error(`Invalid content.evidence[${index}].role`);
  }
  if (!normalized.note) throw new Error(`Invalid content.evidence[${index}].note`);
  return normalized;
}

function validateV4Media(media, index) {
  const normalized = validateMedia(media, index, { requireVisualLogic: true });
  for (const field of ["src", "caption", "source_label", "source_url", "usage_rights"]) {
    if (!normalized[field]) throw new Error(`Invalid content.media[${index}].${field}`);
  }
  if (!/[\u3400-\u9fff]/u.test(normalized.caption)) {
    throw new Error(`Invalid content.media[${index}].caption; expected a Chinese reader caption`);
  }
  return normalized;
}

function validateV1Content(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("Invalid content");
  }
  rejectUnknownFields(content, V1_CONTENT_FIELDS, "content");
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

function stringArray(value, name, max = 4000) {
  return requiredArray(value, name)
    .map((item, index) => requireString(item, `${name}[${index}]`, { max }));
}

function anchorString(value, name) {
  return requireString(value, name, { max: 64, pattern: /^[a-z][a-z0-9_]{2,63}$/ });
}

function validateArticleSection(section, topicIndex, sectionIndex) {
  const context = `content.topics[${topicIndex}].article_sections[${sectionIndex}]`;
  rejectUnknownFields(section, ARTICLE_SECTION_FIELDS, context);
  const role = requireString(section.role, `${context}.role`, { max: 80 });
  if (!ARTICLE_ROLES.has(role) || section.kind !== role) throw new Error(`Invalid ${context}.role or kind`);
  const paragraphs = stringArray(section.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  return {
    anchor: anchorString(section.anchor, `${context}.anchor`),
    section_id: requireString(section.section_id, `${context}.section_id`, { max: 80 }),
    role,
    kind: role,
    title: requireString(section.title, `${context}.title`, { max: 240 }),
    paragraphs,
    items: stringArray(section.items, `${context}.items`),
    evidence_ids: stringArray(section.evidence_ids, `${context}.evidence_ids`, 80),
    media_ids: stringArray(section.media_ids, `${context}.media_ids`, 80),
  };
}

function validateAnalysisBlock(block, topicIndex, field, expectedKind) {
  const context = `content.topics[${topicIndex}].${field}`;
  rejectUnknownFields(block, ANALYSIS_BLOCK_FIELDS, context);
  if (block.kind !== expectedKind) throw new Error(`Invalid ${context}.kind`);
  const paragraphs = stringArray(block.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  return {
    anchor: anchorString(block.anchor, `${context}.anchor`),
    kind: expectedKind,
    title: requireString(block.title, `${context}.title`, { max: 240 }),
    headline: requireString(block.headline, `${context}.headline`, { max: 1000 }),
    paragraphs,
    items: stringArray(block.items, `${context}.items`),
    evidence_ids: stringArray(block.evidence_ids, `${context}.evidence_ids`, 80),
    media_ids: stringArray(block.media_ids, `${context}.media_ids`, 80),
  };
}

function validateTopic(topic, index) {
  const context = `content.topics[${index}]`;
  rejectUnknownFields(topic, TOPIC_FIELDS, context);
  const articleSections = requiredArray(topic.article_sections, `${context}.article_sections`)
    .map((section, sectionIndex) => validateArticleSection(section, index, sectionIndex));
  if (articleSections.length < 3) throw new Error(`Invalid ${context}.article_sections; expected at least 3`);
  const roles = new Set(articleSections.map((section) => section.role));
  for (const requiredRole of ["what_changed", "how_it_works", "evidence_and_limits"]) {
    if (!roles.has(requiredRole)) throw new Error(`Invalid ${context}.article_sections; missing ${requiredRole}`);
  }
  if (roles.size !== articleSections.length) throw new Error(`Duplicate article role in ${context}.article_sections`);
  return {
    topic_id: requireString(topic.topic_id, `${context}.topic_id`, { max: 160 }),
    thesis_id: requireString(topic.thesis_id, `${context}.thesis_id`, { max: 160 }),
    kicker: requireString(topic.kicker, `${context}.kicker`, { max: 160 }),
    title: requireString(topic.title, `${context}.title`, { max: 500 }),
    standfirst: requireString(topic.standfirst, `${context}.standfirst`, { max: 3000 }),
    article_sections: articleSections,
    industry_impact: validateAnalysisBlock(topic.industry_impact, index, "industry_impact", "industry_impact"),
    lenovo_china_implication: validateAnalysisBlock(
      topic.lenovo_china_implication,
      index,
      "lenovo_china_implication",
      "lenovo_china_implications",
    ),
  };
}

function validateRecommendation(recommendation, index) {
  const context = `content.strategic_recommendations[${index}]`;
  rejectUnknownFields(recommendation, RECOMMENDATION_FIELDS, context);
  return {
    anchor: anchorString(recommendation.anchor, `${context}.anchor`),
    headline: requireString(recommendation.headline, `${context}.headline`, { max: 3500 }),
    rationale: requireString(recommendation.rationale, `${context}.rationale`, { max: 2500 }),
    action: requireString(recommendation.action, `${context}.action`, { max: 3500 }),
    decision_window: requireString(recommendation.decision_window, `${context}.decision_window`, { max: 1000 }),
  };
}

function validateV2Content(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Invalid content");
  rejectUnknownFields(content, V2_CONTENT_FIELDS, "content");
  const selectedTopics = content.selected_topics;
  if (!Number.isInteger(selectedTopics) || selectedTopics < 0 || selectedTopics > 5) {
    throw new Error("Invalid content.selected_topics; expected 0..5");
  }
  const status = requireString(content.status, "content.status", { max: 40 });
  if (!["complete", "partial", "no_selection"].includes(status)) throw new Error("Invalid content.status");
  if ((selectedTopics === 0) !== (status === "no_selection")) {
    throw new Error("content.status and selected_topics are inconsistent");
  }
  const topics = requiredArray(content.topics, "content.topics").map(validateTopic);
  if (topics.length !== selectedTopics) throw new Error("content.selected_topics and topics length are inconsistent");
  const topicIds = topics.map((topic) => topic.topic_id);
  const thesisIds = topics.map((topic) => topic.thesis_id);
  if (new Set(topicIds).size !== topicIds.length) throw new Error("Duplicate topic_id");
  if (new Set(thesisIds).size !== thesisIds.length) throw new Error("Duplicate thesis_id");

  let weeklySynthesis = null;
  if (content.weekly_synthesis !== null && content.weekly_synthesis !== undefined) {
    rejectUnknownFields(content.weekly_synthesis, SYNTHESIS_FIELDS, "content.weekly_synthesis");
    weeklySynthesis = {
      title: requireString(content.weekly_synthesis.title, "content.weekly_synthesis.title", { max: 240 }),
      paragraphs: stringArray(content.weekly_synthesis.paragraphs, "content.weekly_synthesis.paragraphs"),
    };
    if (!weeklySynthesis.paragraphs.length) throw new Error("Invalid content.weekly_synthesis.paragraphs");
  }
  const strategicRecommendations = requiredArray(
    content.strategic_recommendations,
    "content.strategic_recommendations",
  ).map(validateRecommendation);
  const evidence = requiredArray(content.evidence, "content.evidence").map(validateEvidence);
  const media = requiredArray(content.media, "content.media").map(validateMedia);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const mediaIds = new Set(media.map((item) => item.id));
  if (evidenceIds.size !== evidence.length) throw new Error("Duplicate evidence id");
  if (mediaIds.size !== media.length) throw new Error("Duplicate media id");

  const blocks = topics.flatMap((topic) => [
    ...topic.article_sections,
    topic.industry_impact,
    topic.lenovo_china_implication,
  ]);
  const anchors = [...blocks.map((block) => block.anchor), ...strategicRecommendations.map((item) => item.anchor)];
  if (new Set(anchors).size !== anchors.length) throw new Error("Duplicate section anchor");
  for (const block of blocks) {
    for (const id of block.evidence_ids) if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id: ${id}`);
    for (const id of block.media_ids) if (!mediaIds.has(id)) throw new Error(`Unknown media id: ${id}`);
  }
  return {
    title: requireString(content.title, "content.title", { max: 500 }),
    dek: requireString(content.dek, "content.dek", { max: 3000 }),
    period: validatePeriod(content.period),
    status,
    selected_topics: selectedTopics,
    weekly_synthesis: weeklySynthesis,
    topics,
    strategic_recommendations: strategicRecommendations,
    evidence,
    media,
  };
}

function validateV3Block(block, topicIndex, field, expectedKind) {
  const context = `content.topics[${topicIndex}].${field}`;
  if (!block || typeof block !== "object" || Array.isArray(block)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(block, field === "facts" ? V3_FACTS_FIELDS : V3_INDUSTRY_FIELDS, context);
  if (block.kind !== expectedKind) throw new Error(`Invalid ${context}.kind`);
  const paragraphs = stringArray(block.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  const result = {
    anchor: anchorString(block.anchor, `${context}.anchor`),
    kind: expectedKind,
    title: requireString(block.title, `${context}.title`, { max: 240 }),
    paragraphs,
    items: stringArray(block.items, `${context}.items`),
    evidence_ids: stringArray(block.evidence_ids, `${context}.evidence_ids`, 80),
    media_ids: stringArray(block.media_ids, `${context}.media_ids`, 80),
  };
  if (field === "facts") {
    if (result.title !== "事实与案例") throw new Error(`Invalid ${context}.title`);
    result.terms = requiredArray(block.terms, `${context}.terms`).map((term, termIndex) => {
      const termContext = `${context}.terms[${termIndex}]`;
      if (!term || typeof term !== "object" || Array.isArray(term)) throw new Error(`Invalid ${termContext}`);
      rejectUnknownFields(term, TERM_FIELDS, termContext);
      return {
        term: requireString(term.term, `${termContext}.term`, { max: 120 }),
        explanation: requireString(term.explanation, `${termContext}.explanation`, { max: 500 }),
      };
    });
  } else {
    if (result.title !== "产业影响") throw new Error(`Invalid ${context}.title`);
    result.headline = requireString(block.headline, `${context}.headline`, { max: 1000 });
  }
  return result;
}

function validateV3Finding(finding, topicIndex, findingIndex) {
  const context = `content.topics[${topicIndex}].findings[${findingIndex}]`;
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(finding, V3_FINDING_FIELDS, context);
  const paragraphs = stringArray(finding.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  return {
    finding_id: requireString(finding.finding_id, `${context}.finding_id`, {
      max: 160,
      pattern: /^[a-z][a-z0-9_-]{2,159}$/,
    }),
    headline: requireString(finding.headline, `${context}.headline`, { max: 240 }),
    paragraphs,
    evidence_ids: stringArray(finding.evidence_ids, `${context}.evidence_ids`, 80),
  };
}

function validateV3Topic(topic, index) {
  const context = `content.topics[${index}]`;
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(topic, V3_TOPIC_FIELDS, context);
  const findings = requiredArray(topic.findings, `${context}.findings`)
    .map((finding, findingIndex) => validateV3Finding(finding, index, findingIndex));
  if (findings.length < 1 || findings.length > 3) {
    throw new Error(`Invalid ${context}.findings; expected one to three findings`);
  }
  return {
    topic_id: requireString(topic.topic_id, `${context}.topic_id`, { max: 160 }),
    thesis_id: requireString(topic.thesis_id, `${context}.thesis_id`, { max: 160 }),
    title: requireString(topic.title, `${context}.title`, { max: 500 }),
    facts: validateV3Block(topic.facts, index, "facts", "facts"),
    findings,
    industry_impact: validateV3Block(topic.industry_impact, index, "industry_impact", "industry_impact"),
  };
}

function validateV3Content(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Invalid content");
  rejectUnknownFields(content, V3_CONTENT_FIELDS, "content");
  const selectedTopics = content.selected_topics;
  if (!Number.isInteger(selectedTopics) || selectedTopics < 0 || selectedTopics > 5) {
    throw new Error("Invalid content.selected_topics; expected 0..5");
  }
  const status = requireString(content.status, "content.status", { max: 40 });
  if (!["complete", "partial", "no_selection"].includes(status)) throw new Error("Invalid content.status");
  if ((selectedTopics === 0) !== (status === "no_selection")) {
    throw new Error("content.status and selected_topics are inconsistent");
  }
  const topics = requiredArray(content.topics, "content.topics").map(validateV3Topic);
  if (topics.length !== selectedTopics) throw new Error("content.selected_topics and topics length are inconsistent");
  let weeklySynthesis = null;
  if (content.weekly_synthesis !== null && content.weekly_synthesis !== undefined) {
    rejectUnknownFields(content.weekly_synthesis, SYNTHESIS_FIELDS, "content.weekly_synthesis");
    weeklySynthesis = {
      title: requireString(content.weekly_synthesis.title, "content.weekly_synthesis.title", { max: 240 }),
      paragraphs: stringArray(content.weekly_synthesis.paragraphs, "content.weekly_synthesis.paragraphs"),
    };
    if (!weeklySynthesis.paragraphs.length) throw new Error("Invalid content.weekly_synthesis.paragraphs");
  }
  if (content.recommendation_title !== "战略建议") throw new Error("Invalid content.recommendation_title");
  const strategicRecommendations = requiredArray(
    content.strategic_recommendations,
    "content.strategic_recommendations",
  ).map(validateRecommendation);
  const evidence = requiredArray(content.evidence, "content.evidence").map(validateEvidence);
  const media = requiredArray(content.media, "content.media")
    .map((item, index) => validateMedia(item, index, { requireVisualLogic: true }));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const mediaIds = new Set(media.map((item) => item.id));
  if (evidenceIds.size !== evidence.length) throw new Error("Duplicate evidence id");
  if (mediaIds.size !== media.length) throw new Error("Duplicate media id");
  const blocks = topics.flatMap((topic) => [topic.facts, ...topic.findings, topic.industry_impact]);
  const anchors = [
    ...topics.flatMap((topic) => [
      topic.facts.anchor,
      ...topic.findings.map((finding) => finding.finding_id),
      topic.industry_impact.anchor,
    ]),
    ...strategicRecommendations.map((item) => item.anchor),
  ];
  if (new Set(anchors).size !== anchors.length) throw new Error("Duplicate section anchor");
  for (const block of blocks) {
    for (const id of block.evidence_ids) if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id: ${id}`);
    for (const id of block.media_ids || []) if (!mediaIds.has(id)) throw new Error(`Unknown media id: ${id}`);
  }
  return {
    title: requireString(content.title, "content.title", { max: 500 }),
    dek: requireString(content.dek, "content.dek", { max: 3000 }),
    period: validatePeriod(content.period),
    status,
    selected_topics: selectedTopics,
    weekly_synthesis: weeklySynthesis,
    topics,
    recommendation_title: "战略建议",
    strategic_recommendations: strategicRecommendations,
    evidence,
    media,
  };
}

function validateV4FactSection(section, topicIndex, sectionIndex) {
  const context = `content.topics[${topicIndex}].facts.sections[${sectionIndex}]`;
  if (!section || typeof section !== "object" || Array.isArray(section)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(section, ARTICLE_SECTION_FIELDS, context);
  const role = requireString(section.role, `${context}.role`, { max: 80 });
  if (!ARTICLE_ROLES.has(role) || section.kind !== role) {
    throw new Error(`Invalid ${context}.role or kind`);
  }
  const paragraphs = stringArray(section.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  return {
    anchor: anchorString(section.anchor, `${context}.anchor`),
    section_id: requireString(section.section_id, `${context}.section_id`, { max: 80 }),
    role,
    kind: role,
    title: requireString(section.title, `${context}.title`, { max: 240 }),
    paragraphs,
    items: stringArray(section.items, `${context}.items`),
    evidence_ids: stringArray(section.evidence_ids, `${context}.evidence_ids`, 80),
    media_ids: stringArray(section.media_ids, `${context}.media_ids`, 80),
  };
}

function validateV4Term(term, topicIndex, termIndex, sections) {
  const context = `content.topics[${topicIndex}].facts.terms[${termIndex}]`;
  if (!term || typeof term !== "object" || Array.isArray(term)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(term, V4_TERM_FIELDS, context);
  const normalizedTerm = requireString(term.term, `${context}.term`, { max: 120 });
  const explanation = requireString(term.explanation, `${context}.explanation`, { max: 500 });
  const firstSectionId = requireString(term.first_section_id, `${context}.first_section_id`, { max: 80 });
  const afterSectionAnchor = anchorString(term.after_section_anchor, `${context}.after_section_anchor`);
  const targetSectionIndex = sections.findIndex((section) => section.section_id === firstSectionId);
  if (targetSectionIndex === -1) throw new Error(`Unknown ${context}.first_section_id`);
  const targetSection = sections[targetSectionIndex];
  if (afterSectionAnchor !== targetSection.anchor) {
    throw new Error(`Invalid ${context}.after_section_anchor; it must match first_section_id`);
  }
  const afterParagraphIndex = term.after_paragraph_index;
  if (
    !Number.isInteger(afterParagraphIndex) ||
    afterParagraphIndex < 0 ||
    afterParagraphIndex >= targetSection.paragraphs.length
  ) {
    throw new Error(`Invalid ${context}.after_paragraph_index; it must target an existing fact paragraph`);
  }
  const expectedReaderText = `${normalizedTerm}：${explanation}`;
  if (term.reader_text !== expectedReaderText) throw new Error(`Invalid ${context}.reader_text`);
  if (!targetSection.paragraphs[afterParagraphIndex].includes(normalizedTerm)) {
    throw new Error(`Invalid ${context}.after_paragraph_index; the bound paragraph must contain the term`);
  }
  const earlierParagraphs = [
    ...sections.slice(0, targetSectionIndex).flatMap((section) => section.paragraphs),
    ...targetSection.paragraphs.slice(0, afterParagraphIndex),
  ];
  if (earlierParagraphs.some((paragraph) => paragraph.includes(normalizedTerm))) {
    throw new Error(`Invalid ${context}.first_section_id; the term appears in an earlier fact paragraph`);
  }
  return {
    term: normalizedTerm,
    explanation,
    first_section_id: firstSectionId,
    after_section_anchor: afterSectionAnchor,
    after_paragraph_index: afterParagraphIndex,
    reader_text: expectedReaderText,
  };
}

function validateV4Facts(facts, topicIndex) {
  const context = `content.topics[${topicIndex}].facts`;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(facts, V4_FACTS_FIELDS, context);
  if (facts.title !== "事实与案例") throw new Error(`Invalid ${context}.title`);
  const sections = requiredArray(facts.sections, `${context}.sections`)
    .map((section, sectionIndex) => validateV4FactSection(section, topicIndex, sectionIndex));
  if (sections.length < 3) throw new Error(`Invalid ${context}.sections; expected at least 3`);
  const roles = sections.map((section) => section.role);
  for (const requiredRole of ["what_changed", "how_it_works", "evidence_and_limits"]) {
    if (!roles.includes(requiredRole)) throw new Error(`Invalid ${context}.sections; missing ${requiredRole}`);
  }
  if (new Set(roles).size !== roles.length) throw new Error(`Duplicate role in ${context}.sections`);
  const sectionIds = sections.map((section) => section.section_id);
  if (new Set(sectionIds).size !== sectionIds.length) throw new Error(`Duplicate section_id in ${context}.sections`);
  const terms = requiredArray(facts.terms, `${context}.terms`)
    .map((term, termIndex) => validateV4Term(term, topicIndex, termIndex, sections));
  const termNames = terms.map((term) => term.term);
  if (new Set(termNames).size !== termNames.length) throw new Error(`Duplicate term in ${context}.terms`);
  return { title: "事实与案例", sections, terms };
}

function validateV4Finding(finding, topicIndex, findingIndex) {
  const context = `content.topics[${topicIndex}].findings.items[${findingIndex}]`;
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(finding, V4_FINDING_FIELDS, context);
  const title = requireString(finding.title, `${context}.title`, { max: 240 });
  if (!title.startsWith(`${findingIndex + 1}、`)) {
    throw new Error(`Invalid ${context}.title; findings must use ordered reader numbering`);
  }
  const formulaicFindingPattern = /(?:不再是.+而是|不是.+而是|从.+(?:变为|变成|转向|走向))/u;
  if (formulaicFindingPattern.test(title)) {
    throw new Error(`Invalid ${context}.title; formulaic finding titles are not allowed`);
  }
  const paragraphs = stringArray(finding.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  if (paragraphs.some((paragraph) => formulaicFindingPattern.test(paragraph))) {
    throw new Error(`Invalid ${context}.paragraphs; formulaic finding copy is not allowed`);
  }
  return {
    anchor: anchorString(finding.anchor, `${context}.anchor`),
    finding_id: requireString(finding.finding_id, `${context}.finding_id`, {
      max: 160,
      pattern: /^[a-z][a-z0-9_-]{2,159}$/,
    }),
    title,
    paragraphs,
    evidence_ids: stringArray(finding.evidence_ids, `${context}.evidence_ids`, 80),
  };
}

function validateV4Findings(findings, topicIndex) {
  const context = `content.topics[${topicIndex}].findings`;
  if (!findings || typeof findings !== "object" || Array.isArray(findings)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(findings, V4_FINDINGS_FIELDS, context);
  if (findings.title !== "发现") throw new Error(`Invalid ${context}.title`);
  const items = requiredArray(findings.items, `${context}.items`)
    .map((finding, findingIndex) => validateV4Finding(finding, topicIndex, findingIndex));
  if (items.length < 1 || items.length > 3) {
    throw new Error(`Invalid ${context}.items; expected one to three findings`);
  }
  const findingIds = items.map((item) => item.finding_id);
  if (new Set(findingIds).size !== findingIds.length) throw new Error(`Duplicate finding_id in ${context}.items`);
  return { title: "发现", items };
}

function validateV4Action(action, topicIndex, actionIndex) {
  const context = `content.topics[${topicIndex}].strategic_recommendation.actions[${actionIndex}]`;
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(action, V4_ACTION_FIELDS, context);
  return {
    statement: requireString(action.statement, `${context}.statement`, { max: 3500 }),
    action: requireString(action.action, `${context}.action`, { max: 3500 }),
    decision_window: requireString(action.decision_window, `${context}.decision_window`, { max: 1000 }),
  };
}

function validateV4AnalysisBlock(block, topicIndex, field, expectedKind, expectedTitle) {
  const context = `content.topics[${topicIndex}].${field}`;
  if (!block || typeof block !== "object" || Array.isArray(block)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(block, field === "strategic_recommendation" ? V4_STRATEGIC_FIELDS : V3_INDUSTRY_FIELDS, context);
  if (block.kind !== expectedKind) throw new Error(`Invalid ${context}.kind`);
  if (block.title !== expectedTitle) throw new Error(`Invalid ${context}.title`);
  const paragraphs = stringArray(block.paragraphs, `${context}.paragraphs`);
  if (!paragraphs.length) throw new Error(`Invalid ${context}.paragraphs`);
  const result = {
    anchor: anchorString(block.anchor, `${context}.anchor`),
    kind: expectedKind,
    title: expectedTitle,
    headline: requireString(block.headline, `${context}.headline`, { max: 1000 }),
    paragraphs,
    items: stringArray(block.items, `${context}.items`),
    evidence_ids: stringArray(block.evidence_ids, `${context}.evidence_ids`, 80),
    media_ids: stringArray(block.media_ids, `${context}.media_ids`, 80),
  };
  if (field === "strategic_recommendation" && Object.prototype.hasOwnProperty.call(block, "actions")) {
    const actions = requiredArray(block.actions, `${context}.actions`)
      .map((action, actionIndex) => validateV4Action(action, topicIndex, actionIndex));
    if (!actions.length) throw new Error(`Invalid ${context}.actions; omit empty actions`);
    result.actions = actions;
  }
  if (field === "strategic_recommendation") {
    const readerText = [
      result.title,
      result.headline,
      ...result.paragraphs,
      ...result.items,
      ...(result.actions || []).flatMap((action) => [action.statement, action.action, action.decision_window]),
    ];
    if (readerText.some((value) => value.includes("启示"))) {
      throw new Error(`Invalid ${context}; reader text cannot contain 启示`);
    }
  }
  return result;
}

function validateV4Topic(topic, index, topicCount) {
  const context = `content.topics[${index}]`;
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) throw new Error(`Invalid ${context}`);
  rejectUnknownFields(topic, V4_TOPIC_FIELDS, context);
  const expectedSequence = `专题 ${String(index + 1).padStart(2, "0")}/${String(topicCount).padStart(2, "0")}`;
  if (topic.sequence_label !== expectedSequence) throw new Error(`Invalid ${context}.sequence_label`);
  return {
    topic_id: requireString(topic.topic_id, `${context}.topic_id`, {
      max: 160,
      pattern: /^[a-z][a-z0-9_-]{2,159}$/,
    }),
    thesis_id: requireString(topic.thesis_id, `${context}.thesis_id`, { max: 160 }),
    sequence_label: expectedSequence,
    title: requireString(topic.title, `${context}.title`, { max: 500 }),
    facts: validateV4Facts(topic.facts, index),
    findings: validateV4Findings(topic.findings, index),
    industry_impact: validateV4AnalysisBlock(
      topic.industry_impact,
      index,
      "industry_impact",
      "industry_impact",
      "产业影响",
    ),
    strategic_recommendation: validateV4AnalysisBlock(
      topic.strategic_recommendation,
      index,
      "strategic_recommendation",
      "strategic_recommendation",
      "战略建议",
    ),
  };
}

function validateV4Content(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Invalid content");
  rejectUnknownFields(content, V4_CONTENT_FIELDS, "content");
  const selectedTopics = content.selected_topics;
  if (!Number.isInteger(selectedTopics) || selectedTopics < 0 || selectedTopics > 5) {
    throw new Error("Invalid content.selected_topics; expected 0..5");
  }
  const expectedState = selectedTopics === 0
    ? { status: "no_selection", issueKind: "empty_preview" }
    : selectedTopics < 3
      ? { status: "partial", issueKind: "topic_preview" }
      : { status: "complete", issueKind: "complete_issue" };
  if (content.status !== expectedState.status) {
    throw new Error("content.status and selected_topics are inconsistent for v4");
  }
  if (content.issue_kind !== expectedState.issueKind) {
    throw new Error("content.issue_kind and selected_topics are inconsistent for v4");
  }
  const topics = requiredArray(content.topics, "content.topics")
    .map((topic, index) => validateV4Topic(topic, index, selectedTopics));
  if (topics.length !== selectedTopics) throw new Error("content.selected_topics and topics length are inconsistent");
  const topicIds = topics.map((topic) => topic.topic_id);
  const thesisIds = topics.map((topic) => topic.thesis_id);
  if (new Set(topicIds).size !== topicIds.length) throw new Error("Duplicate topic_id");
  if (new Set(thesisIds).size !== thesisIds.length) throw new Error("Duplicate thesis_id");

  let weeklySynthesis;
  if (Object.prototype.hasOwnProperty.call(content, "weekly_synthesis")) {
    if (selectedTopics < 2) throw new Error("content.weekly_synthesis requires at least two selected topics");
    if (
      !content.weekly_synthesis ||
      typeof content.weekly_synthesis !== "object" ||
      Array.isArray(content.weekly_synthesis)
    ) {
      throw new Error("Invalid content.weekly_synthesis");
    }
    rejectUnknownFields(content.weekly_synthesis, SYNTHESIS_FIELDS, "content.weekly_synthesis");
    const paragraphs = stringArray(content.weekly_synthesis.paragraphs, "content.weekly_synthesis.paragraphs");
    if (!paragraphs.length) throw new Error("Invalid content.weekly_synthesis.paragraphs");
    weeklySynthesis = {
      title: requireString(content.weekly_synthesis.title, "content.weekly_synthesis.title", { max: 240 }),
      paragraphs,
    };
  }

  const evidence = requiredArray(content.evidence, "content.evidence").map(validateV4Evidence);
  const media = requiredArray(content.media, "content.media")
    .map(validateV4Media);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const mediaIds = new Set(media.map((item) => item.id));
  if (evidenceIds.size !== evidence.length) throw new Error("Duplicate evidence id");
  if (mediaIds.size !== media.length) throw new Error("Duplicate media id");

  const blocks = topics.flatMap((topic) => [
    ...topic.facts.sections,
    ...topic.findings.items,
    topic.industry_impact,
    topic.strategic_recommendation,
  ]);
  const anchors = blocks.map((block) => block.anchor);
  if (new Set(anchors).size !== anchors.length) throw new Error("Duplicate section anchor");
  const findingIds = topics.flatMap((topic) => topic.findings.items.map((finding) => finding.finding_id));
  if (new Set(findingIds).size !== findingIds.length) throw new Error("Duplicate finding_id");
  for (const block of blocks) {
    for (const id of block.evidence_ids) if (!evidenceIds.has(id)) throw new Error(`Unknown evidence id: ${id}`);
    for (const id of block.media_ids || []) if (!mediaIds.has(id)) throw new Error(`Unknown media id: ${id}`);
  }
  const referencedEvidenceIds = new Set(blocks.flatMap((block) => block.evidence_ids));
  const referencedMediaIds = new Set(blocks.flatMap((block) => block.media_ids || []));
  // Frozen WBR v4 can include verified public evidence used only by weekly_synthesis,
  // but its reader projection omits that binding. Without a synthesis, every evidence
  // item must be visibly referenced; with one, the producer approval remains authoritative.
  if (!weeklySynthesis) {
    for (const id of evidenceIds) {
      if (!referencedEvidenceIds.has(id)) throw new Error(`Unreferenced v4 evidence id: ${id}`);
    }
  }
  for (const id of mediaIds) {
    if (!referencedMediaIds.has(id)) throw new Error(`Unreferenced v4 media id: ${id}`);
  }
  if (selectedTopics === 0 && (evidence.length || media.length)) {
    throw new Error("empty_preview cannot contain evidence or media");
  }

  const normalized = {
    title: requireString(content.title, "content.title", { max: 500 }),
    dek: requireString(content.dek, "content.dek", { max: 3000 }),
    period: validatePeriod(content.period),
    status: expectedState.status,
    issue_kind: expectedState.issueKind,
    selected_topics: selectedTopics,
    topics,
    evidence,
    media,
  };
  if (weeklySynthesis !== undefined) normalized.weekly_synthesis = weeklySynthesis;
  return normalized;
}

function validateWeeklySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Weekly insight snapshot must be an object");
  }
  for (const key of Object.keys(snapshot)) {
    if (!SNAPSHOT_FIELDS.has(key)) throw new Error(`Unknown field at website seam: ${key}`);
  }
  if (![
    "weekly-insight-publication/v1",
    "weekly-insight-publication/v2",
    "weekly-insight-publication/v3",
    "weekly-insight-publication/v4",
  ].includes(snapshot.schema_version)) {
    throw new Error("Unsupported schema_version");
  }
  const isV4 = snapshot.schema_version === "weekly-insight-publication/v4";
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
  rejectUnknownFields(publicationInput, isV4 ? V4_PUBLICATION_FIELDS : PUBLICATION_FIELDS, "publication");
  const publicEnabled = publicationInput.public_enabled === true;
  const visibility = publicationInput.visibility || "internal_preview";
  const authorizationId = optionalString(publicationInput.authorization_id, "publication.authorization_id", 160) || null;
  if (publicEnabled && (visibility !== "public" || !authorizationId)) {
    throw new Error("public_enabled requires visibility=public and publication.authorization_id");
  }
  if (!publicEnabled && visibility !== "internal_preview") {
    throw new Error("Unpublished snapshots must use internal_preview visibility");
  }

  const content = isV4
    ? validateV4Content(snapshot.content)
    : snapshot.schema_version === "weekly-insight-publication/v3"
      ? validateV3Content(snapshot.content)
      : snapshot.schema_version === "weekly-insight-publication/v2"
        ? validateV2Content(snapshot.content)
        : validateV1Content(snapshot.content);
  let releaseEligible;
  if (isV4) {
    if (typeof publicationInput.release_eligible !== "boolean") {
      throw new Error("Invalid publication.release_eligible for v4");
    }
    releaseEligible = content.issue_kind === "complete_issue";
    if (publicationInput.release_eligible !== releaseEligible) {
      throw new Error("publication.release_eligible must match the v4 complete_issue release matrix");
    }
    if (publicEnabled && !releaseEligible) {
      throw new Error("v4 topic_preview and empty_preview cannot be public; a complete_issue is required");
    }
  }
  const contentHash = canonicalSha256(content);
  if (contentHash !== declaredContentHash) throw new Error("content_sha256 does not match canonical content");
  const publication = {
    public_enabled: publicEnabled,
    visibility,
    authorization_id: authorizationId,
  };
  if (isV4) publication.release_eligible = releaseEligible;
  return {
    schema_version: snapshot.schema_version,
    artifact_id: artifactId,
    source_run_id: sourceRunId,
    version,
    approved_candidate_sha256: approvedHash,
    content_sha256: contentHash,
    approval,
    publication,
    content,
    section_anchors: isV4
      ? content.topics.flatMap((topic) => [
        ...topic.facts.sections.map((section) => section.anchor),
        ...topic.findings.items.map((finding) => finding.anchor),
        topic.industry_impact.anchor,
        topic.strategic_recommendation.anchor,
      ])
      : snapshot.schema_version === "weekly-insight-publication/v3"
      ? [
        ...content.topics.flatMap((topic) => [
          topic.facts.anchor,
          ...topic.findings.map((finding) => finding.finding_id),
          topic.industry_impact.anchor,
        ]),
        ...content.strategic_recommendations.map((recommendation) => recommendation.anchor),
      ]
      : snapshot.schema_version === "weekly-insight-publication/v2"
      ? [
        ...content.topics.flatMap((topic) => [
          ...topic.article_sections.map((section) => section.anchor),
          topic.industry_impact.anchor,
          topic.lenovo_china_implication.anchor,
        ]),
        ...content.strategic_recommendations.map((recommendation) => recommendation.anchor),
      ]
      : content.sections.map((section) => section.anchor),
  };
}

module.exports = {
  canonicalJson,
  canonicalSha256,
  validateWeeklySnapshot,
};
