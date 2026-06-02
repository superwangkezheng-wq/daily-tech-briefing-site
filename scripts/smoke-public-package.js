const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");

process.env.NEWS_ARCHIVE_DIR ||= path.join(ROOT_DIR, "data/collections");
process.env.FEEDBACK_DIR ||= path.join(ROOT_DIR, "data/feedback");
process.env.FEEDBACK_DIGEST_DIR ||= path.join(ROOT_DIR, "data/feedback/_digest");
process.env.MAINTENANCE_DIR ||= path.join(ROOT_DIR, "data/maintenance");
process.env.CACHE_DIR ||= path.join(ROOT_DIR, ".cache");

const { buildSiteCache, getLatestSnapshotMeta, getSnapshotDetail } = require("../src/site-index");
const { saveFeedback } = require("../src/feedback-store");

async function main() {
  const result = await buildSiteCache();
  assert.ok(result.snapshots.length > 0, "sample report should produce at least one snapshot");

  const latest = await getLatestSnapshotMeta();
  assert.ok(latest && latest.id, "latest snapshot should be readable");

  const detail = await getSnapshotDetail(latest.id);
  assert.ok(detail.sections.techNews.length >= 1, "snapshot detail should include tech news");

  const saved = await saveFeedback({
    feedbackDir: process.env.FEEDBACK_DIR,
    visitorName: "smoke-test",
    contact: "",
    content: "这是一条公开包 smoke 测试反馈。",
    reportDate: latest.date,
    reportTitle: latest.displayTitle,
    snapshotId: latest.id,
    source: "smoke",
    fingerprint: "smoke",
    userAgent: "smoke",
  });
  assert.ok(saved.filePath.includes("data/feedback"), "feedback should be written to configured feedback dir");

  console.log("public package smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
