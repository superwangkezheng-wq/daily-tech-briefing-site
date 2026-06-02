const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { SITE_CONFIG, OPS_CATEGORIES } = require("./config");

function pad(value) {
  return String(value).padStart(2, "0");
}

function todayString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function ensureOpsDirs() {
  await fsp.mkdir(SITE_CONFIG.maintenanceDir, { recursive: true });
  await Promise.all(
    Object.values(OPS_CATEGORIES).map((name) =>
      fsp.mkdir(path.join(SITE_CONFIG.maintenanceDir, name), { recursive: true }),
    ),
  );
  await fsp.mkdir(SITE_CONFIG.cacheDir, { recursive: true });
}

function opsFilePath(category, date = new Date()) {
  const dirName = OPS_CATEGORIES[category] || category;
  return path.join(SITE_CONFIG.maintenanceDir, dirName, `${todayString(date)}.md`);
}

async function appendOpsLog(category, title, lines = []) {
  await ensureOpsDirs();
  const now = new Date();
  const filePath = opsFilePath(category, now);
  const timestamp = now.toISOString();
  const content = [
    `## ${title}`,
    "",
    `- 时间：${timestamp}`,
    ...lines.map((line) => `- ${line}`),
    "",
  ].join("\n");
  await fsp.appendFile(filePath, content, "utf8");
  return filePath;
}

async function updateOpsStatus(patch) {
  await ensureOpsDirs();
  let current = {};
  if (fs.existsSync(SITE_CONFIG.opsStatusFile)) {
    current = JSON.parse(await fsp.readFile(SITE_CONFIG.opsStatusFile, "utf8"));
  }
  const baseSite = {
    fixedUrl: SITE_CONFIG.fixedUrl,
    archiveDir: SITE_CONFIG.archiveDir,
    feedbackDir: SITE_CONFIG.feedbackDir,
    maintenanceDir: SITE_CONFIG.maintenanceDir,
  };
  const next = {
    ...current,
    ...patch,
    site: {
      ...(current.site || {}),
      ...((patch && patch.site) || {}),
      ...baseSite,
    },
    refresh: {
      ...(current.refresh || {}),
      ...((patch && patch.refresh) || {}),
    },
    digest: {
      ...(current.digest || {}),
      ...((patch && patch.digest) || {}),
    },
    updatedAt: new Date().toISOString(),
  };
  await fsp.writeFile(SITE_CONFIG.opsStatusFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function readOpsStatus() {
  await ensureOpsDirs();
  if (!fs.existsSync(SITE_CONFIG.opsStatusFile)) {
    return updateOpsStatus({
      site: {},
    });
  }
  const current = JSON.parse(await fsp.readFile(SITE_CONFIG.opsStatusFile, "utf8"));
  return updateOpsStatus(current);
}

module.exports = {
  ensureOpsDirs,
  appendOpsLog,
  updateOpsStatus,
  readOpsStatus,
  todayString,
};
