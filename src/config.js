const path = require("node:path");
const fs = require("node:fs");
const packageJson = require("../package.json");

const ROOT_DIR = path.join(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, "data");
const DEFAULT_ARCHIVE_DIR = path.join(DEFAULT_DATA_DIR, "collections");
const DEFAULT_FEEDBACK_DIR = path.join(DEFAULT_DATA_DIR, "feedback");
const DEFAULT_MAINTENANCE_DIR = path.join(DEFAULT_DATA_DIR, "maintenance");
const DEFAULT_CACHE_DIR = path.join(ROOT_DIR, ".cache");

function parseEnvValue(raw) {
  const value = String(raw || "").trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }
    process.env[match[1]] = parseEnvValue(match[2]);
  }
}

function resolveProjectPath(value, fallback) {
  const input = String(value || "").trim();
  if (!input) {
    return fallback;
  }
  return path.isAbsolute(input) ? input : path.resolve(ROOT_DIR, input);
}

loadDotEnv();

const archiveDir = resolveProjectPath(process.env.NEWS_ARCHIVE_DIR, DEFAULT_ARCHIVE_DIR);
const feedbackDir = resolveProjectPath(process.env.FEEDBACK_DIR, DEFAULT_FEEDBACK_DIR);
const feedbackDigestDir = resolveProjectPath(
  process.env.FEEDBACK_DIGEST_DIR,
  path.join(feedbackDir, "_digest"),
);
const maintenanceDir = resolveProjectPath(process.env.MAINTENANCE_DIR, DEFAULT_MAINTENANCE_DIR);
const cacheDir = resolveProjectPath(process.env.CACHE_DIR, DEFAULT_CACHE_DIR);

const SITE_CONFIG = {
  rootDir: ROOT_DIR,
  siteTitle: process.env.SITE_TITLE || "每日科技信息",
  appVersion: process.env.APP_VERSION || packageJson.version,
  fixedUrl: process.env.FIXED_SITE_URL || "http://localhost:4321",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4321),
  archiveDir,
  feedbackDir,
  feedbackDigestDir,
  maintenanceDir,
  cacheDir,
  reportsIndexFile: resolveProjectPath(process.env.REPORTS_INDEX_FILE, path.join(cacheDir, "snapshots.json")),
  latestIndexFile: resolveProjectPath(process.env.LATEST_INDEX_FILE, path.join(cacheDir, "latest.json")),
  detailDir: resolveProjectPath(process.env.DETAIL_CACHE_DIR, path.join(cacheDir, "snapshot-details")),
  opsStatusFile: resolveProjectPath(process.env.OPS_STATUS_FILE, path.join(cacheDir, "ops-status.json")),
  refreshStateFile: resolveProjectPath(process.env.REFRESH_STATE_FILE, path.join(cacheDir, "refresh-state.json")),
  openclawBin: process.env.OPENCLAW_BIN || "openclaw",
  feishuAccount: process.env.FEISHU_ACCOUNT || "default",
  feishuTarget: process.env.FEISHU_TARGET || "",
  maintenanceToken: process.env.MAINTENANCE_TOKEN || "",
  feedbackDigestHour: process.env.FEEDBACK_DIGEST_HOUR || "10:15",
  pageSize: Number(process.env.PAGE_SIZE || 6),
};

const REFRESH_SLOTS = {
  morning: {
    key: "morning",
    label: "上午版",
    window: "00:00-09:40",
    scheduledCheckAt: "10:00",
  },
  afternoon: {
    key: "afternoon",
    label: "下午版",
    window: "09:40-15:00",
    scheduledCheckAt: "15:20",
  },
  evening: {
    key: "evening",
    label: "晚间版",
    window: "15:00-20:00",
    scheduledCheckAt: "20:20",
  },
};

const OPS_CATEGORIES = {
  run: "运行日志",
  refresh: "刷新检查",
  alert: "异常告警",
  access: "访问记录",
  release: "发布记录",
  iteration: "版本迭代",
};

module.exports = {
  SITE_CONFIG,
  REFRESH_SLOTS,
  OPS_CATEGORIES,
};
