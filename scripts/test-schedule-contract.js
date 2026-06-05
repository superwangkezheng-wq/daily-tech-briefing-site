const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { REFRESH_SLOTS, SCHEDULE_CONFIG } = require("../src/config");

const ROOT_DIR = path.join(__dirname, "..");
const LAUNCHD_TEMPLATES = path.join(ROOT_DIR, "launchd/templates");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertPlistTime(filePath, expectedTimes) {
  const text = readText(filePath);
  for (const { hour, minute } of expectedTimes) {
    const pattern = new RegExp(
      `<key>Hour</key>\\s*<integer>${hour}</integer>[\\s\\S]*?<key>Minute</key>\\s*<integer>${minute}</integer>`,
    );
    assert.match(text, pattern, `${filePath} should include ${hour}:${String(minute).padStart(2, "0")}`);
  }
}

assert.equal(REFRESH_SLOTS.morning.window, "00:00-09:40");
assert.equal(REFRESH_SLOTS.morning.collectionTime, "09:40");
assert.equal(REFRESH_SLOTS.morning.scheduledCheckAt, "10:00");
assert.equal(REFRESH_SLOTS.morning.maxAttempts, 36);
assert.equal(REFRESH_SLOTS.morning.retryDelayMs, 600000);
assert.equal(REFRESH_SLOTS.afternoon.window, "09:40-15:00");
assert.equal(REFRESH_SLOTS.afternoon.scheduledCheckAt, "15:20");
assert.equal(REFRESH_SLOTS.evening.scheduledCheckAt, "20:20");
assert.deepEqual(SCHEDULE_CONFIG.dailyCollectionSlots, ["morning"]);

const checkRefresh = readText(path.join(ROOT_DIR, "scripts/check-refresh.js"));
assert.match(checkRefresh, /return REFRESH_SLOTS\.morning;/);
assert.match(checkRefresh, /return slot\.maxAttempts \|\| 6;/);
assert.match(checkRefresh, /return slot\.retryDelayMs \|\| 300000;/);

const healthReport = readText(path.join(ROOT_DIR, "scripts/send-feedback-health-report.js"));
assert.match(healthReport, /const structuralOk = missing\.length === 0 && disabled\.length === 0 && scheduleDrift\.length === 0;/);
assert.match(healthReport, /status: structuralOk \? \(recentErrors\.length > 0 \? "warn" : "ok"\) : "fail"/);
assert.doesNotMatch(healthReport, /ok: .*recentErrors\.length === 0/);

const overrideConfig = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "-e",
      "const {REFRESH_SLOTS,SCHEDULE_CONFIG}=require('./src/config'); console.log(JSON.stringify({morning:REFRESH_SLOTS.morning,dailyCollectionSlots:SCHEDULE_CONFIG.dailyCollectionSlots}));",
    ],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        DAILY_COLLECTION_SLOTS: "morning,afternoon",
        MORNING_COLLECTION_TIME: "08:30",
        MORNING_REFRESH_LAG_MINUTES: "25",
        MORNING_REFRESH_MAX_ATTEMPTS: "12",
        MORNING_REFRESH_RETRY_DELAY_MINUTES: "7",
      },
    },
  ),
);
assert.equal(overrideConfig.morning.collectionTime, "08:30");
assert.equal(overrideConfig.morning.scheduledCheckAt, "08:55");
assert.equal(overrideConfig.morning.maxAttempts, 12);
assert.equal(overrideConfig.morning.retryDelayMs, 420000);
assert.deepEqual(overrideConfig.dailyCollectionSlots, ["morning", "afternoon"]);

assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.morning.plist"), [
  { hour: 10, minute: 0 },
]);
assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.afternoon.plist"), [
  { hour: 15, minute: 20 },
]);
assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.evening.plist"), [
  { hour: 20, minute: 20 },
]);

const qmdRefreshTemplate = readText(path.join(LAUNCHD_TEMPLATES, "com.dailytech.qmd.refresh.plist"));
assert.match(qmdRefreshTemplate, /exec "__SUPPORT_DIR__\/dailytech_qmd_refresh\.sh"/);
assert.match(qmdRefreshTemplate, /<key>WorkingDirectory<\/key>\s*<string>__SUPPORT_DIR__<\/string>/);

const installer = readText(path.join(ROOT_DIR, "scripts/install-launchd.sh"));
assert.match(installer, /DAILY_COLLECTION_SLOTS:-morning/);
assert.match(installer, /INSTALL_AFTERNOON_REFRESH:-0/);
assert.match(installer, /INSTALL_EVENING_REFRESH:-0/);
assert.match(installer, /source "\$support_site_env"/);
assert.match(installer, /disabled_refresh_plists\+=\("\$target_dir\/com\.dailytech\.qmd\.refresh\.plist"\)/);

const oneNGuide = readText(path.join(ROOT_DIR, "docs/1n-system-guide.md"));
assert.match(oneNGuide, /Fresh subsystem status files are the business truth/);
assert.match(oneNGuide, /scheduled one-shot LaunchAgent can retain an old non-zero `lastExit`/);
assert.match(oneNGuide, /DailyAcceptance must refresh HealthDashboard after writing its final status/);

console.log("public schedule contract ok");
