const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { SITE_CONFIG, REFRESH_SLOTS } = require("./config");
const { listReportSnapshots, parseReportFile } = require("./report-parser");

const SLOT_ORDER = {
  上午版: 1,
  下午版: 2,
  晚间版: 3,
};

function compareSnapshotRecords(a, b) {
  const aSortKey = String(a.sortKey || `${a.date || ""}-${a.time || ""}`);
  const bSortKey = String(b.sortKey || `${b.date || ""}-${b.time || ""}`);
  if (aSortKey !== bSortKey) return bSortKey.localeCompare(aSortKey);
  if (a.slotLabel !== b.slotLabel) return (SLOT_ORDER[b.slotLabel] || 0) - (SLOT_ORDER[a.slotLabel] || 0);
  return String(b.time || "").localeCompare(String(a.time || ""));
}

function hhmmLabel(value) {
  const raw = String(value || "");
  if (raw.length !== 6) return raw;
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}`;
}

function extractSlotLabel(slotText, fallbackTime) {
  const cleaned = String(slotText || "").trim();
  const match = cleaned.match(/^(上午版|下午版|晚间版)/);
  if (match) return match[1];
  const hhmm = String(fallbackTime || "").slice(0, 4);
  if (hhmm >= "0000" && hhmm < "1200") return "上午版";
  if (hhmm >= "1200" && hhmm < "1800") return "下午版";
  return "晚间版";
}

function extractWindow(slotText, fallbackTime) {
  const cleaned = String(slotText || "").trim();
  const match = cleaned.match(/\((.+)\)/);
  if (match) return match[1];
  const hhmm = String(fallbackTime || "").slice(0, 4);
  if (hhmm >= "0000" && hhmm < "1200") return REFRESH_SLOTS.morning.window;
  if (hhmm >= "1200" && hhmm < "1800") return REFRESH_SLOTS.afternoon.window;
  return REFRESH_SLOTS.evening.window;
}

function slotKeyFromLabel(label) {
  if (label === "上午版") return "morning";
  if (label === "下午版") return "afternoon";
  return "evening";
}

function buildSummaryNote(report) {
  const first = report.sections.techNews && report.sections.techNews[0];
  if (!first) {
    return "当前版本暂无可展示的重点新闻。";
  }
  return `本版首条为“${first.title}”，页面提供摘要、产业影响和原文入口。`;
}

function distinctLatestSlotSnapshots(snapshots) {
  const result = [];
  const seen = new Set();
  for (const snapshot of snapshots) {
    const report = parseReportFile(snapshot.path);
    const slotLabel = extractSlotLabel(report.slot, snapshot.time);
    const key = `${snapshot.date}-${slotLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ snapshot, report, slotLabel });
  }
  return result;
}

function buildSnapshotRecord(snapshot, report, slotLabel) {
  const slotKey = slotKeyFromLabel(slotLabel);
  const window = extractWindow(report.slot, snapshot.time);
  return {
    id: `${snapshot.date}-${slotLabel}-${snapshot.time}`,
    date: snapshot.date,
    time: snapshot.time,
    sortKey: snapshot.sortKey,
    slotKey,
    slotLabel,
    shortSlotLabel: slotLabel,
    window,
    generatedAtLabel: report.generatedAt ? `生成于 ${report.generatedAt}` : `生成于 ${hhmmLabel(snapshot.time)}`,
    statusLabel: `${hhmmLabel(snapshot.time)} 已更新`,
    displayTitle: `${snapshot.date} ${slotLabel}`,
    summaryNote: buildSummaryNote(report),
    title: report.title,
    generatedAt: report.generatedAt,
    slot: report.slot,
    total: report.total,
    snapshotTime: report.snapshotTime,
    sourceFile: report.sourceFile,
    heroNote: report.heroNote,
    sections: report.sections,
    counts: report.counts,
  };
}

function buildSnapshotSummary(item) {
  return {
    id: item.id,
    date: item.date,
    time: item.time,
    sortKey: item.sortKey,
    slotKey: item.slotKey,
    slotLabel: item.slotLabel,
    shortSlotLabel: item.shortSlotLabel,
    window: item.window,
    generatedAtLabel: item.generatedAtLabel,
    statusLabel: item.statusLabel,
    displayTitle: item.displayTitle,
    title: item.title,
    generatedAt: item.generatedAt,
    total: item.total,
    counts: item.counts,
    summaryNote: item.summaryNote,
  };
}

async function listCachedSnapshotDetails() {
  if (!fs.existsSync(SITE_CONFIG.detailDir)) return [];

  const names = await fsp.readdir(SITE_CONFIG.detailDir);
  const details = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(SITE_CONFIG.detailDir, name), "utf8");
      const detail = JSON.parse(raw);
      if (detail && detail.id && detail.date && detail.sections) {
        details.push(detail);
      }
    } catch (error) {
      // A stale detail file should not make the whole site unreadable.
    }
  }

  return details.sort(compareSnapshotRecords);
}

async function getDetailCacheFallbackIndex() {
  const details = await listCachedSnapshotDetails();
  const snapshots = details.map(buildSnapshotSummary);
  if (!snapshots.length) return null;

  return {
    generatedAt: new Date().toISOString(),
    sourceDir: SITE_CONFIG.archiveDir,
    cacheSource: "detail-cache-fallback",
    count: snapshots.length,
    snapshots,
  };
}

async function ensureCacheDirs() {
  await fsp.mkdir(SITE_CONFIG.cacheDir, { recursive: true });
  await fsp.mkdir(SITE_CONFIG.detailDir, { recursive: true });
}

async function buildSiteCache() {
  await ensureCacheDirs();
  const snapshots = listReportSnapshots(SITE_CONFIG.archiveDir);
  const distinct = distinctLatestSlotSnapshots(snapshots)
    .map(({ snapshot, report, slotLabel }) => buildSnapshotRecord(snapshot, report, slotLabel))
    .sort(compareSnapshotRecords);

  const summaryIndex = distinct.map((item) => ({
    id: item.id,
    date: item.date,
    time: item.time,
    sortKey: item.sortKey,
    slotKey: item.slotKey,
    slotLabel: item.slotLabel,
    shortSlotLabel: item.shortSlotLabel,
    window: item.window,
    generatedAtLabel: item.generatedAtLabel,
    statusLabel: item.statusLabel,
    displayTitle: item.displayTitle,
    title: item.title,
    generatedAt: item.generatedAt,
    total: item.total,
    counts: item.counts,
    summaryNote: item.summaryNote,
  }));

  await fsp.writeFile(
    SITE_CONFIG.reportsIndexFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceDir: SITE_CONFIG.archiveDir,
        count: summaryIndex.length,
        snapshots: summaryIndex,
      },
      null,
      2,
    ),
    "utf8",
  );

  for (const detail of distinct) {
    const detailPath = path.join(SITE_CONFIG.detailDir, `${detail.id}.json`);
    await fsp.writeFile(detailPath, JSON.stringify(detail, null, 2), "utf8");
  }

  const latest = summaryIndex[0] || null;
  await fsp.writeFile(
    SITE_CONFIG.latestIndexFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        latest,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    generatedAt: new Date().toISOString(),
    latest,
    snapshots: summaryIndex,
    totalFiles: snapshots.length,
  };
}

async function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function getSnapshotsIndex() {
  const cached = await readJsonIfExists(SITE_CONFIG.reportsIndexFile);
  if (cached && Array.isArray(cached.snapshots) && cached.snapshots.length) {
    return cached;
  }
  const fallback = await getDetailCacheFallbackIndex();
  if (fallback) return fallback;
  return buildSiteCache();
}

async function getLatestSnapshotMeta() {
  const cached = await readJsonIfExists(SITE_CONFIG.latestIndexFile);
  if (cached && cached.latest) return cached.latest;
  const fallback = await getDetailCacheFallbackIndex();
  if (fallback) return fallback.snapshots[0] || null;
  const built = await buildSiteCache();
  return built.latest;
}

async function getSnapshotDetail(snapshotId) {
  const detailPath = path.join(SITE_CONFIG.detailDir, `${snapshotId}.json`);
  const cached = await readJsonIfExists(detailPath);
  if (cached) return cached;

  await buildSiteCache();
  return readJsonIfExists(detailPath);
}

module.exports = {
  buildSiteCache,
  getSnapshotsIndex,
  getLatestSnapshotMeta,
  getSnapshotDetail,
  extractSlotLabel,
  extractWindow,
  slotKeyFromLabel,
};
