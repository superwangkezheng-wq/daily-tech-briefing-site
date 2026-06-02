const path = require("node:path");
const packageJson = require("../package.json");

const ROOT_DIR = path.join(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, "data");
const DEFAULT_ARCHIVE_DIR = path.join(DEFAULT_DATA_DIR, "collections");
const DEFAULT_FEEDBACK_DIR = path.join(DEFAULT_DATA_DIR, "feedback");
const DEFAULT_MAINTENANCE_DIR = path.join(DEFAULT_DATA_DIR, "maintenance");
const DEFAULT_CACHE_DIR = path.join(ROOT_DIR, ".cache");

const SITE_CONFIG = {
  rootDir: ROOT_DIR,
  siteTitle: process.env.SITE_TITLE || "每日科技信息",
  appVersion: process.env.APP_VERSION || packageJson.version,
  fixedUrl: process.env.FIXED_SITE_URL || "http://localhost:4321",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4321),
  archiveDir: process.env.NEWS_ARCHIVE_DIR || DEFAULT_ARCHIVE_DIR,
  feedbackDir: process.env.FEEDBACK_DIR || DEFAULT_FEEDBACK_DIR,
  feedbackDigestDir: process.env.FEEDBACK_DIGEST_DIR || path.join(DEFAULT_FEEDBACK_DIR, "_digest"),
  maintenanceDir: process.env.MAINTENANCE_DIR || DEFAULT_MAINTENANCE_DIR,
  cacheDir: process.env.CACHE_DIR || DEFAULT_CACHE_DIR,
  reportsIndexFile: process.env.REPORTS_INDEX_FILE || path.join(DEFAULT_CACHE_DIR, "snapshots.json"),
  latestIndexFile: process.env.LATEST_INDEX_FILE || path.join(DEFAULT_CACHE_DIR, "latest.json"),
  detailDir: process.env.DETAIL_CACHE_DIR || path.join(DEFAULT_CACHE_DIR, "snapshot-details"),
  opsStatusFile: process.env.OPS_STATUS_FILE || path.join(DEFAULT_CACHE_DIR, "ops-status.json"),
  refreshStateFile: process.env.REFRESH_STATE_FILE || path.join(DEFAULT_CACHE_DIR, "refresh-state.json"),
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
