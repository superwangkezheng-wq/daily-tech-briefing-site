const test = require("node:test");
const assert = require("node:assert/strict");
const { createWeeklySnapshot } = require("./helpers/weekly-fixture");
const { validateWeeklySnapshot } = require("../src/weekly-insight-contract");

test("accepts an approved internal-preview snapshot with shared anchors", () => {
  const result = validateWeeklySnapshot(createWeeklySnapshot());
  assert.equal(result.publication.public_enabled, false);
  assert.deepEqual(result.section_anchors, [
    "core_insight",
    "verified_facts",
    "lenovo_china_implications",
  ]);
});

test("rejects an internal appendix at the public website seam", () => {
  const snapshot = createWeeklySnapshot({
    internal_strategic_appendix: { recommendation: "never publish this" },
  });
  assert.throws(() => validateWeeklySnapshot(snapshot), /unknown field.*internal_strategic_appendix/i);
});

test("approval does not imply public authorization", () => {
  const snapshot = createWeeklySnapshot({
    publication: {
      public_enabled: true,
      visibility: "public",
      authorization_id: null,
    },
  });
  assert.throws(() => validateWeeklySnapshot(snapshot), /authorization_id/i);
});

test("rejects a content hash mismatch", () => {
  const snapshot = createWeeklySnapshot({ content_sha256: "b".repeat(64) });
  assert.throws(() => validateWeeklySnapshot(snapshot), /content_sha256/i);
});

test("supports no-selection and at most four selected theses", () => {
  const empty = createWeeklySnapshot({
    content: {
      status: "no_selection",
      selected_theses: 0,
      sections: [],
      evidence: [],
      media: [],
    },
  });
  assert.equal(validateWeeklySnapshot(empty).content.selected_theses, 0);

  const tooMany = createWeeklySnapshot({
    content: { selected_theses: 5 },
  });
  assert.throws(() => validateWeeklySnapshot(tooMany), /selected_theses/i);

  const numericString = createWeeklySnapshot({
    content: { selected_theses: "2" },
  });
  assert.throws(() => validateWeeklySnapshot(numericString), /selected_theses/i);
});

for (const selectedTheses of [1, 2, 3, 4]) {
  test(`accepts ${selectedTheses} selected ${selectedTheses === 1 ? "thesis" : "theses"}`, () => {
    const snapshot = createWeeklySnapshot({
      content: {
        status: selectedTheses >= 3 ? "complete" : "partial",
        selected_theses: selectedTheses,
      },
    });
    assert.equal(validateWeeklySnapshot(snapshot).content.selected_theses, selectedTheses);
  });
}

test("rejects executable evidence URLs and tolerates a missing image", () => {
  const unsafe = createWeeklySnapshot({
    content: {
      evidence: [{
        id: "ev_01",
        title: "unsafe",
        publisher: "unsafe",
        source_url: "javascript:alert(1)",
        published_at: "2026-07-24",
        accessed_at: "2026-07-26T12:00:00+08:00",
        role: "direct",
        note: "unsafe",
      }],
    },
  });
  assert.throws(() => validateWeeklySnapshot(unsafe), /source_url/i);

  const credentialUrl = createWeeklySnapshot({
    content: {
      evidence: [{
        id: "ev_01",
        title: "credential URL",
        publisher: "unsafe",
        source_url: "https://user:password@example.com/report",
        published_at: "2026-07-24",
        accessed_at: "2026-07-26T12:00:00+08:00",
        role: "direct",
        note: "unsafe",
      }],
    },
  });
  assert.throws(() => validateWeeklySnapshot(credentialUrl), /source_url/i);

  const missingImage = createWeeklySnapshot({
    content: {
      media: [{
        id: "arch_01",
        kind: "architecture",
        src: null,
        alt: "fallback is rendered",
        caption: "bad image",
        source_label: "source",
        source_url: "https://example.com/report",
      }],
    },
  });
  const result = validateWeeklySnapshot(missingImage);
  assert.equal(result.content.media[0].src, null);

  const malformedImage = createWeeklySnapshot({
    content: {
      media: [{
        id: "arch_01",
        kind: "architecture",
        src: "not a URL",
        alt: "invalid",
        caption: "invalid",
        source_label: "source",
        source_url: null,
      }],
    },
  });
  assert.throws(() => validateWeeklySnapshot(malformedImage), /content\.media\[0\]\.src/i);
});

test("rejects unknown nested fields before cache or API publication", () => {
  const snapshot = createWeeklySnapshot({
    content: { internal_strategic_appendix: "private" },
  });
  assert.throws(() => validateWeeklySnapshot(snapshot), /unknown field in content.*internal_strategic_appendix/i);
});

test("rejects explicitly malformed collection fields instead of coercing them empty", () => {
  for (const [field, value] of [["sections", {}], ["evidence", "none"], ["media", false]]) {
    const snapshot = createWeeklySnapshot({ content: { [field]: value } });
    assert.throws(() => validateWeeklySnapshot(snapshot), new RegExp(`content\\.${field}.*array`, "i"));
  }
});

for (const mediaKind of ["image", "architecture", "benchmark"]) {
  test(`accepts ${mediaKind} figures`, () => {
    const snapshot = createWeeklySnapshot({
      content: {
        media: [{
          id: "arch_01",
          kind: mediaKind,
          src: "https://example.com/figure.png",
          alt: `${mediaKind} figure`,
          caption: "Public-safe figure",
          source_label: "Example",
          source_url: "https://example.com/report",
          usage_rights: "Internal analytical quotation with attribution.",
        }],
      },
    });
    const validated = validateWeeklySnapshot(snapshot).content.media[0];
    assert.equal(validated.kind, mediaKind);
    assert.equal(validated.usage_rights, "Internal analytical quotation with attribution.");
  });
}
