const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { canonicalJson } = require("./weekly-docx-feedback-v2");

const SAFE_ID = /^[a-z0-9][a-z0-9-]{2,99}$/;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function receipt(entryPath, value) {
  return { path: entryPath, sha256: sha256(value), size_bytes: value.length };
}

function exposedError(message) {
  const error = new Error(message);
  error.expose = true;
  return error;
}

async function writePrivateExclusive(filePath, value) {
  const handle = await fsp.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(value);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

function validateOutboxPath(root, artifactId, feedbackId) {
  if (!path.isAbsolute(root)) throw exposedError("Feedback outbox root must be absolute");
  if (!SAFE_ID.test(String(artifactId || ""))) {
    throw exposedError("Feedback outbox artifact_id is not a safe path segment");
  }
  if (!SAFE_ID.test(String(feedbackId || ""))) {
    throw exposedError("Feedback outbox feedback_id is not a safe path segment");
  }
  return path.join(root, artifactId, feedbackId);
}

function validateCommitInputs({ snapshot, systemDocx, humanDocx, adapter, adapterBytes }) {
  if (!Buffer.isBuffer(systemDocx) || !Buffer.isBuffer(humanDocx)) {
    throw exposedError("Feedback outbox requires raw DOCX bytes");
  }
  const bindings = {
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    version: snapshot.version,
    draft_content_sha256: snapshot.content_sha256,
  };
  for (const [key, expected] of Object.entries(bindings)) {
    if (adapter[key] !== expected) throw exposedError(`Feedback outbox adapter ${key} mismatch`);
  }
  const expectedDocx = {
    system_draft_sha256: sha256(systemDocx),
    system_draft_size_bytes: systemDocx.length,
    human_final_sha256: sha256(humanDocx),
    human_final_size_bytes: humanDocx.length,
  };
  if (canonicalJson(adapter.docx) !== canonicalJson(expectedDocx)) {
    throw exposedError("Feedback outbox adapter DOCX receipt mismatch");
  }
  const expectedAdapterBytes = Buffer.from(canonicalJson(adapter), "utf8");
  if (!Buffer.isBuffer(adapterBytes) || !adapterBytes.equals(expectedAdapterBytes)) {
    throw exposedError("Feedback outbox adapter bytes are not canonical");
  }
}

async function syncDirectory(directoryPath) {
  const handle = await fsp.open(directoryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function sameCommittedBundle(bundlePath, expectedManifest) {
  try {
    const observed = await readJson(path.join(bundlePath, "outbox-manifest.json"));
    if (canonicalJson(observed) !== canonicalJson(expectedManifest)) return false;
    for (const entry of expectedManifest.entries) {
      const value = await fsp.readFile(path.join(bundlePath, entry.path));
      if (value.length !== entry.size_bytes || sha256(value) !== entry.sha256) return false;
    }
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function commitWeeklyFeedbackOutbox(options) {
  const {
    root,
    snapshot,
    systemDocx,
    humanDocx,
    adapter,
    adapterBytes = Buffer.from(canonicalJson(adapter), "utf8"),
  } = options;
  const bundlePath = validateOutboxPath(root, snapshot.artifact_id, adapter.feedback_id);
  validateCommitInputs({ snapshot, systemDocx, humanDocx, adapter, adapterBytes });
  const files = {
    "adapter-record.json": adapterBytes,
    "human-final.docx": humanDocx,
    "system-draft.docx": systemDocx,
  };
  const entries = Object.entries(files)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, value]) => receipt(name, value));
  const manifest = {
    schema_version: "weekly-insight-feedback-bundle/v2",
    feedback_id: adapter.feedback_id,
    artifact_id: snapshot.artifact_id,
    source_run_id: snapshot.source_run_id,
    version: snapshot.version,
    draft_content_sha256: snapshot.content_sha256,
    entries,
    bundle_sha256: sha256(Buffer.from(canonicalJson(entries), "utf8")),
  };
  const artifactPath = path.join(root, snapshot.artifact_id);
  await fsp.mkdir(artifactPath, { recursive: true, mode: 0o700 });
  await fsp.chmod(artifactPath, 0o700);
  try {
    if (await sameCommittedBundle(bundlePath, manifest)) {
      await syncDirectory(artifactPath);
      return {
        status: "already_present",
        bundlePath,
        manifestPath: path.join(bundlePath, "outbox-manifest.json"),
        manifest,
      };
    }
    await fsp.access(bundlePath);
    throw exposedError("Feedback outbox collision: feedback_id already contains different bytes");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const stagePath = path.join(artifactPath, `.${adapter.feedback_id}.${crypto.randomUUID()}`);
  await fsp.mkdir(stagePath, { mode: 0o700 });
  try {
    for (const [name, value] of Object.entries(files)) {
      await writePrivateExclusive(path.join(stagePath, name), value);
    }
    await writePrivateExclusive(
      path.join(stagePath, "outbox-manifest.json"),
      Buffer.from(canonicalJson(manifest), "utf8"),
    );
    const stageHandle = await fsp.open(stagePath, "r");
    try {
      await stageHandle.sync();
    } finally {
      await stageHandle.close();
    }
    try {
      await fsp.rename(stagePath, bundlePath);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      if (!await sameCommittedBundle(bundlePath, manifest)) {
        throw exposedError("Feedback outbox collision: feedback_id already contains different bytes");
      }
      await fsp.rm(stagePath, { recursive: true, force: true });
      await syncDirectory(artifactPath);
      return {
        status: "already_present",
        bundlePath,
        manifestPath: path.join(bundlePath, "outbox-manifest.json"),
        manifest,
      };
    }
    await syncDirectory(artifactPath);
    const manifestPath = path.join(bundlePath, "outbox-manifest.json");
    return { status: "committed", bundlePath, manifestPath, manifest };
  } catch (error) {
    await fsp.rm(stagePath, { recursive: true, force: true });
    throw error;
  }
}

async function acknowledgeWeeklyFeedback({ root, artifactId, feedbackId, bundleSha256, receipt: wbrReceipt }) {
  const bundlePath = validateOutboxPath(root, artifactId, feedbackId);
  const manifest = await readJson(path.join(bundlePath, "outbox-manifest.json"));
  if (manifest.artifact_id !== artifactId || manifest.feedback_id !== feedbackId) {
    throw exposedError("Feedback ack outbox identity mismatch");
  }
  if (manifest.bundle_sha256 !== bundleSha256) throw exposedError("Feedback ack bundle hash mismatch");
  if (!wbrReceipt || typeof wbrReceipt !== "object" || Array.isArray(wbrReceipt)) {
    throw exposedError("Feedback ack requires a WBR receipt");
  }
  const expectedReceipt = {
    feedback_id: manifest.feedback_id,
    artifact_id: manifest.artifact_id,
    source_run_id: manifest.source_run_id,
    draft_content_sha256: manifest.draft_content_sha256,
  };
  for (const [key, expected] of Object.entries(expectedReceipt)) {
    if (wbrReceipt[key] !== expected) throw exposedError(`Feedback ack WBR receipt ${key} mismatch`);
  }
  if (!["written", "already_present"].includes(wbrReceipt.status)) {
    throw exposedError("Feedback ack WBR receipt status is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(String(wbrReceipt.bundle_sha256 || ""))) {
    throw exposedError("Feedback ack WBR receipt bundle hash is invalid");
  }
  const safeWbrReceipt = {
    status: wbrReceipt.status,
    feedback_id: wbrReceipt.feedback_id,
    artifact_id: wbrReceipt.artifact_id,
    source_run_id: wbrReceipt.source_run_id,
    draft_content_sha256: wbrReceipt.draft_content_sha256,
    bundle_sha256: wbrReceipt.bundle_sha256,
    written_at: typeof wbrReceipt.written_at === "string" ? wbrReceipt.written_at : null,
  };
  const ackPath = path.join(bundlePath, "ack.json");
  const ack = {
    schema_version: "weekly-insight-feedback-ack/v1",
    artifact_id: manifest.artifact_id,
    feedback_id: manifest.feedback_id,
    outbox_bundle_sha256: bundleSha256,
    wbr_receipt: safeWbrReceipt,
  };
  try {
    await writePrivateExclusive(ackPath, Buffer.from(canonicalJson(ack), "utf8"));
    await syncDirectory(bundlePath);
    return { status: "acknowledged", ackPath, ack };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readJson(ackPath);
    const sameAckIdentity = existing.schema_version === ack.schema_version
      && existing.artifact_id === ack.artifact_id
      && existing.feedback_id === ack.feedback_id
      && existing.outbox_bundle_sha256 === ack.outbox_bundle_sha256
      && existing.wbr_receipt?.feedback_id === safeWbrReceipt.feedback_id
      && existing.wbr_receipt?.artifact_id === safeWbrReceipt.artifact_id
      && existing.wbr_receipt?.source_run_id === safeWbrReceipt.source_run_id
      && existing.wbr_receipt?.draft_content_sha256 === safeWbrReceipt.draft_content_sha256
      && existing.wbr_receipt?.bundle_sha256 === safeWbrReceipt.bundle_sha256
      && ["written", "already_present"].includes(existing.wbr_receipt?.status);
    if (!sameAckIdentity) throw exposedError("Feedback ack collision");
    await syncDirectory(bundlePath);
    return { status: "already_acknowledged", ackPath, ack: existing };
  }
}

module.exports = { commitWeeklyFeedbackOutbox, acknowledgeWeeklyFeedback };
