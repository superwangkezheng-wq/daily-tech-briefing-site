const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SITE_CONFIG } = require("./config");

const RUNTIME_ENV_FILE =
  process.env.OPENCLAW_RUNTIME_ENV_FILE ||
  path.join(os.homedir(), "Library/Application Support/OpenClaw/runtime-secrets.env");

function parseShellValue(raw) {
  const value = String(raw || "").trim();
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function loadRuntimeEnv() {
  if (!fs.existsSync(RUNTIME_ENV_FILE)) {
    return {};
  }
  const env = {};
  const lines = fs.readFileSync(RUNTIME_ENV_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    env[match[1]] = parseShellValue(match[2]);
  }
  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || 45000;
    const spawnOptions = { ...options };
    delete spawnOptions.timeoutMs;
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      if (timedOut) {
        finish(reject, new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
        return;
      }
      if (code === 0) {
        finish(resolve, { code, stdout, stderr });
      } else {
        finish(reject, new Error(stderr || stdout || `Command failed: ${command} ${args.join(" ")}`));
      }
    });
  });
}

function assertBroadcastSucceeded(stdout) {
  const text = stdout.trim();
  if (!text) {
    throw new Error("Feishu broadcast failed: empty openclaw output");
  }
  const parsed = parseJsonPayload(text);
  const results = parsed?.payload?.results;
  if (!Array.isArray(results)) {
    throw new Error(`Feishu broadcast failed: missing payload.results in output: ${text.slice(-500)}`);
  }
  const failed = results.filter((item) => !item?.ok);
  if (failed.length > 0 || results.length === 0) {
    const detail = failed.map((item) => item.error || `${item.channel || "unknown"} failed`).join("; ");
    throw new Error(`Feishu broadcast failed: ${detail || "no successful target"}`);
  }
}

function parseJsonPayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    // The OpenClaw CLI can print plugin/config prelude lines before the JSON payload.
  }
  for (const marker of ["\n{", "\n["]) {
    const index = text.lastIndexOf(marker);
    if (index >= 0) {
      const candidate = text.slice(index + 1).trim();
      try {
        return JSON.parse(candidate);
      } catch {
        // Keep searching other payload shapes before surfacing the malformed output.
      }
    }
  }
  throw new Error(`Feishu broadcast failed: malformed openclaw output: ${text.slice(-500)}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendFeishuMessage(message) {
  if (!SITE_CONFIG.feishuTarget) {
    throw new Error("FEISHU_TARGET is required for Feishu broadcast");
  }

  const args = [
    "message",
    "broadcast",
    "--channel",
    "feishu",
    "--account",
    SITE_CONFIG.feishuAccount,
    "--targets",
    SITE_CONFIG.feishuTarget,
    "--message",
    message,
    "--json",
  ];
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await runCommand(SITE_CONFIG.openclawBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...loadRuntimeEnv(),
        },
        timeoutMs: 45000,
      });
      assertBroadcastSucceeded(result.stdout);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(1500 * attempt);
      }
    }
  }
  throw lastError || new Error("Feishu broadcast failed after retries");
}

module.exports = {
  sendFeishuMessage,
};
