const fs = require("node:fs/promises");
const path = require("node:path");

function slugifyName(name) {
  return String(name || "visitor")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "visitor";
}

function formatParts(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    iso: date.toISOString(),
  };
}

async function saveFeedback({
  feedbackDir,
  visitorName,
  contact,
  content,
  reportDate,
  reportTitle,
  snapshotId,
  source,
  fingerprint,
  userAgent,
}) {
  const now = new Date();
  const { date, time, iso } = formatParts(now);
  const bucketDir = path.join(feedbackDir, date);
  await fs.mkdir(bucketDir, { recursive: true });

  const slug = slugifyName(visitorName);
  const fileName = `${date}-${time}-${slug}.md`;
  const filePath = path.join(bucketDir, fileName);

  const markdown = [
    "---",
    `created_at: ${iso}`,
    `visitor_name: ${JSON.stringify(visitorName)}`,
    `contact: ${JSON.stringify(contact || "")}`,
    `fingerprint: ${JSON.stringify(fingerprint)}`,
    `report_date: ${JSON.stringify(reportDate || "")}`,
    `report_title: ${JSON.stringify(reportTitle || "")}`,
    `snapshot_id: ${JSON.stringify(snapshotId || "")}`,
    `source: ${JSON.stringify(source || "daily-tech-site")}`,
    `user_agent: ${JSON.stringify(userAgent || "")}`,
    "---",
    "",
    "# 一键反馈",
    "",
    content.trim(),
    "",
  ].join("\n");

  await fs.writeFile(filePath, markdown, "utf8");
  return { filePath, slug };
}

module.exports = { saveFeedback };
