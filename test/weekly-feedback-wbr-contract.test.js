const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createZip, readZipEntries } = require("../src/ooxml");
const { publishWeeklySnapshot } = require("../src/weekly-insight-publisher");
const { buildWeeklyDocxFeedback } = require("../src/weekly-docx-feedback-v2");
const { commitWeeklyFeedbackOutbox } = require("../src/weekly-feedback-outbox");

const WBR_ROOT = process.env.WBR_ROOT || path.resolve(__dirname, "../../WBR");
const BUNDLE_ROOT = path.join(WBR_ROOT, "artifacts/staging/2026-W31-agent-v4-1-media-preview");
const SNAPSHOT_PATH = path.join(BUNDLE_ROOT, "weekly-insight-publication-v4.json");
const WBR_FEEDBACK_MODULE = path.join(WBR_ROOT, "src/weekly_intelligence/feedback_intake.py");

test("WBR public intake accepts the website v2 outbox and recognizes an idempotent retry", async (t) => {
  const dependencyAvailable = await Promise.all([SNAPSHOT_PATH, WBR_FEEDBACK_MODULE]
    .map((target) => fs.access(target).then(() => true, () => false)));
  if (dependencyAvailable.includes(false)) {
    t.skip("WBR cross-repo fixture is not available; set WBR_ROOT to enable this integration test");
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "weekly-feedback-wbr-contract-"));
  const realRoot = await fs.realpath(root);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8"));
  const publication = await publishWeeklySnapshot(snapshot, {
    publishRoot: path.join(root, "published"),
    mediaBundleRoot: BUNDLE_ROOT,
    sourcePath: SNAPSHOT_PATH,
  });
  const systemDocx = await fs.readFile(path.join(publication.artifact_dir, `${snapshot.artifact_id}.docx`));
  const entries = readZipEntries(systemDocx);
  const documentXml = entries.get("word/document.xml").toString("utf8");
  const original = "持久配置与计划任务使 Agent 具备持续数字身份";
  const edited = "持久配置与计划任务使 Agent 具备可追踪的持续数字身份";
  assert.match(documentXml, new RegExp(original));
  entries.set("word/document.xml", Buffer.from(documentXml.replace(original, edited)));
  entries.set("word/styles.xml", Buffer.concat([entries.get("word/styles.xml"), Buffer.from("\n")]));
  const humanDocx = createZip([...entries.entries()]);
  const feedbackId = "019d1234-5678-7abc-8def-0123456789ab";
  const diff = buildWeeklyDocxFeedback({ snapshot, systemDocx, humanDocx, feedbackId });
  const outbox = await commitWeeklyFeedbackOutbox({
    root: path.join(root, "outbox"),
    snapshot,
    systemDocx,
    humanDocx,
    ...diff,
  });
  assert.deepEqual(diff.feedback_areas, ["findings", "overall"]);
  assert.deepEqual(diff.adapter.package_diff.changed_parts, ["formatting"]);

  const scriptPath = path.join(root, "verify_wbr_intake.py");
  const script = `
import hashlib
import json
import sys
from pathlib import Path
from weekly_intelligence.feedback_intake import (
    FeedbackPackageDiff, FeedbackSectionDiff, FeedbackSourceRecord,
    FeedbackSubmission, ingest_human_feedback,
)

snapshot_path, bundle_path, output_root, index_root = map(Path, sys.argv[1:])
snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
adapter_bytes = (bundle_path / "adapter-record.json").read_bytes()
adapter = json.loads(adapter_bytes)
system = (bundle_path / "system-draft.docx").read_bytes()
human = (bundle_path / "human-final.docx").read_bytes()
manifest = (bundle_path / "outbox-manifest.json").read_bytes()

class Resolver:
    def resolve(self, artifact_id, content_sha256):
        assert artifact_id == snapshot["artifact_id"]
        assert content_sha256 == snapshot["content_sha256"]
        return FeedbackSourceRecord(
            snapshot=snapshot,
            authority_id="website-cross-repo-contract-test",
            system_docx_sha256=hashlib.sha256(system).hexdigest(),
            system_docx_size_bytes=len(system),
        )

section_diffs = tuple(FeedbackSectionDiff(**item) for item in adapter["section_diffs"])
package_payload = adapter["package_diff"]
package_diff = FeedbackPackageDiff(
    before_sha256=package_payload["before_sha256"],
    after_sha256=package_payload["after_sha256"],
    before=package_payload["before"],
    after=package_payload["after"],
    changed_parts=tuple(package_payload["changed_parts"]),
    summary=package_payload["summary"],
) if package_payload else None
submission = FeedbackSubmission(
    feedback_id=adapter["feedback_id"],
    received_at="2026-08-09T12:00:00+08:00",
    source_kind="final_docx",
    artifact_id=adapter["artifact_id"],
    source_run_id=adapter["source_run_id"],
    version=adapter["version"],
    draft_content_sha256=adapter["draft_content_sha256"],
    feedback_areas=("findings", "overall"),
    section_anchors=tuple(item.anchor for item in section_diffs),
    source_ref="http://127.0.0.1/insights/" + adapter["artifact_id"],
    adapter_schema_version=adapter["schema_version"],
    section_diffs=section_diffs,
    package_diff=package_diff,
)
indexes = (index_root / "wiki", index_root / "业务参考")
for item in indexes:
    item.mkdir(parents=True, mode=0o700, exist_ok=True)
kwargs = dict(
    source_resolver=Resolver(), original_docx=system, final_docx=human,
    adapter_record=adapter_bytes, outbox_manifest=manifest, indexed_roots=indexes,
)
first = ingest_human_feedback(submission, output_root, **kwargs)
second = ingest_human_feedback(submission, output_root, **kwargs)
print(json.dumps({
    "first": first.status,
    "second": second.status,
    "feedback_id": first.feedback_id,
    "bundle_sha256": first.bundle_sha256,
    "bundle_path": str(first.bundle_path),
}, sort_keys=True))
`;
  await fs.writeFile(scriptPath, script, "utf8");
  const verification = spawnSync("python3", [
    scriptPath,
    SNAPSHOT_PATH,
    outbox.bundlePath,
    path.join(realRoot, "wbr-intake"),
    path.join(realRoot, "indexed-roots"),
  ], {
    cwd: WBR_ROOT,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: path.join(WBR_ROOT, "src") },
  });
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
  const result = JSON.parse(verification.stdout.trim());
  assert.equal(result.first, "written");
  assert.equal(result.second, "already_present");
  assert.equal(result.feedback_id, feedbackId);
  const received = await fs.readdir(result.bundle_path);
  assert.ok(received.includes("outbox-manifest.json"));
  assert.ok(received.includes("human-final.docx"));
  assert.ok(received.includes("system-draft.docx"));
});
