async function settle(name, operation) {
  try {
    return { name, ok: true, value: await operation() };
  } catch (error) {
    return { name, ok: false, error: error.message || String(error) };
  }
}

async function buildContentCache(options = {}) {
  const buildDaily = options.buildDaily || require("./site-index").buildSiteCache;
  const buildWeekly = options.buildWeekly || require("./weekly-insight-index").buildWeeklyInsightCache;
  const [daily, weekly] = await Promise.all([
    settle("daily", buildDaily),
    settle("weekly", buildWeekly),
  ]);
  return { generatedAt: new Date().toISOString(), daily, weekly };
}

module.exports = { buildContentCache };
