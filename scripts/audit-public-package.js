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

const RULES = [
  { name: "private macOS user path", pattern: /\/Users\/lenovo/g },
  { name: "old local hostname", pattern: /LenovodeMac-mini/g },
  { name: "private public domain", pattern: /tian1616/g },
  { name: "real maintenance token", pattern: /860519/g },
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
  if (relativePath === ".git" || relativePath === "scripts/audit-public-package.js") {
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
