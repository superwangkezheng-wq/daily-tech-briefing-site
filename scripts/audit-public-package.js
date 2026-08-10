const fs = require("node:fs");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { canonicalSha256 } = require("../src/weekly-insight-contract");

const ROOT_DIR = path.join(__dirname, "..");
const SKIP_DIRS = new Set([".git", ".cache", "node_modules", "data/feedback", "data/maintenance"]);
const TEXT_EXTENSIONS = new Set([
  "",
  ".css",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".plist",
  ".sh",
  ".txt",
]);

const RULES = [
  { name: "private macOS user path", pattern: /\/Users\/REDACTED/g },
  { name: "old local hostname", pattern: /REDACTED-HOSTNAME/g },
  { name: "private public domain", pattern: /example/g },
  { name: "real maintenance token", pattern: /REDACTED-TOKEN/g },
  { name: "real Feishu open_id", pattern: /ou_[0-9a-fA-F]{12,}/g },
  {
    name: "filled Cloudflare tunnel token",
    pattern: /CLOUDFLARED_TUNNEL_TOKEN=(?!replace-with-cloudflare-tunnel-token\s*$)\S+/gm,
  },
  {
    name: "filled app secret",
    pattern: /(APP_SECRET|API_KEY|SECRET_KEY)=(?!\s*$|replace-|your-|change-)\S+/gi,
  },
  {
    name: "internal strategy marker in public static assets",
    pattern: /联想中国区|万全智算|Lenovo China/gi,
    publicOnly: true,
  },
];

const BUNDLE_MANIFEST_FIELDS = new Set([
  "schema_version", "artifact_id", "approved_candidate_sha256", "content_sha256",
  "snapshot_path", "public_enabled", "release_eligible", "bundle_entries_sha256", "entries",
]);
const BUNDLE_ENTRY_FIELDS = new Set(["path", "role", "sha256", "size_bytes"]);
const BUNDLE_MEDIA_ENTRY_FIELDS = new Set([
  ...BUNDLE_ENTRY_FIELDS, "mime_type", "width", "height", "rights_scope",
]);
const BUNDLE_CORE_ENTRIES = [
  ["weekly-analysis-candidate.json", "analysis_candidate"],
  ["projection-approval.json", "candidate_approval"],
  ["publication-media-policy.json", "media_policy"],
  ["weekly-insight-publication-v4.json", "reader_snapshot"],
];
const BUNDLE_SUPPORT_ENTRIES = [
  ["visual_asset_plan.json", "visual_plan"],
  ["visual_asset_log.md", "visual_qa_record"],
  ["editorial-review.md", "editorial_qa_record"],
];
const BUNDLE_EDITABLE_SOURCE_EXTENSIONS = new Set([".drawio", ".dot"]);

function shouldSkipDir(relativePath) {
  return [...SKIP_DIRS].some((dir) => relativePath === dir || relativePath.startsWith(`${dir}${path.sep}`));
}

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const relativePath = path.relative(ROOT_DIR, fullPath);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!shouldSkipDir(relativePath)) {
        walk(fullPath, files);
      }
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(name)) || name.includes(".env")) {
      files.push(fullPath);
    }
  }
  return files;
}

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((relativePath) => path.join(ROOT_DIR, relativePath));
  } catch {
    return walk(ROOT_DIR);
  }
}

function regularFilesUnder(directory, files = [], options = {}) {
  if (!fs.existsSync(directory)) {
    throw new Error(`${options.context || "directory"}: does not exist`);
  }
  const rootStat = fs.lstatSync(directory);
  if (rootStat.isSymbolicLink()) {
    if (options.onSymbolicLink) options.onSymbolicLink(directory);
    else throw new Error(`${options.context || "directory"}: symbolic links are not allowed`);
    return files;
  }
  if (!rootStat.isDirectory()) throw new Error(`${options.context || "directory"}: expected a directory`);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      if (options.onSymbolicLink) options.onSymbolicLink(fullPath);
      else throw new Error(`${options.context || "directory"}: symbolic links are not allowed`);
    } else if (stat.isDirectory()) {
      regularFilesUnder(fullPath, files, options);
    } else if (stat.isFile()) {
      files.push(fullPath);
    } else throw new Error(`${options.context || "directory"}: non-regular files are not allowed`);
  }
  return files;
}

function assertExactFields(value, expected, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid weekly bundle manifest ${context}`);
  }
  const actual = Object.keys(value);
  if (actual.length !== expected.size || actual.some((field) => !expected.has(field))) {
    const missing = [...expected].filter((field) => !actual.includes(field));
    const unexpected = actual.filter((field) => !expected.has(field));
    throw new Error(
      `Invalid weekly bundle manifest ${context} fields` +
      `${missing.length ? `; missing ${missing.join(",")}` : ""}` +
      `${unexpected.length ? `; unexpected ${unexpected.join(",")}` : ""}`,
    );
  }
}

function isSafeBundlePath(value) {
  return (
    typeof value === "string" && value.length > 0 && !value.includes("\\") &&
    !path.posix.isAbsolute(value) && path.posix.normalize(value) === value &&
    value.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

function requireBundleLayoutEntry(entries, index, entryPath, role) {
  const entry = entries[index];
  if (entry?.path !== entryPath || entry?.role !== role) {
    throw new Error(`Invalid weekly bundle manifest entry ${index} layout`);
  }
  return index + 1;
}

function validateBundleEntryLayout(entries) {
  let index = 0;
  for (const [entryPath, role] of BUNDLE_CORE_ENTRIES) {
    index = requireBundleLayoutEntry(entries, index, entryPath, role);
  }

  const mediaBases = new Set();
  while (entries[index]?.role === "reader_media") {
    const entry = entries[index];
    if (!entry.path.startsWith("media/") || !entry.path.endsWith(".png")) {
      throw new Error(`Invalid weekly bundle manifest entry ${index} reader media path`);
    }
    const basePath = entry.path.slice(0, -".png".length);
    if (!basePath || mediaBases.has(basePath)) {
      throw new Error(`Invalid weekly bundle manifest entry ${index} reader media path`);
    }
    mediaBases.add(basePath);
    index += 1;
  }
  if (!mediaBases.size) throw new Error("Invalid weekly bundle manifest reader media entries");

  const editableBases = new Set();
  while (entries[index]?.role === "editable_export") {
    const exported = entries[index];
    const basePath = exported.path?.endsWith(".svg")
      ? exported.path.slice(0, -".svg".length)
      : "";
    const source = entries[index + 1];
    const sourceExtension = path.posix.extname(source?.path || "");
    if (
      !mediaBases.has(basePath) || editableBases.has(basePath) ||
      source?.role !== "editable_source" ||
      !BUNDLE_EDITABLE_SOURCE_EXTENSIONS.has(sourceExtension) ||
      source.path.slice(0, -sourceExtension.length) !== basePath
    ) {
      throw new Error(`Invalid weekly bundle manifest entry ${index} editable pair`);
    }
    editableBases.add(basePath);
    index += 2;
  }

  for (const [entryPath, role] of BUNDLE_SUPPORT_ENTRIES) {
    index = requireBundleLayoutEntry(entries, index, entryPath, role);
  }
  if (index !== entries.length) throw new Error("Invalid weekly bundle manifest entry layout");
}

function validatePrivacyManifest(manifest, manifestPath) {
  assertExactFields(manifest, BUNDLE_MANIFEST_FIELDS, "root");
  if (
    manifest.schema_version !== "weekly-insight-private-bundle/v1" ||
    typeof manifest.artifact_id !== "string" || !manifest.artifact_id ||
    !/^[0-9a-f]{64}$/.test(String(manifest.approved_candidate_sha256 || "")) ||
    !/^[0-9a-f]{64}$/.test(String(manifest.content_sha256 || "")) ||
    manifest.snapshot_path !== "weekly-insight-publication-v4.json" ||
    typeof manifest.public_enabled !== "boolean" ||
    typeof manifest.release_eligible !== "boolean" ||
    !Array.isArray(manifest.entries) || !manifest.entries.length ||
    !/^[0-9a-f]{64}$/.test(String(manifest.bundle_entries_sha256 || "")) ||
    canonicalSha256(manifest.entries) !== manifest.bundle_entries_sha256
  ) {
    throw new Error("Invalid weekly bundle manifest identity or entries hash");
  }

  const bundleRoot = path.dirname(manifestPath);
  const entryPaths = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    const context = `entry ${index}`;
    const fields = entry?.role === "reader_media" ? BUNDLE_MEDIA_ENTRY_FIELDS : BUNDLE_ENTRY_FIELDS;
    assertExactFields(entry, fields, context);
    if (
      !isSafeBundlePath(entry.path) || entry.path === "bundle-manifest.json" || entryPaths.has(entry.path) ||
      !/^[0-9a-f]{64}$/.test(String(entry.sha256 || "")) ||
      !Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 0
    ) {
      throw new Error(`Invalid weekly bundle manifest ${context} receipt`);
    }
    entryPaths.add(entry.path);
    if (entry.role === "reader_media" && (
      entry.mime_type !== "image/png" ||
      !Number.isSafeInteger(entry.width) || entry.width <= 0 ||
      !Number.isSafeInteger(entry.height) || entry.height <= 0 ||
      !["internal_only", "public_allowed"].includes(entry.rights_scope)
    )) {
      throw new Error(`Invalid weekly bundle manifest ${context}.rights_scope or media metadata`);
    }
    const entryPath = path.join(bundleRoot, entry.path);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== entry.size_bytes) {
      throw new Error(`Invalid weekly bundle manifest ${context} file receipt`);
    }
    const payload = fs.readFileSync(entryPath);
    const sha256 = crypto.createHash("sha256").update(payload).digest("hex");
    if (sha256 !== entry.sha256) throw new Error(`Invalid weekly bundle manifest ${context} byte receipt`);
  }
  validateBundleEntryLayout(manifest.entries);
  const actualPaths = regularFilesUnder(bundleRoot, [], { context: "weekly bundle" })
    .map((filePath) => path.relative(bundleRoot, filePath).split(path.sep).join("/"))
    .sort();
  const expectedPaths = [path.basename(manifestPath), ...manifest.entries.map((entry) => entry.path)].sort();
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((filePath, index) => filePath !== expectedPaths[index])
  ) {
    throw new Error("Invalid weekly bundle manifest: undeclared or missing bundle files");
  }
  return manifest;
}

function internalMediaHashes(weeklySourceDir) {
  const hashes = new Set();
  const manifestPaths = regularFilesUnder(weeklySourceDir, [], { context: "weekly source" })
    .filter((filePath) => path.basename(filePath) === "bundle-manifest.json");
  if (!manifestPaths.length) {
    throw new Error("weekly source: expected at least one validated bundle-manifest.json");
  }
  for (const filePath of manifestPaths) {
    let manifest;
    try {
      manifest = validatePrivacyManifest(JSON.parse(fs.readFileSync(filePath, "utf8")), filePath);
    } catch (error) {
      throw new Error(`Invalid weekly bundle manifest ${path.relative(weeklySourceDir, filePath)}: ${error.message}`);
    }
    for (const entry of manifest.entries) {
      if (
        entry.role === "reader_media" &&
        entry.rights_scope === "internal_only"
      ) {
        hashes.add(entry.sha256);
      }
    }
  }
  return hashes;
}

function findInternalMediaInPublicRoot({ publicDir, weeklySourceDir }) {
  const deniedHashes = internalMediaHashes(weeklySourceDir);
  const findings = [];
  const publicFiles = regularFilesUnder(publicDir, [], {
    context: "public root",
    onSymbolicLink(filePath) {
      findings.push(`${path.join("public", path.relative(publicDir, filePath))}: symbolic links are not allowed`);
    },
  });
  for (const filePath of publicFiles) {
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    if (deniedHashes.has(sha256)) {
      const relativePath = path.join("public", path.relative(publicDir, filePath));
      findings.push(`${relativePath}: internal-only weekly media bytes (${sha256})`);
    }
  }
  return findings;
}

function weeklyPrivacyAuditFinding(options) {
  try {
    return findInternalMediaInPublicRoot(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`weekly source validation failed: ${message}`];
  }
}

function hasWeeklyBundleManifest(weeklySourceDir) {
  if (!fs.existsSync(weeklySourceDir)) return false;
  return regularFilesUnder(weeklySourceDir, [], { context: "weekly source" })
    .some((filePath) => path.basename(filePath) === "bundle-manifest.json");
}

function runAudit() {
  const findings = [];
  for (const filePath of trackedFiles()) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    if (relativePath === ".git" || relativePath === "scripts/audit-public-package.js") {
      continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    for (const rule of RULES) {
      if (rule.publicOnly && !(relativePath === "public" || relativePath.startsWith(`public${path.sep}`))) continue;
      const matches = text.match(rule.pattern);
      if (matches) {
        findings.push(`${relativePath}: ${rule.name} (${matches.length})`);
      }
    }
  }
  const configuredWeeklySourceDir = process.env.WEEKLY_INSIGHT_SOURCE_DIR;
  const defaultWeeklySourceDir = path.join(ROOT_DIR, "data/weekly-insights");
  const weeklySourceDir = path.resolve(configuredWeeklySourceDir || defaultWeeklySourceDir);
  try {
    if (hasWeeklyBundleManifest(weeklySourceDir)) {
      findings.push(...weeklyPrivacyAuditFinding({
        publicDir: path.join(ROOT_DIR, "public"),
        weeklySourceDir,
      }));
    }
  } catch (error) {
    findings.push(...weeklyPrivacyAuditFinding({
      publicDir: path.join(ROOT_DIR, "public"),
      weeklySourceDir,
    }));
  }
  return findings;
}

if (require.main === module) {
  const findings = runAudit();
  if (findings.length) {
    console.error("Public package privacy audit failed:");
    for (const finding of findings) {
      console.error(`- ${finding}`);
    }
    process.exit(1);
  }
  console.log("public package privacy audit ok");
}

module.exports = { findInternalMediaInPublicRoot, weeklyPrivacyAuditFinding, hasWeeklyBundleManifest, runAudit };
