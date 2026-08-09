const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createZip, readZipEntries } = require("../src/ooxml");
const { renderWeeklyDocx } = require("../src/weekly-insight-renderer");
const { validateWeeklySnapshot } = require("../src/weekly-insight-contract");
const {
  buildWeeklyDocxFeedback,
  canonicalJson,
} = require("../src/weekly-docx-feedback-v2");
const {
  commitWeeklyFeedbackOutbox,
  acknowledgeWeeklyFeedback,
} = require("../src/weekly-feedback-outbox");
const { createWeeklyV41Snapshot } = require("./helpers/weekly-fixture");
const { createValidPng } = require("./helpers/image-fixture");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function editedFixture() {
  const image = createValidPng(1);
  const base = createWeeklyV41Snapshot();
  const topic = base.content.topics[0];
  const target = topic.facts.sections[3];
  const media = {
    id: "feedback-v2-architecture",
    kind: "architecture",
    asset_ref: "media/feedback-v2-architecture.png",
    asset_sha256: sha256(image),
    mime_type: "image/png",
    size_bytes: image.length,
    width: 1,
    height: 1,
    alt: "Agent 治理架构测试图",
    caption: "Agent 治理架构的关系测试图。",
    source_label: "example.com",
    source_url: "https://example.com/weekly-v4",
    usage_rights: "原创测试图。",
    target_section_id: target.section_id,
    evidence_ids: ["evidence-v4"],
    rights_scope: "public_allowed",
    rights_basis: "原创测试图。",
    logic_type: "flow",
    logic_summary: "测试图用于验证 Word 媒体保留。",
  };
  const snapshot = validateWeeklySnapshot(createWeeklyV41Snapshot({
    content: {
      ...base.content,
      topics: [{
        ...topic,
        facts: {
          ...topic.facts,
          sections: topic.facts.sections.map((section) => section.section_id === target.section_id
            ? { ...section, media_ids: [media.id] }
            : section),
        },
      }],
      media: [media],
    },
  }));
  const systemDocx = await renderWeeklyDocx(snapshot, {
    mediaAssets: [{
      id: media.id,
      buffer: image,
      extension: "png",
      contentType: "image/png",
      width: 1,
      height: 1,
    }],
  });
  const entries = readZipEntries(systemDocx);
  const documentXml = entries.get("word/document.xml").toString("utf8");
  assert.match(documentXml, /背景与原因在此时同时聚集/);
  entries.set(
    "word/document.xml",
    Buffer.from(documentXml.replace("背景与原因在此时同时聚集", "背景、原因和时机在此时同时聚集")),
  );
  return { snapshot, systemDocx, humanDocx: createZip([...entries.entries()]) };
}

test("v2 adapter binds exact DOCX bytes and complete bookmark text", async () => {
  const fixture = await editedFixture();
  const feedbackId = "019d1234-5678-7abc-8def-0123456789ab";
  const result = buildWeeklyDocxFeedback({ ...fixture, feedbackId });

  assert.equal(result.adapter.schema_version, "weekly-insight-docx-diff/v2");
  assert.equal(result.adapter.feedback_id, feedbackId);
  assert.equal(result.adapter.artifact_id, fixture.snapshot.artifact_id);
  assert.equal(result.adapter.draft_content_sha256, fixture.snapshot.content_sha256);
  assert.deepEqual(result.adapter.docx, {
    system_draft_sha256: sha256(fixture.systemDocx),
    system_draft_size_bytes: fixture.systemDocx.length,
    human_final_sha256: sha256(fixture.humanDocx),
    human_final_size_bytes: fixture.humanDocx.length,
  });
  assert.deepEqual(result.adapter.section_diffs.map((item) => item.anchor), [
    "thesis_v4_01_finding_1",
  ]);
  assert.equal(result.adapter.section_diffs[0].before_sha256, sha256(Buffer.from(result.adapter.section_diffs[0].before)));
  assert.equal(result.adapter.section_diffs[0].after_sha256, sha256(Buffer.from(result.adapter.section_diffs[0].after)));
  assert.equal(result.adapter.package_diff, null);
  assert.deepEqual(result.feedback_areas, ["findings"]);
  assert.deepEqual(JSON.parse(result.adapterBytes), result.adapter);
});

test("v2 outbox manifest is the atomic commit point and retry is idempotent", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-feedback-outbox-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const fixture = await editedFixture();
  const feedbackId = "019d1234-5678-7abc-8def-0123456789ab";
  const payload = buildWeeklyDocxFeedback({ ...fixture, feedbackId });
  const first = await commitWeeklyFeedbackOutbox({ root, ...fixture, ...payload });
  const second = await commitWeeklyFeedbackOutbox({ root, ...fixture, ...payload });
  assert.equal(first.status, "committed");
  assert.equal(second.status, "already_present");

  const manifest = JSON.parse(await fs.readFile(first.manifestPath, "utf8"));
  assert.deepEqual(manifest.entries.map((item) => item.path), [
    "adapter-record.json",
    "human-final.docx",
    "system-draft.docx",
  ]);
  assert.equal(manifest.bundle_sha256, sha256(Buffer.from(canonicalJson(manifest.entries))));
  assert.equal((await fs.stat(first.bundlePath)).mode & 0o777, 0o700);
  for (const file of [...manifest.entries.map((item) => item.path), "outbox-manifest.json"]) {
    assert.equal((await fs.stat(path.join(first.bundlePath, file))).mode & 0o777, 0o600);
  }

  const collisionFixture = {
    ...fixture,
    humanDocx: Buffer.concat([fixture.humanDocx, Buffer.from("collision")]),
  };
  const collisionPayload = buildWeeklyDocxFeedback({ ...collisionFixture, feedbackId });
  await assert.rejects(
    commitWeeklyFeedbackOutbox({ root, ...collisionFixture, ...collisionPayload }),
    /collision|different/i,
  );
  await assert.rejects(
    commitWeeklyFeedbackOutbox({
      root,
      ...fixture,
      ...payload,
      snapshot: { ...fixture.snapshot, artifact_id: "../outside" },
    }),
    /safe path segment/i,
  );
  await assert.rejects(
    commitWeeklyFeedbackOutbox({
      root,
      ...fixture,
      ...payload,
      adapter: { ...payload.adapter, feedback_id: "../../outside" },
    }),
    /safe path segment/i,
  );
  await assert.rejects(
    commitWeeklyFeedbackOutbox({
      root,
      ...fixture,
      ...payload,
      adapter: { ...payload.adapter, artifact_id: "wsi-different-artifact" },
    }),
    /adapter artifact_id mismatch/i,
  );
  await assert.rejects(
    commitWeeklyFeedbackOutbox({
      root,
      ...fixture,
      ...payload,
      adapterBytes: Buffer.concat([payload.adapterBytes, Buffer.from("\n")]),
    }),
    /adapter bytes are not canonical/i,
  );

  const receipt = {
    status: "written",
    feedback_id: feedbackId,
    artifact_id: fixture.snapshot.artifact_id,
    source_run_id: fixture.snapshot.source_run_id,
    draft_content_sha256: fixture.snapshot.content_sha256,
    bundle_sha256: "a".repeat(64),
    bundle_path: "/private/wbr/path/must-not-be-persisted",
    written_at: "2026-08-09T12:00:00+08:00",
  };
  const ackOptions = {
    root,
    artifactId: fixture.snapshot.artifact_id,
    feedbackId,
    bundleSha256: manifest.bundle_sha256,
    receipt,
  };
  const ack = await acknowledgeWeeklyFeedback(ackOptions);
  const retryAck = await acknowledgeWeeklyFeedback({
    ...ackOptions,
    receipt: { ...receipt, status: "already_present", written_at: null },
  });
  assert.equal(ack.status, "acknowledged");
  assert.equal(retryAck.status, "already_acknowledged");
  assert.equal(Object.prototype.hasOwnProperty.call(ack.ack.wbr_receipt, "bundle_path"), false);
  await assert.rejects(
    acknowledgeWeeklyFeedback({ ...ackOptions, bundleSha256: "0".repeat(64) }),
    /hash|collision|mismatch/i,
  );
  await assert.rejects(
    acknowledgeWeeklyFeedback({
      ...ackOptions,
      receipt: { ...receipt, bundle_sha256: "b".repeat(64) },
    }),
    /collision/i,
  );
});

test("v2 parser rejects wrong bookmark binding, DTD and oversized raw DOCX", async () => {
  const fixture = await editedFixture();
  const feedbackId = "019d1234-5678-7abc-8def-0123456789ab";
  const entries = readZipEntries(fixture.humanDocx);
  entries.set(
    "docProps/custom.xml",
    Buffer.from(entries.get("docProps/custom.xml").toString("utf8").replace('name="section_bookmarks"', 'name="section_bookmarks_changed"')),
  );
  assert.throws(
    () => buildWeeklyDocxFeedback({ ...fixture, feedbackId, humanDocx: createZip([...entries.entries()]) }),
    /bookmark|anchor|binding/i,
  );

  const hostile = readZipEntries(fixture.humanDocx);
  hostile.set("word/document.xml", Buffer.from(`<!DOCTYPE w:document [<!ENTITY x "boom">]>${hostile.get("word/document.xml")}`));
  assert.throws(
    () => buildWeeklyDocxFeedback({ ...fixture, feedbackId, humanDocx: createZip([...hostile.entries()]) }),
    /DTD|entity|XML/i,
  );
  assert.throws(
    () => buildWeeklyDocxFeedback({
      ...fixture,
      feedbackId,
      humanDocx: Buffer.alloc(8 * 1024 * 1024 + 1),
    }),
    /too large|8/i,
  );
});
