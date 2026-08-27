const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

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

const SECRET_RULES_PATH = path.join(ROOT_DIR, "scripts/privacy-audit-secrets.json");

// Loads the literal, identifying strings (real usernames, hostnames, domains,
// tokens) this audit looks for. These must never live in source, because this
// script itself ships in the public package -- hardcoding them here would be
// the exact disclosure this audit exists to prevent. Fails closed: a missing,
// corrupt, or empty config throws before any file is scanned, instead of
// silently running with zero rules and reporting a false "all clear".
function loadSecretRules() {
  const relConfigPath = path.relative(ROOT_DIR, SECRET_RULES_PATH);
  let raw;
  try {
    raw = fs.readFileSync(SECRET_RULES_PATH, "utf8");
  } catch (error) {
    throw new Error(
      `privacy audit cannot run: ${relConfigPath} is missing (${error.code || error.message}). ` +
        `Copy ${relConfigPath}.example to ${relConfigPath} and fill in the real values before running this audit.`,
    );
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (error) {
    throw new Error(`privacy audit cannot run: ${relConfigPath} is not valid JSON (${error.message})`);
  }
  if (!config || !Array.isArray(config.rules) || config.rules.length === 0) {
    throw new Error(`privacy audit cannot run: ${relConfigPath} must define a non-empty "rules" array`);
  }
  return config.rules.map((rule, index) => {
    if (!rule || typeof rule.name !== "string" || !rule.name) {
      throw new Error(`privacy audit cannot run: ${relConfigPath} rule ${index} is missing "name"`);
    }
    if (
      !Array.isArray(rule.literals) ||
      !rule.literals.length ||
      rule.literals.some((value) => typeof value !== "string" || !value)
    ) {
      throw new Error(
        `privacy audit cannot run: ${relConfigPath} rule "${rule.name}" needs a non-empty "literals" array of strings`,
      );
    }
    const escaped = rule.literals.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      name: rule.name,
      pattern: new RegExp(escaped.join("|"), rule.caseInsensitive ? "gi" : "g"),
      publicOnly: !!rule.publicOnly,
    };
  });
}

const SECRET_RULES = loadSecretRules();

const RULES = [
  ...SECRET_RULES,
  { name: "real Feishu open_id", pattern: /ou_[0-9a-fA-F]{12,}/g },
  {
    name: "filled Cloudflare tunnel token",
    pattern: /CLOUDFLARED_TUNNEL_TOKEN=(?!replace-with-cloudflare-tunnel-token\s*$)\S+/gm,
  },
  {
    name: "filled app secret",
    pattern: /(APP_SECRET|API_KEY|SECRET_KEY)=(?!\s*$|replace-|your-|change-)\S+/gi,
  },
];

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

const findings = [];
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

for (const filePath of trackedFiles()) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  if (
    relativePath === ".git" ||
    relativePath === "scripts/audit-public-package.js" ||
    relativePath === "scripts/privacy-audit-secrets.json"
  ) {
    continue;
  }
  const text = fs.readFileSync(filePath, "utf8");
  for (const rule of RULES) {
    const matches = text.match(rule.pattern);
    if (matches) {
      findings.push(`${relativePath}: ${rule.name} (${matches.length})`);
    }
  }
}

if (findings.length) {
  console.error("Public package privacy audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("public package privacy audit ok");
