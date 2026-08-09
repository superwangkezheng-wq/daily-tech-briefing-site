const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { canonicalSha256 } = require("../../src/weekly-insight-contract");

const CORE_ENTRIES = [
  ["weekly-analysis-candidate.json", "analysis_candidate", { schema_version: "weekly-analysis-candidate/v4" }],
  ["projection-approval.json", "candidate_approval", { status: "approved" }],
  ["publication-media-policy.json", "media_policy", { version: "4.1" }],
];
const SUPPORT_ENTRIES = [
  ["visual_asset_plan.json", "visual_plan", { schema_version: "visual-asset-plan/v1" }],
  ["visual_asset_log.md", "visual_qa_record", "# Visual QA\n"],
  ["editorial-review.md", "editorial_qa_record", "# Editorial QA\n"],
];

async function fileReceipt(root, relativePath, role, additions = {}) {
  const payload = await fs.readFile(path.join(root, relativePath));
  return {
    path: relativePath,
    role,
    sha256: canonicalSha256Buffer(payload),
    size_bytes: payload.length,
    ...additions,
  };
}

function canonicalSha256Buffer(payload) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function writeV41BundleManifest(bundleRoot, snapshot, options = {}) {
  const snapshotPath = options.snapshotPath || "weekly-insight-publication-v4.json";
  await fs.mkdir(bundleRoot, { recursive: true });
  for (const [relativePath, , value] of CORE_ENTRIES) {
    await fs.writeFile(path.join(bundleRoot, relativePath), JSON.stringify(value, null, 2));
  }
  for (const [relativePath, , value] of SUPPORT_ENTRIES) {
    await fs.writeFile(
      path.join(bundleRoot, relativePath),
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    );
  }
  await fs.writeFile(path.join(bundleRoot, snapshotPath), JSON.stringify(snapshot, null, 2));
  for (const media of snapshot.content.media.filter((item) => item.kind === "architecture")) {
    const basePath = media.asset_ref.slice(0, -4);
    await Promise.all([
      fs.writeFile(path.join(bundleRoot, `${basePath}.svg`), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n"),
      fs.writeFile(path.join(bundleRoot, `${basePath}.drawio`), "<mxfile></mxfile>\n"),
    ]);
  }

  const entries = [];
  for (const [relativePath, role] of CORE_ENTRIES) {
    entries.push(await fileReceipt(bundleRoot, relativePath, role));
  }
  entries.push(await fileReceipt(bundleRoot, snapshotPath, "reader_snapshot"));
  for (const media of snapshot.content.media) {
    let sha256 = media.asset_sha256;
    let sizeBytes = media.size_bytes;
    try {
      const payload = await fs.readFile(path.join(bundleRoot, media.asset_ref));
      sha256 = canonicalSha256Buffer(payload);
      sizeBytes = payload.length;
    } catch (error) {
      if (error.code !== "EISDIR" && error.code !== "ENOENT") throw error;
    }
    entries.push({
      path: media.asset_ref,
      role: "reader_media",
      sha256,
      size_bytes: sizeBytes,
      mime_type: media.mime_type,
      width: media.width,
      height: media.height,
      rights_scope: media.rights_scope,
    });
  }
  for (const media of snapshot.content.media.filter((item) => item.kind === "architecture")) {
    const basePath = media.asset_ref.slice(0, -4);
    entries.push(await fileReceipt(bundleRoot, `${basePath}.svg`, "editable_export"));
    entries.push(await fileReceipt(bundleRoot, `${basePath}.drawio`, "editable_source"));
  }
  for (const [relativePath, role] of SUPPORT_ENTRIES) {
    entries.push(await fileReceipt(bundleRoot, relativePath, role));
  }

  const manifest = {
    schema_version: "weekly-insight-private-bundle/v1",
    artifact_id: snapshot.artifact_id,
    approved_candidate_sha256: snapshot.approved_candidate_sha256,
    content_sha256: snapshot.content_sha256,
    snapshot_path: snapshotPath,
    public_enabled: snapshot.publication.public_enabled,
    release_eligible: snapshot.publication.release_eligible,
    bundle_entries_sha256: canonicalSha256(entries),
    entries,
    ...options.manifestOverrides,
  };
  if (options.rehashEntries === true) {
    manifest.bundle_entries_sha256 = canonicalSha256(manifest.entries);
  }
  await fs.writeFile(path.join(bundleRoot, "bundle-manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

module.exports = { writeV41BundleManifest };
