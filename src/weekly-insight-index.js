const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { SITE_CONFIG } = require("./config");
const { publishWeeklySnapshot } = require("./weekly-insight-publisher");
const { validateWeeklySnapshot } = require("./weekly-insight-contract");
const { evaluateWeeklyRelease, loadWeeklyReleaseOverride } = require("./weekly-publication-schedule");

const WEEKLY_SOURCE_AUXILIARY_FILES = new Set([
  "bundle-manifest.json",
  "projection-approval.json",
  "publication-media-policy.json",
  "visual_asset_plan.json",
  "weekly-analysis-candidate.json",
]);

function compareInsight(a, b) {
  const aEnd = String(a.period?.end || "");
  const bEnd = String(b.period?.end || "");
  if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
  return String(b.committed_at || "").localeCompare(String(a.committed_at || ""));
}

function toIndexEntry(manifest) {
  const isV4 = manifest.content_schema_version === "weekly-insight-publication/v4";
  return {
    content_schema_version: manifest.content_schema_version || "weekly-insight-publication/v1",
    artifact_id: manifest.artifact_id,
    source_run_id: manifest.source_run_id,
    version: manifest.version,
    content_sha256: manifest.content_sha256,
    section_anchors: manifest.section_anchors,
    reader_sections: isV4
      ? ["事实与案例", manifest.version === "4.1" ? "关键发现" : "发现", "产业影响", "战略建议"]
      : undefined,
    publication: manifest.publication,
    period: manifest.period,
    title: manifest.title,
    dek: manifest.dek,
    status: manifest.status,
    issue_kind: manifest.issue_kind,
    selected_theses: manifest.selected_theses,
    selected_topics: manifest.selected_topics,
    committed_at: manifest.committed_at,
  };
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(temp, filePath);
}

async function buildWeeklyInsightCache(options = {}) {
  const sourceDir = path.resolve(options.sourceDir || SITE_CONFIG.weeklySourceDir);
  const publishRoot = path.resolve(options.publishRoot || SITE_CONFIG.weeklyCacheDir);
  await fsp.mkdir(sourceDir, { recursive: true });
  await fsp.mkdir(publishRoot, { recursive: true });
  const names = (await fsp.readdir(sourceDir)).filter((name) => name.endsWith(".json")).sort();
  const errors = [];
  const deferred = [];
  for (const name of names) {
    if (WEEKLY_SOURCE_AUXILIARY_FILES.has(name)) continue;
    try {
      const sourcePath = path.join(sourceDir, name);
      const input = await readJson(sourcePath);
      const snapshot = validateWeeklySnapshot(input);
      const override = typeof options.resolveReleaseOverride === "function"
        ? await options.resolveReleaseOverride(snapshot)
        : await loadWeeklyReleaseOverride(
          options.releaseOverridesFile || SITE_CONFIG.weeklyReleaseOverridesFile,
          snapshot,
        );
      const release = evaluateWeeklyRelease(snapshot, { now: options.now, override });
      if (!release.eligible) {
        deferred.push({
          artifact_id: snapshot.artifact_id,
          source_run_id: snapshot.source_run_id,
          reason: release.reason,
          publish_at: release.publish_at,
        });
        continue;
      }
      await publishWeeklySnapshot(input, {
        publishRoot,
        maxDocxBytes: options.maxDocxBytes ?? SITE_CONFIG.weeklyFeedbackMaxDocxBytes,
        mediaBundleRoot: path.dirname(sourcePath),
        sourcePath,
      });
    } catch (error) {
      errors.push({ source_file: name, error: error.message });
    }
  }
  const deferredArtifactIds = new Set(deferred.map((item) => item.artifact_id));
  const published = [];
  for (const entry of await fsp.readdir(publishRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".stage-")) continue;
    try {
      const manifest = await readJson(path.join(publishRoot, entry.name, "manifest.json"));
      if (!deferredArtifactIds.has(manifest.artifact_id)) published.push(toIndexEntry(manifest));
    } catch (error) {
      errors.push({ source_file: `${entry.name}/manifest.json`, error: error.message });
    }
  }
  published.sort(compareInsight);
  const index = {
    schema_version: "weekly-insight-index/v1",
    generated_at: new Date().toISOString(),
    source_dir: sourceDir,
    count: published.length,
    insights: published,
    errors,
    deferred,
  };
  await writeJsonAtomic(path.join(publishRoot, "index.json"), index);
  return { generatedAt: index.generated_at, published, errors, deferred, totalFiles: names.length };
}

async function getWeeklyInsights(options = {}) {
  const publishRoot = path.resolve(options.publishRoot || SITE_CONFIG.weeklyCacheDir);
  const includeUnpublished = options.includeUnpublished === true;
  const indexPath = path.join(publishRoot, "index.json");
  if (!fs.existsSync(indexPath)) {
    if (options.buildIfMissing === false) {
      return { generated_at: null, count: 0, insights: [] };
    }
    await buildWeeklyInsightCache({ sourceDir: options.sourceDir, publishRoot });
  }
  const index = await readJson(indexPath);
  const insights = (index.insights || []).filter(
    (item) => includeUnpublished || item.publication?.public_enabled === true,
  );
  return { generated_at: index.generated_at, count: insights.length, insights };
}

async function getWeeklyInsight(artifactId, options = {}) {
  const normalizedId = String(artifactId || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(normalizedId)) return null;
  const publishRoot = path.resolve(options.publishRoot || SITE_CONFIG.weeklyCacheDir);
  const indexPath = path.join(publishRoot, "index.json");
  if (!fs.existsSync(indexPath)) {
    if (options.buildIfMissing === false) return null;
    await buildWeeklyInsightCache({ sourceDir: options.sourceDir, publishRoot });
  }
  let index;
  try {
    index = await readJson(indexPath);
  } catch {
    return null;
  }
  if ((index.deferred || []).some((entry) => entry.artifact_id === normalizedId)) return null;
  const indexed = (index.insights || []).find((entry) => entry.artifact_id === normalizedId);
  if (!indexed) return null;
  if (!options.includeUnpublished && indexed.publication?.public_enabled !== true) return null;
  const artifactDir = path.join(publishRoot, normalizedId);
  try {
    const [manifest, snapshot] = await Promise.all([
      readJson(path.join(artifactDir, "manifest.json")),
      readJson(path.join(artifactDir, "content.json")),
    ]);
    if (manifest.content_sha256 !== indexed.content_sha256) return null;
    if (!options.includeUnpublished && manifest.publication?.public_enabled !== true) return null;
    return { ...snapshot, manifest, artifact_dir: artifactDir };
  } catch (error) {
    return null;
  }
}

module.exports = {
  buildWeeklyInsightCache,
  getWeeklyInsights,
  getWeeklyInsight,
};
