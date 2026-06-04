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

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseClockTime(value, fallback) {
  const input = String(value || "").trim();
  const match = input.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return fallback;
  }
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function addMinutesToClockTime(clockTime, minutes) {
  const [hour, minute] = clockTime.split(":").map((part) => Number.parseInt(part, 10));
  const totalMinutes = (hour * 60 + minute + minutes) % (24 * 60);
  const normalized = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
  const nextHour = Math.floor(normalized / 60);
  const nextMinute = normalized % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

function parseSlotList(value, fallback) {
  const allowed = new Set(["morning", "afternoon", "evening"]);
  const slots = String(value || fallback)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => allowed.has(part));
  return slots.length > 0 ? slots : fallback.split(",");
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

function createRefreshSlot({
  key,
  label,
  window,
  envPrefix,
  defaultCollectionTime,
  defaultLagMinutes,
  defaultMaxAttempts,
  defaultRetryDelayMinutes,
}) {
  const collectionTime = parseClockTime(process.env[`${envPrefix}_COLLECTION_TIME`], defaultCollectionTime);
  const refreshLagMinutes = parseInteger(process.env[`${envPrefix}_REFRESH_LAG_MINUTES`], defaultLagMinutes);
  const retryDelayMinutes = parseInteger(
    process.env[`${envPrefix}_REFRESH_RETRY_DELAY_MINUTES`],
    defaultRetryDelayMinutes,
  );
  const retryDelayMs = parseInteger(
    process.env[`${envPrefix}_REFRESH_RETRY_DELAY_MS`],
    retryDelayMinutes * 60 * 1000,
  );
  return {
    key,
    label,
    window,
    collectionTime,
    refreshLagMinutes,
    scheduledCheckAt: addMinutesToClockTime(collectionTime, refreshLagMinutes),
    maxAttempts: parseInteger(process.env[`${envPrefix}_REFRESH_MAX_ATTEMPTS`], defaultMaxAttempts),
    retryDelayMs,
  };
}

const SCHEDULE_CONFIG = {
  dailyCollectionSlots: parseSlotList(process.env.DAILY_COLLECTION_SLOTS, "morning"),
};

const REFRESH_SLOTS = {
  morning: createRefreshSlot({
    key: "morning",
    label: "上午版",
    window: "00:00-09:40",
    envPrefix: "MORNING",
    defaultCollectionTime: "09:40",
    defaultLagMinutes: 20,
    defaultMaxAttempts: 36,
    defaultRetryDelayMinutes: 10,
  }),
  afternoon: createRefreshSlot({
    key: "afternoon",
    label: "下午版",
    window: "09:40-15:00",
    envPrefix: "AFTERNOON",
    defaultCollectionTime: "15:00",
    defaultLagMinutes: 20,
    defaultMaxAttempts: 6,
    defaultRetryDelayMinutes: 5,
  }),
  evening: createRefreshSlot({
    key: "evening",
    label: "晚间版",
    window: "15:00-20:00",
    envPrefix: "EVENING",
    defaultCollectionTime: "20:00",
    defaultLagMinutes: 20,
    defaultMaxAttempts: 6,
    defaultRetryDelayMinutes: 5,
  }),
};

SCHEDULE_CONFIG.refreshSlots = REFRESH_SLOTS;

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
  SCHEDULE_CONFIG,
  REFRESH_SLOTS,
  OPS_CATEGORIES,
};
