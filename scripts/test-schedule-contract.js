const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { REFRESH_SLOTS } = require("../src/config");

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
assert.equal(REFRESH_SLOTS.morning.scheduledCheckAt, "10:00");
assert.equal(REFRESH_SLOTS.afternoon.window, "09:40-15:00");
assert.equal(REFRESH_SLOTS.afternoon.scheduledCheckAt, "15:20");
assert.equal(REFRESH_SLOTS.evening.scheduledCheckAt, "20:20");

const checkRefresh = readText(path.join(ROOT_DIR, "scripts/check-refresh.js"));
assert.match(checkRefresh, /return 2;\s*}\s*return 6;/);
assert.match(checkRefresh, /return 600000;/);

assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.morning.plist"), [
  { hour: 10, minute: 0 },
]);
assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.afternoon.plist"), [
  { hour: 15, minute: 20 },
]);
assertPlistTime(path.join(LAUNCHD_TEMPLATES, "com.dailytech.site.refresh.evening.plist"), [
  { hour: 20, minute: 20 },
]);

console.log("public schedule contract ok");
