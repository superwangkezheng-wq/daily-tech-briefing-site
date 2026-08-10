const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { findInternalMediaInPublicRoot, weeklyPrivacyAuditFinding } = require("../scripts/audit-public-package");
const { canonicalSha256 } = require("../src/weekly-insight-contract");

const BUNDLE_LAYOUT = [
  ["weekly-analysis-candidate.json", "analysis_candidate"],
  ["projection-approval.json", "candidate_approval"],
  ["publication-media-policy.json", "media_policy"],
  ["weekly-insight-publication-v4.json", "reader_snapshot"],
  ["media/agentforger-csrf-comparison.png", "reader_media"],
  ["media/agent-control-chain.png", "reader_media"],
  ["media/agent-control-chain.svg", "editable_export"],
  ["media/agent-control-chain.drawio", "editable_source"],
  ["visual_asset_plan.json", "visual_plan"],
  ["visual_asset_log.md", "visual_qa_record"],
  ["editorial-review.md", "editorial_qa_record"],
];

const W32_DYNAMIC_LAYOUT = [
  ["weekly-analysis-candidate.json", "analysis_candidate"],
  ["projection-approval.json", "candidate_approval"],
  ["publication-media-policy.json", "media_policy"],
  ["weekly-insight-publication-v4.json", "reader_snapshot"],
  ["media/physical-ai-loop.png", "reader_media"],
  ["media/agent-operating-layer.png", "reader_media"],
  ["media/skill-optimization-loop.png", "reader_media"],
  ["media/inference-stack-paths.png", "reader_media"],
  ["media/physical-ai-loop.svg", "editable_export"],
  ["media/physical-ai-loop.dot", "editable_source"],
  ["media/agent-operating-layer.svg", "editable_export"],
  ["media/agent-operating-layer.dot", "editable_source"],
  ["media/skill-optimization-loop.svg", "editable_export"],
  ["media/skill-optimization-loop.dot", "editable_source"],
  ["media/inference-stack-paths.svg", "editable_export"],
  ["media/inference-stack-paths.dot", "editable_source"],
  ["visual_asset_plan.json", "visual_plan"],
  ["visual_asset_log.md", "visual_qa_record"],
  ["editorial-review.md", "editorial_qa_record"],
];

async function writeBundle(sourceDir, {
  privateBytes,
  publicBytes = Buffer.from("public media"),
  layout = BUNDLE_LAYOUT,
}) {
  const entries = [];
  for (const [entryPath, role] of layout) {
    const payload = role === "reader_media"
      ? (entryPath.includes("comparison") ? privateBytes : publicBytes)
      : Buffer.from(`${role}:${entryPath}`);
    const absolutePath = path.join(sourceDir, entryPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, payload);
    const entry = {
      path: entryPath,
      role,
      sha256: crypto.createHash("sha256").update(payload).digest("hex"),
      size_bytes: payload.length,
    };
    if (role === "reader_media") {
      Object.assign(entry, {
        mime_type: "image/png",
        width: 1,
        height: 1,
        rights_scope: entryPath.includes("comparison") ? "internal_only" : "public_allowed",
      });
    }
    entries.push(entry);
  }
  const manifest = {
    schema_version: "weekly-insight-private-bundle/v1",
    artifact_id: "wsi-test-v4-1",
    approved_candidate_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    snapshot_path: "weekly-insight-publication-v4.json",
    public_enabled: false,
    release_eligible: false,
    bundle_entries_sha256: canonicalSha256(entries),
    entries,
  };
  await fs.writeFile(path.join(sourceDir, "bundle-manifest.json"), JSON.stringify(manifest));
  return manifest;
}

test("public package audit rejects bytes declared internal_only by a private weekly bundle", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-public-privacy-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);
  const privateBytes = Buffer.from("private weekly media bytes");
  const privateHash = crypto.createHash("sha256").update(privateBytes).digest("hex");
  await fs.writeFile(path.join(publicDir, "renamed.png"), privateBytes);
  await writeBundle(sourceDir, { privateBytes });

  assert.deepEqual(
    findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }),
    [`public/renamed.png: internal-only weekly media bytes (${privateHash})`],
  );
});

test("public package audit permits public_allowed weekly media bytes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-public-allowed-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);
  const publicBytes = Buffer.from("public weekly media bytes");
  await fs.writeFile(path.join(publicDir, "allowed.png"), publicBytes);
  await writeBundle(sourceDir, {
    privateBytes: Buffer.from("different private bytes"),
    publicBytes,
  });

  assert.deepEqual(findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }), []);
});

test("public package audit accepts a four-topic SVG/DOT weekly bundle", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-public-dynamic-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);

  const manifest = await writeBundle(sourceDir, {
    privateBytes: Buffer.from("private bytes that are not part of this public bundle"),
    layout: W32_DYNAMIC_LAYOUT,
  });
  for (const entry of manifest.entries.filter((item) => item.role === "reader_media")) {
    const destination = path.join(publicDir, entry.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(sourceDir, entry.path), destination);
  }

  assert.deepEqual(findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }), []);
});

test("public package audit rejects symbolic links before the static server can follow them", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-public-symlink-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  const privatePath = path.join(root, "private.png");
  const privateBytes = Buffer.from("private symlink target");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
    fs.writeFile(privatePath, privateBytes),
  ]);
  await fs.symlink(privatePath, path.join(publicDir, "leak.png"));
  await writeBundle(sourceDir, { privateBytes });

  assert.deepEqual(
    findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }),
    ["public/leak.png: symbolic links are not allowed"],
  );
});

test("public package audit fails closed on an ambiguous weekly bundle manifest", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-public-manifest-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);
  const manifest = await writeBundle(sourceDir, { privateBytes: Buffer.from("private bytes") });
  delete manifest.entries[4].rights_scope;
  manifest.bundle_entries_sha256 = canonicalSha256(manifest.entries);
  await fs.writeFile(path.join(sourceDir, "bundle-manifest.json"), JSON.stringify(manifest));

  assert.throws(
    () => findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }),
    /invalid weekly bundle manifest.*rights_scope/i,
  );
});

test("public package audit fails closed when the weekly source is absent or has no manifest", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-source-missing-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const emptySourceDir = path.join(root, "weekly-source-empty");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(emptySourceDir, { recursive: true }),
  ]);

  assert.throws(
    () => findInternalMediaInPublicRoot({
      publicDir,
      weeklySourceDir: path.join(root, "weekly-source-absent"),
    }),
    /weekly source.*does not exist/i,
  );
  assert.throws(
    () => findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: emptySourceDir }),
    /weekly source.*bundle-manifest\.json/i,
  );
});

test("top-level public audit reports an invalid weekly source as a finding", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-source-audit-finding-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  await fs.mkdir(publicDir, { recursive: true });
  assert.deepEqual(
    weeklyPrivacyAuditFinding({ publicDir, weeklySourceDir: path.join(root, "missing") }),
    ["weekly source validation failed: weekly source: does not exist"],
  );
});

test("public package audit rejects files omitted from the frozen bundle manifest", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-source-extra-file-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, "public");
  const sourceDir = path.join(root, "weekly-source");
  await Promise.all([
    fs.mkdir(publicDir, { recursive: true }),
    fs.mkdir(sourceDir, { recursive: true }),
  ]);
  await writeBundle(sourceDir, { privateBytes: Buffer.from("private bytes") });
  await fs.writeFile(path.join(sourceDir, "media", "undeclared.png"), "not in manifest");

  assert.throws(
    () => findInternalMediaInPublicRoot({ publicDir, weeklySourceDir: sourceDir }),
    /undeclared or missing bundle files/i,
  );
});
