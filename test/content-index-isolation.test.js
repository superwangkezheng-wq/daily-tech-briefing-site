const test = require("node:test");
const assert = require("node:assert/strict");
const { buildContentCache } = require("../src/content-index");

test("weekly failure does not discard a successful daily refresh", async () => {
  const daily = { generatedAt: "daily-ok", snapshots: [{ id: "daily-1" }] };
  const result = await buildContentCache({
    buildDaily: async () => daily,
    buildWeekly: async () => { throw new Error("weekly failed"); },
  });
  assert.deepEqual(result.daily.value, daily);
  assert.equal(result.daily.ok, true);
  assert.equal(result.weekly.ok, false);
  assert.match(result.weekly.error, /weekly failed/);
});

test("daily failure does not discard a successful weekly refresh", async () => {
  const weekly = { generatedAt: "weekly-ok", published: [{ artifact_id: "weekly-1" }] };
  const result = await buildContentCache({
    buildDaily: async () => { throw new Error("daily failed"); },
    buildWeekly: async () => weekly,
  });
  assert.equal(result.daily.ok, false);
  assert.match(result.daily.error, /daily failed/);
  assert.equal(result.weekly.ok, true);
  assert.deepEqual(result.weekly.value, weekly);
});

test("normalizes non-Error cache failures instead of throwing while handling them", async () => {
  const result = await buildContentCache({
    buildDaily: async () => { throw null; },
    buildWeekly: async () => { throw "weekly string failure"; },
  });
  assert.equal(result.daily.ok, false);
  assert.equal(result.daily.error, "null");
  assert.equal(result.weekly.ok, false);
  assert.equal(result.weekly.error, "weekly string failure");
});
