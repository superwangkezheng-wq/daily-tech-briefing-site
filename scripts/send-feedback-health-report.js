#!/usr/bin/env node

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { SITE_CONFIG } = require("../src/config");
const { appendOpsLog, readOpsStatus } = require("../src/ops-store");
const { sendFeishuMessage } = require("../src/feishu");

const HOME = process.env.HOME || os.homedir();
const APP_SUPPORT = path.join(HOME, "Library/Application Support/OpenClaw");
const OPENCLAW_HOME = process.env.OPENCLAW_HOME || path.join(HOME, ".openclaw");
const OPENCLAW_OPS = path.join(OPENCLAW_HOME, "ops");

const ASSET_SYNC_STATUS_FILE = process.env.ASSET_SYNC_STATUS_FILE || path.join(APP_SUPPORT, "AssetSync/latest-notify-status.json");
const ASSET_SYNC_PROBLEM_STATUS_FILE = process.env.ASSET_SYNC_PROBLEM_STATUS_FILE || path.join(APP_SUPPORT, "AssetSync/latest-problem-status.json");
const BUSINESS_SMOKE_STATUS_FILE = process.env.BUSINESS_SMOKE_STATUS_FILE || path.join(APP_SUPPORT, "BusinessSmoke/latest-status.json");
const PRODUCTION_GUARD_STATUS_FILE = process.env.PRODUCTION_GUARD_STATUS_FILE || path.join(APP_SUPPORT, "ProductionGuard/latest-status.json");
const FEEDBACK_HEALTH_STATUS_FILE = process.env.FEEDBACK_HEALTH_STATUS_FILE || path.join(APP_SUPPORT, "FeedbackHealthReport/latest-status.json");
const NATURAL_ACCEPTANCE_STATUS_FILE = process.env.NATURAL_ACCEPTANCE_STATUS_FILE || path.join(APP_SUPPORT, "NaturalRunAcceptance/latest-status.json");
const HEALTH_DASHBOARD_SCRIPT = process.env.HEALTH_DASHBOARD_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_health_dashboard.sh");
const SKILL_EVOLUTION_HEALTH_SCRIPT = process.env.SKILL_EVOLUTION_HEALTH_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_skill_evolution_health.py");
const ROUTE_VIOLATION_AUDIT_SCRIPT = process.env.ROUTE_VIOLATION_AUDIT_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_route_violation_audit.py");
const ACTION_CONTRACT_AUDIT_SCRIPT = process.env.ACTION_CONTRACT_AUDIT_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_action_contract_audit.py");
const STATUS_SCHEMA_AUDIT_SCRIPT = process.env.STATUS_SCHEMA_AUDIT_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_status_schema.py");
const NATURAL_ACCEPTANCE_SCRIPT = process.env.NATURAL_ACCEPTANCE_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_natural_run_acceptance.py");
const DOCTOR_NOISE_AUDIT_SCRIPT = process.env.DOCTOR_NOISE_AUDIT_SCRIPT || path.join(OPENCLAW_OPS, "openclaw_doctor_noise_audit.py");
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || "openclaw";
const QMD_BIN = process.env.QMD_BIN || "qmd";
const QMD_REFRESH_LABEL = `gui/${process.getuid()}/com.dailytech.qmd.refresh`;
const PROMPT_OPTIMIZER_PREVIEW_LABEL = `gui/${process.getuid()}/ai.promptoptimizer.preview`;
const PROMPT_OPTIMIZER_MCP_LABEL = `gui/${process.getuid()}/ai.promptoptimizer.mcp`;
const KNOWLEDGE_GUARD_LABEL = `gui/${process.getuid()}/com.lenovo.knowledge-system.guard`;
const KB_ALIAS_DIR = process.env.KB_ALIAS_DIR || path.join(HOME, ".daily-tech-site-wiki");
const QMD_TMP_DIR = process.env.QMD_TMP_DIR || path.join(os.tmpdir(), "qmd-status-tmp");
const QMD_REFRESH_LOG = process.env.QMD_REFRESH_LOG || path.join(HOME, "Library/Logs/daily-tech-site/qmd-refresh.out.log");
const QMD_EMBED_MODEL = "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";
const QMD_RERANK_MODEL = "hf:ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/qwen3-reranker-0.6b-q8_0.gguf";
const QMD_GENERATE_MODEL = "hf:tobil/qmd-query-expansion-1.7B-gguf/qmd-query-expansion-1.7B-q4_k_m.gguf";
const BUSINESS_SMOKE_MAX_AGE_HOURS = 36;
const PRODUCTION_GUARD_MAX_AGE_HOURS = 25;
const ASSET_SYNC_MAX_AGE_DAYS = 10;
const ASSET_SYNC_PROBLEM_MAX_AGE_DAYS = 7;
const DEFAULT_COMMAND_TIMEOUT_MS = 30000;
const DEFAULT_URL_TIMEOUT_MS = 10000;
const CRON_STATUS_MAX_RECENT_ERROR_HOURS = 36;
const EXPECTED_CRON_JOBS = {
  "每日 AI & ICT 资讯采集 (V10 上午版)": "40 9 * * *",
  "每日科技信息 网页反馈 & 系统健康回执 (10:15)": "15 10 * * *",
};

function parseArgs(argv) {
  const args = {
    digestExitCode: 0,
    dryRun: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === "--digest-exit-code") {
      const parsedExitCode = Number(argv[index + 1] || 0);
      args.digestExitCode = Number.isFinite(parsedExitCode) ? parsedExitCode : 0;
      index += 1;
    } else if (part === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

async function writeFeedbackHealthStatus(payload) {
  await fsp.mkdir(path.dirname(FEEDBACK_HEALTH_STATUS_FILE), { recursive: true });
  await fsp.writeFile(
    FEEDBACK_HEALTH_STATUS_FILE,
    `${JSON.stringify(
      {
        ...payload,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function refreshHealthDashboard() {
  if (!fs.existsSync(HEALTH_DASHBOARD_SCRIPT)) {
    return {
      ok: false,
      detail: `missing script: ${HEALTH_DASHBOARD_SCRIPT}`,
    };
  }

  try {
    const result = await runCommand("zsh", [HEALTH_DASHBOARD_SCRIPT], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      timeoutMs: 120000,
    });
    const summaryLine = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("Summary:"));
    return {
      ok: true,
      detail: summaryLine || "refreshed",
    };
  } catch (error) {
    return {
      ok: false,
      detail: error.message.replace(/\s+/g, " "),
    };
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS, ...spawnOptions } = options;
    const child = spawn(command, args, spawnOptions);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let killTimer = null;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
      callback(value);
    };
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            killTimer = setTimeout(() => child.kill("SIGKILL"), 3000);
          }, timeoutMs)
        : null;
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

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_URL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkGateway(profile) {
  const port = profile === "default" ? 18789 : 19161;
  return checkUrlStatus(`http://127.0.0.1:${port}/health`, [200], "\"ok\":true");
}

async function checkLaunchAgent(label) {
  try {
    const result = await runCommand("launchctl", ["print", label], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const output = result.stdout;
    const lastExitCodeMatch = output.match(/last exit code = (\d+)/);
    const stateMatch = output.match(/state = ([^\n]+)/);
    const runsMatch = output.match(/runs = (\d+)/);
    const lastExitCode = lastExitCodeMatch ? Number(lastExitCodeMatch[1]) : null;
    const state = stateMatch ? stateMatch[1].trim() : "--";
    const runs = runsMatch ? Number(runsMatch[1]) : null;
    return {
      ok: state === "running" || lastExitCode === 0,
      detail: `state=${state}${lastExitCode !== null ? ` lastExit=${lastExitCode}` : ""}${runs !== null ? ` runs=${runs}` : ""}`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error.message.replace(/\s+/g, " "),
    };
  }
}

function parseQmdStatusSummary(output) {
  const totalMatch = output.match(/Total:\s+(\d+)\s+files indexed/);
  const vectorsMatch = output.match(/Vectors:\s+(\d+)\s+embedded/);
  const pendingMatch = output.match(/Pending:\s+(\d+)\s+need embedding/);
  const updatedMatch = output.match(/Updated:\s+([^\n]+)/);
  const embedMatch = output.match(/Embedding:\s+([^\n]+)/);
  if (!totalMatch && !vectorsMatch && !pendingMatch) {
    return null;
  }
  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    vectors: vectorsMatch ? Number(vectorsMatch[1]) : null,
    pending: pendingMatch ? Number(pendingMatch[1]) : null,
    updated: updatedMatch ? updatedMatch[1].trim() : "--",
    embedModel: embedMatch ? embedMatch[1].trim() : "--",
  };
}

function parseJsonPayload(output) {
  const text = String(output || "").trim();
  if (!text) {
    throw new Error("empty JSON payload");
  }
  try {
    return JSON.parse(text);
  } catch {
    // OpenClaw CLI may print config warnings before the JSON object.
  }
  const objectIndex = text.lastIndexOf("\n{");
  const arrayIndex = text.lastIndexOf("\n[");
  const index = Math.max(objectIndex, arrayIndex);
  if (index >= 0) {
    return JSON.parse(text.slice(index + 1).trim());
  }
  throw new Error("no parseable JSON payload");
}

function formatQmdStatusDetail(summary, sourceLabel = "") {
  return `${summary.total ?? "--"} indexed / ${summary.vectors ?? "--"} embedded / ${summary.pending ?? "--"} pending / model ${summary.embedModel ?? "--"} / updated ${summary.updated}${sourceLabel ? ` / ${sourceLabel}` : ""}`;
}

async function loadQmdStatusFromLog() {
  try {
    const raw = await fsp.readFile(QMD_REFRESH_LOG, "utf8");
    const summary = parseQmdStatusSummary(raw);
    if (!summary) {
      return null;
    }
    return {
      ok: true,
      detail: formatQmdStatusDetail(summary, "from qmd-refresh.out.log"),
    };
  } catch {
    return null;
  }
}

async function checkQmdStatus() {
  try {
    await fsp.mkdir(QMD_TMP_DIR, { recursive: true });
    const result = await runCommand(QMD_BIN, ["status"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:${HOME}/.bun/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ""}`,
        TMPDIR: `${QMD_TMP_DIR}/`,
        BUN_INSTALL: `${process.env.HOME}/.bun`,
        QMD_COLLECTION_NAME: "lenovo-llm-wiki",
        QMD_EMBED_MODEL,
        QMD_RERANK_MODEL,
        QMD_GENERATE_MODEL,
      },
      cwd: KB_ALIAS_DIR,
      timeoutMs: 60000,
    });
    const summary = parseQmdStatusSummary(result.stdout);
    return {
      ok: true,
      detail: summary ? formatQmdStatusDetail(summary) : "status command succeeded",
    };
  } catch (error) {
    const fallback = await loadQmdStatusFromLog();
    if (fallback) {
      return fallback;
    }
    return {
      ok: false,
      detail: error.message.replace(/\s+/g, " "),
    };
  }
}

async function checkUrl(url, expect = null) {
  return checkUrlStatus(url, [200, 201, 202, 203, 204], expect);
}

async function checkUrlViaCurl(url, allowedStatuses = [200], expect = null) {
  const result = await runCommand(
    "/usr/bin/curl",
    ["-sS", "-L", "--connect-timeout", "5", "--max-time", "15", "-o", "-", "-w", "\n__STATUS__:%{http_code}", url],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      timeoutMs: 20000,
    },
  );
  const marker = "\n__STATUS__:";
  const markerIndex = result.stdout.lastIndexOf(marker);
  const body = markerIndex >= 0 ? result.stdout.slice(0, markerIndex) : result.stdout;
  const status = markerIndex >= 0 ? Number(result.stdout.slice(markerIndex + marker.length).trim()) : 0;
  const ok = allowedStatuses.includes(status) && (!expect || body.includes(expect));
  return {
    ok,
    detail: `${status}${ok ? "" : ` / ${body.slice(0, 80).replace(/\s+/g, " ")}`}`,
  };
}

async function checkUrlStatus(url, allowedStatuses = [200], expect = null) {
  try {
    const response = await fetchWithTimeout(url, { redirect: "follow" });
    const text = await response.text();
    const ok = allowedStatuses.includes(response.status) && (!expect || text.includes(expect));
    return {
      ok,
      detail: `${response.status}${ok ? "" : ` / ${text.slice(0, 80).replace(/\s+/g, " ")}`}`,
    };
  } catch (error) {
    try {
      return await checkUrlViaCurl(url, allowedStatuses, expect);
    } catch (curlError) {
      return {
        ok: false,
        detail: `fetch: ${error.message}; curl: ${curlError.message}`,
      };
    }
  }
}

async function loadOpsStatus(dryRun) {
  if (!dryRun) {
    return readOpsStatus();
  }
  if (!fs.existsSync(SITE_CONFIG.opsStatusFile)) {
    return {};
  }
  return JSON.parse(await fsp.readFile(SITE_CONFIG.opsStatusFile, "utf8"));
}

function statusLine(label, result) {
  return `- ${label}：${result.ok ? "OK" : "FAIL"}${result.detail ? `（${result.detail}）` : ""}`;
}

function digestHeadline(digest, digestExitCode) {
  const runState = digestExitCode === 0 ? "成功" : `失败（exit ${digestExitCode}）`;
  const delivery =
    digest.lastDeliveryMode === "embedded"
      ? "已并入本条回执"
      : digest.lastPushed
        ? "独立飞书推送成功"
        : "未单独推送";
  return [
    `- digest 进程：${runState}`,
    `- 反馈日期：${digest.lastRunDate || "--"}`,
    `- 结果：${digest.lastResult || "--"}`,
    `- 反馈数 / 观点簇：${digest.lastFeedbackCount ?? "--"} / ${digest.lastClusterCount ?? "--"}`,
    `- 交付方式：${delivery}`,
    ...(digest.lastSummaryPreview ? [`- 反馈摘要：${digest.lastSummaryPreview}`] : []),
    `- 文档：${digest.lastDigestPath || "--"}`,
  ];
}

function refreshHeadline(refresh, site) {
  return [
    `- 固定入口：${site.fixedUrl || "--"}`,
    `- 最近检查：${refresh.lastCheckedDate || "--"} ${refresh.lastCheckedSlot || "--"} / ${refresh.lastResult || "--"}`,
    `- 最近成功快照：${refresh.lastSuccessSnapshot?.displayTitle || "--"}`,
    `- 最近失败原因：${refresh.lastFailureReason || "无"}`,
  ];
}

async function loadAssetSyncStatus() {
  try {
    const raw = await fsp.readFile(ASSET_SYNC_STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadAssetSyncProblemStatus() {
  try {
    const raw = await fsp.readFile(ASSET_SYNC_PROBLEM_STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadBusinessSmokeStatus() {
  try {
    const raw = await fsp.readFile(BUSINESS_SMOKE_STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadProductionGuardStatus() {
  try {
    const raw = await fsp.readFile(PRODUCTION_GUARD_STATUS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function loadCurrentOpenClawVersion() {
  try {
    const result = await runCommand(OPENCLAW_BIN, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      timeoutMs: 15000,
    });
    const lines = String(result.stdout || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.at(-1) || null;
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hoursSince(timestamp) {
  const parsed = parseTimestamp(timestamp);
  if (!parsed) {
    return null;
  }
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60);
}

function daysSince(timestamp) {
  const parsed = parseTimestamp(timestamp);
  if (!parsed) {
    return null;
  }
  return (Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24);
}

function assetSyncHeadline(status, problemStatus, currentVersion) {
  if (!status) {
    return [
      `- 当前已安装版本：${currentVersion || "--"}`,
      "- 最近自动统一升级回执：无正式状态记录（尚未产生首个正式周更回执）",
      `- 状态文件：${ASSET_SYNC_STATUS_FILE}`,
    ];
  }

  const ageDays = daysSince(status.finishedAt || status.startedAt);
  const freshness =
    ageDays === null
      ? "时间未知"
      : ageDays <= ASSET_SYNC_MAX_AGE_DAYS
        ? `OK（${ageDays.toFixed(1)} 天前）`
        : `STALE（${ageDays.toFixed(1)} 天前）`;

  const lines = [
    `- 当前已安装版本：${currentVersion || status.versionAfter || "--"}`,
    `- 最近自动统一升级回执：${status.finishedAt || status.startedAt || "--"}`,
    `- 结果：${status.result || "--"}`,
    `- 新鲜度：${freshness}`,
    `- 自动升级前 / 后版本：${status.versionBefore || "--"} -> ${status.versionAfter || "--"}`,
    `- 耗时：${status.duration || "--"}`,
    `- 摘要：${status.summaryPath || "--"}`,
    `- 日志：${status.logPath || "--"}`,
  ];
  if (status.skipSync) {
    lines.push("- 执行类型：状态刷新（未执行资产同步）");
  }
  if (currentVersion && status.versionAfter && currentVersion !== status.versionAfter) {
    lines.push("- 说明：当前版本与最近自动统一升级回执不同，说明此后还发生过手动升级或额外升级。");
  }
  if (status.notifyOk !== undefined && status.notifyOk !== null) {
    lines.push(`- 通知状态：${status.notifyOk ? "OK" : "FAIL"}${status.notifyDetail ? `（${status.notifyDetail}）` : ""}`);
  }
  if (status.summaryExcerpt) {
    const excerpt = String(status.summaryExcerpt).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
    if (excerpt.length > 0) {
      lines.push(`- 关键结果：${excerpt.join(" | ")}`);
    }
  }
  if (problemStatus) {
    const problemAt = problemStatus.finishedAt || problemStatus.startedAt || "";
    const currentAt = status.finishedAt || status.startedAt || "";
    const problemAgeDays = daysSince(problemAt);
    const problemParsed = parseTimestamp(problemAt);
    const currentParsed = parseTimestamp(currentAt);
    const currentSupersedesProblem =
      problemParsed &&
      currentParsed &&
      currentParsed > problemParsed &&
      ["成功", "跳过执行（测试模式）"].includes(status.result || "") &&
      status.notifyOk !== false;
    if (problemAt && problemAt !== currentAt && problemAgeDays !== null && problemAgeDays <= ASSET_SYNC_PROBLEM_MAX_AGE_DAYS) {
      const label = currentSupersedesProblem ? "历史异常（已被当前成功回执覆盖）" : "最近异常";
      lines.push(`- ${label}：${problemAt} / ${problemStatus.result || "--"} / 通知=${problemStatus.notifyOk === false ? "FAIL" : "未知"}`);
      if (problemStatus.logPath) {
        lines.push(`- 异常日志：${problemStatus.logPath}`);
      }
    }
  }
  return lines;
}

function businessSmokeHeadline(status) {
  if (!status) {
    return [
      "- 最近业务巡检：无正式状态记录",
      `- 状态文件：${BUSINESS_SMOKE_STATUS_FILE}`,
    ];
  }

  const ageHours = hoursSince(status.finishedAt || status.startedAt);
  const freshness =
    ageHours === null
      ? "时间未知"
      : ageHours <= BUSINESS_SMOKE_MAX_AGE_HOURS
        ? `OK（${ageHours.toFixed(1)} 小时前）`
        : `STALE（${ageHours.toFixed(1)} 小时前）`;

  const lines = [
    `- 最近业务巡检：${status.finishedAt || status.startedAt || "--"}`,
    `- 结果：${status.result || "--"}`,
    `- 新鲜度：${freshness}`,
    `- 耗时：${status.duration || "--"}`,
    `- 版本：${status.version || "--"}`,
    `- 日志：${status.logPath || "--"}`,
  ];
  if (status.excerpt) {
    const excerpt = String(status.excerpt).split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 4);
    if (excerpt.length > 0) {
      lines.push(`- 关键结果：${excerpt.join(" | ")}`);
    }
  }
  return lines;
}

function productionGuardHeadline(status) {
  if (!status) {
    return [
      "- 最近生产哨兵：无正式状态记录",
      `- 状态文件：${PRODUCTION_GUARD_STATUS_FILE}`,
    ];
  }

  const ageHours = hoursSince(status.finishedAt || status.startedAt);
  const freshness =
    ageHours === null
      ? "时间未知"
      : ageHours <= PRODUCTION_GUARD_MAX_AGE_HOURS
        ? `OK（${ageHours.toFixed(1)} 小时前）`
        : `STALE（${ageHours.toFixed(1)} 小时前）`;
  const failedChecks = Array.isArray(status.checks)
    ? status.checks.filter((item) => item && item.ok === false).slice(0, 4)
    : [];

  const lines = [
    `- 最近生产哨兵：${status.finishedAt || status.startedAt || "--"}`,
    `- 结果：${status.result || "--"}`,
    `- 新鲜度：${freshness}`,
    `- 错误 / 警告：${status.errors ?? "--"} / ${status.warnings ?? "--"}`,
    `- 修复模式：${status.repair ? "开启" : "关闭"}`,
    `- 日志：${status.logPath || "--"}`,
  ];
  if (failedChecks.length > 0) {
    const label = Number(status.errors || 0) > 0 ? "异常项" : "提示项";
    lines.push(`- ${label}：${failedChecks.map((item) => `${item.name}:${item.detail}`).join(" | ")}`);
  }
  return lines;
}

async function loadCronJobAudit() {
  try {
    const result = await runCommand(OPENCLAW_BIN, ["cron", "list", "--json"], {
      timeoutMs: 45000,
      env: process.env,
    });
    const payload = parseJsonPayload(result.stdout);
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    const byName = new Map(jobs.map((job) => [job.name, job]));
    const missing = [];
    const disabled = [];
    const scheduleDrift = [];
    const recentErrors = [];
    const running = [];
    const now = Date.now();
    for (const [name, expr] of Object.entries(EXPECTED_CRON_JOBS)) {
      const job = byName.get(name);
      if (!job) {
        missing.push(name);
        continue;
      }
      if (!job.enabled) {
        disabled.push(name);
      }
      if (job.schedule?.expr !== expr || job.schedule?.tz !== "Asia/Shanghai") {
        scheduleDrift.push(`${name}:${job.schedule?.expr || "--"} ${job.schedule?.tz || "--"}`);
      }
    }
    for (const job of jobs) {
      if (!job || !job.enabled) {
        continue;
      }
      if (job.status === "running") {
        running.push(job.name);
        continue;
      }
      const status = job.state?.lastRunStatus || job.status;
      if (!["error", "failed", "timed_out", "cancelled"].includes(status)) {
        continue;
      }
      const lastRunAt = Number(job.state?.lastRunAtMs || 0);
      const ageHours = lastRunAt > 0 ? (now - lastRunAt) / (1000 * 60 * 60) : null;
      if (ageHours === null || ageHours <= CRON_STATUS_MAX_RECENT_ERROR_HOURS) {
        recentErrors.push(`${job.name}:${status}:${job.state?.lastError || "--"}`);
      }
    }
    const structuralOk = missing.length === 0 && disabled.length === 0 && scheduleDrift.length === 0;
    return {
      ok: structuralOk,
      status: structuralOk ? (recentErrors.length > 0 ? "warn" : "ok") : "fail",
      total: jobs.length,
      missing,
      disabled,
      scheduleDrift,
      running,
      recentErrors,
    };
  } catch (error) {
    return {
      ok: false,
      total: 0,
      missing: [],
      disabled: [],
      scheduleDrift: [],
      running: [],
      recentErrors: [`cron audit failed: ${error.message}`],
    };
  }
}

function cronJobAuditHeadline(audit) {
  if (!audit) {
    return ["- 状态：NO-STATE"];
  }
  const status = audit.status || (audit.ok ? "ok" : "fail");
  const lines = [
    `- 状态：${status.toUpperCase()}`,
    `- 作业数：${audit.total ?? "--"}`,
  ];
  if (audit.running?.length) {
    lines.push(`- 正在运行：${audit.running.join(" | ")}`);
  }
  if (audit.missing?.length) {
    lines.push(`- 缺失：${audit.missing.join(" | ")}`);
  }
  if (audit.disabled?.length) {
    lines.push(`- 禁用：${audit.disabled.join(" | ")}`);
  }
  if (audit.scheduleDrift?.length) {
    lines.push(`- 调度漂移：${audit.scheduleDrift.join(" | ")}`);
  }
  if (audit.recentErrors?.length) {
    lines.push(`- 最近失败：${audit.recentErrors.join(" | ")}`);
  }
  return lines;
}

async function loadSkillEvolutionHealth() {
  try {
    const result = await runCommand("/usr/bin/python3", [SKILL_EVOLUTION_HEALTH_SCRIPT, "--json"], {
      timeoutMs: 20000,
    });
    const start = result.stdout.indexOf("{");
    if (start < 0) {
      throw new Error("skill evolution health did not return JSON");
    }
    return JSON.parse(result.stdout.slice(start));
  } catch (error) {
    return {
      status: "fail",
      checkedAt: new Date().toISOString(),
      profiles: [],
      warnings: [],
      failures: [`health probe failed: ${error.message}`],
    };
  }
}

async function loadRouteViolationAudit() {
  try {
    return await runJsonAudit(ROUTE_VIOLATION_AUDIT_SCRIPT, 30000);
  } catch (error) {
    return {
      status: "fail",
      errors: 1,
      warnings: 0,
      findings: [{ code: "route-audit-failed", detail: error.message }],
    };
  }
}

async function loadActionContractAudit() {
  try {
    return await runJsonAudit(ACTION_CONTRACT_AUDIT_SCRIPT, 60000);
  } catch (error) {
    return {
      result: "fail",
      errors: 1,
      warnings: 0,
      contracts: [],
      findings: [{ detail: error.message }],
    };
  }
}

function skillEvolutionHeadline(report) {
  if (!report) {
    return ["- 状态：NO-STATE"];
  }
  const lines = [
    `- 状态：${report.status || "--"}`,
    `- 检查时间：${report.checkedAt || "--"}`,
    `- 后台驱动：${report.launchAgent?.loaded ? "OK" : "FAIL"}（${report.launchAgent?.label || "--"}）`,
  ];
  for (const profile of report.profiles || []) {
    const age =
      typeof profile.lastRunAgeHours === "number" ? `${profile.lastRunAgeHours.toFixed(1)} 小时前` : "时间未知";
    lines.push(
      `- ${profile.profile}：候选 ${profile.candidateCount ?? "--"}，正式 ${profile.promotedCount ?? "--"}，最近运行 ${age}，结果 ${profile.lastResult || "--"}`,
    );
  }
  const notices = Array.isArray(report.recentNotices) ? report.recentNotices.slice(-3) : [];
  if (notices.length > 0) {
    lines.push(`- 最近动作：${notices.join(" | ")}`);
  }
  const warnings = Array.isArray(report.warnings) ? report.warnings.slice(0, 3) : [];
  const failures = Array.isArray(report.failures) ? report.failures.slice(0, 3) : [];
  if (warnings.length > 0) {
    lines.push(`- 提示：${warnings.join(" | ")}`);
  }
  if (failures.length > 0) {
    lines.push(`- 异常：${failures.join(" | ")}`);
  }
  return lines;
}

function routeViolationHeadline(report) {
  if (!report) {
    return ["- 状态：NO-STATE"];
  }
  const lines = [
    `- 状态：${report.status || "--"}`,
    `- 扫描会话：${report.scannedSessions ?? "--"}`,
    `- 错误 / 历史豁免：${report.errors ?? "--"} / ${report.warnings ?? "--"}`,
  ];
  const activeFindings = Array.isArray(report.findings)
    ? report.findings.filter((item) => item && item.waived !== true).slice(0, 3)
    : [];
  if (activeFindings.length > 0) {
    lines.push(`- 关注项：${activeFindings.map((item) => `${item.code}:${item.detail}`).join(" | ")}`);
  }
  return lines;
}

function actionContractHeadline(report) {
  if (!report) {
    return ["- 状态：NO-STATE"];
  }
  const contractCount = Array.isArray(report.contracts) ? report.contracts.length : 0;
  const actionCounts = Array.isArray(report.contracts)
    ? report.contracts.map((item) => item.actions ?? "--").join(" / ")
    : "--";
  const replayCounts = Array.isArray(report.contracts)
    ? report.contracts.map((item) => item.replayedCases ?? "--").join(" / ")
    : "--";
  const lines = [
    `- 状态：${report.result || "--"}`,
    `- 契约文件 / 动作数：${contractCount} / ${actionCounts}`,
    `- 错误 / 警告 / 回放：${report.errors ?? "--"} / ${report.warnings ?? "--"} / ${replayCounts}`,
  ];
  const activeFindings = Array.isArray(report.findings)
    ? report.findings.filter((item) => item && item.severity !== "ok").slice(0, 3)
    : [];
  if (activeFindings.length > 0) {
    lines.push(`- 关注项：${activeFindings.map((item) => item.detail).join(" | ")}`);
  }
  return lines;
}

async function runJsonAudit(script, timeoutMs = 25000) {
  const result = await runCommand("/usr/bin/python3", [script, "--json"], {
    timeoutMs,
    env: process.env,
  });
  const start = result.stdout.indexOf("{");
  if (start < 0) {
    throw new Error(`${script} did not return JSON`);
  }
  return JSON.parse(result.stdout.slice(start));
}

async function loadStatusSchemaAudit() {
  try {
    return await runJsonAudit(STATUS_SCHEMA_AUDIT_SCRIPT, 20000);
  } catch (error) {
    return {
      result: "fail",
      errors: 1,
      warnings: 0,
      checks: [{ name: "status schema audit", ok: false, detail: error.message }],
    };
  }
}

async function loadNaturalAcceptance() {
  try {
    return await runJsonAudit(NATURAL_ACCEPTANCE_SCRIPT, 20000);
  } catch (error) {
    try {
      const raw = await fsp.readFile(NATURAL_ACCEPTANCE_STATUS_FILE, "utf8");
      return JSON.parse(raw);
    } catch {
      return {
        result: "fail",
        errors: 1,
        warnings: 0,
        checks: [{ name: "natural run acceptance", ok: false, detail: error.message }],
      };
    }
  }
}

async function loadDoctorNoiseAudit() {
  try {
    return await runJsonAudit(DOCTOR_NOISE_AUDIT_SCRIPT, 120000);
  } catch (error) {
    return {
      result: "fail",
      blockers: 1,
      knownNoise: 0,
      profiles: [{ profile: "unknown", blockers: [error.message], knownNoise: [] }],
    };
  }
}

function compactAuditHeadline(report, label, maxChecks = 4) {
  if (!report) {
    return [`- ${label}：NO-STATE`];
  }
  const lines = [
    `- ${label}：${report.result || report.status || "--"}（错误 ${report.errors ?? report.blockers ?? 0} / 警告 ${report.warnings ?? 0}）`,
  ];
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const badChecks = checks.filter((item) => item && item.ok === false).slice(0, maxChecks);
  if (badChecks.length > 0) {
    lines.push(`- 关注项：${badChecks.map((item) => `${item.name}:${item.detail}`).join(" | ")}`);
  }
  return lines;
}

function doctorNoiseHeadline(report) {
  if (!report) {
    return ["- 状态：NO-STATE"];
  }
  const lines = [
    `- 状态：${report.result || "--"}`,
    `- 阻塞项 / 已分层噪音：${report.blockers ?? "--"} / ${report.knownNoise ?? "--"}`,
  ];
  const profiles = Array.isArray(report.profiles) ? report.profiles : [];
  for (const profile of profiles) {
    if (Array.isArray(profile.blockers) && profile.blockers.length > 0) {
      lines.push(`- ${profile.profile} 阻塞：${profile.blockers.slice(0, 3).join(" | ")}`);
    }
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv);
  const ops = await loadOpsStatus(args.dryRun);
  const digest = ops.digest || {};
  const refresh = ops.refresh || {};
  const site = ops.site || {};
  const assetSync = await loadAssetSyncStatus();
  const assetSyncProblem = await loadAssetSyncProblemStatus();
  const businessSmoke = await loadBusinessSmokeStatus();
  const productionGuard = await loadProductionGuardStatus();
  const currentOpenClawVersion = await loadCurrentOpenClawVersion();
  const skillEvolution = await loadSkillEvolutionHealth();
  const routeViolation = await loadRouteViolationAudit();
  const actionContracts = await loadActionContractAudit();
  const cronJobAudit = await loadCronJobAudit();
  const [statusSchema, naturalAcceptance, doctorNoise] = await Promise.all([
    loadStatusSchemaAudit(),
    loadNaturalAcceptance(),
    loadDoctorNoiseAudit(),
  ]);

  const [
    defaultGateway,
    workGateway,
    summarize,
    embedding,
    mineru,
    ragflow,
    qmdRefreshAgent,
    qmdIndex,
    promptOptimizerPreviewAgent,
    promptOptimizerMcpAgent,
    promptOptimizerPreviewHttp,
    promptOptimizerMcpHttp,
    knowledgeGuard,
  ] = await Promise.all([
    checkGateway("default"),
    checkGateway("work"),
    checkUrl("http://127.0.0.1:1238/health", "\"status\":\"ok\""),
    checkUrl("http://127.0.0.1:1235/health", "\"status\":\"ok\""),
    checkUrl("http://127.0.0.1:38886/openapi.json", "\"openapi\""),
    checkUrl("http://127.0.0.1:18080/healthz"),
    checkLaunchAgent(QMD_REFRESH_LABEL),
    checkQmdStatus(),
    checkLaunchAgent(PROMPT_OPTIMIZER_PREVIEW_LABEL),
    checkLaunchAgent(PROMPT_OPTIMIZER_MCP_LABEL),
    checkUrl("http://127.0.0.1:18182/"),
    checkUrlStatus("http://127.0.0.1:18183/mcp", [400]),
    checkLaunchAgent(KNOWLEDGE_GUARD_LABEL),
  ]);

  const message = [
    "每日科技信息 10:15 网页反馈 & 系统健康回执",
    "",
    "【网页反馈】",
    ...digestHeadline(digest, args.digestExitCode),
    "",
    "【网页与刷新】",
    ...refreshHeadline(refresh, site),
    "",
    "【系统健康】",
    statusLine("default gateway", defaultGateway),
    statusLine("work gateway", workGateway),
    statusLine("summarize(1238)", summarize),
    statusLine("embedding(1235)", embedding),
    statusLine("MinerU(38886)", mineru),
    statusLine("RAGFlow(18080)", ragflow),
    "",
    "【优化与知识守护】",
    statusLine("prompt optimizer preview", promptOptimizerPreviewAgent),
    statusLine("prompt optimizer preview http", promptOptimizerPreviewHttp),
    statusLine("prompt optimizer mcp", promptOptimizerMcpAgent),
    statusLine("prompt optimizer mcp http", promptOptimizerMcpHttp),
    statusLine("knowledge-system.guard", knowledgeGuard),
    "",
    "【技能自进化】",
    ...skillEvolutionHeadline(skillEvolution),
    "",
    "【执行路由门禁】",
    ...routeViolationHeadline(routeViolation),
    "",
    "【动作契约门禁】",
    ...actionContractHeadline(actionContracts),
    "",
    "【自然运行验收】",
    ...compactAuditHeadline(naturalAcceptance, "自然运行闭环"),
    "",
    "【状态口径】",
    ...compactAuditHeadline(statusSchema, "状态文件 schema"),
    "",
    "【Doctor噪音分层】",
    ...doctorNoiseHeadline(doctorNoise),
    "",
    "【业务巡检】",
    ...productionGuardHeadline(productionGuard),
    "",
    ...businessSmokeHeadline(businessSmoke),
    "",
    "【定时任务】",
    ...cronJobAuditHeadline(cronJobAudit),
    "",
    "【QMD知识库刷新】",
    statusLine("qmd refresh launchd", qmdRefreshAgent),
    statusLine("qmd index", qmdIndex),
    "",
    "【统一升级】",
    ...assetSyncHeadline(assetSync, assetSyncProblem, currentOpenClawVersion),
  ].join("\n");

  if (args.dryRun) {
    console.log(message);
    return;
  }

  await appendOpsLog("run", "10:15 网页反馈与系统健康回执", [
    `digestExitCode：${args.digestExitCode}`,
    `default gateway：${defaultGateway.ok ? "OK" : "FAIL"}`,
    `work gateway：${workGateway.ok ? "OK" : "FAIL"}`,
    `summarize：${summarize.ok ? "OK" : "FAIL"}`,
    `embedding：${embedding.ok ? "OK" : "FAIL"}`,
    `MinerU：${mineru.ok ? "OK" : "FAIL"}`,
    `RAGFlow：${ragflow.ok ? "OK" : "FAIL"}`,
    `prompt optimizer preview：${promptOptimizerPreviewAgent.ok && promptOptimizerPreviewHttp.ok ? "OK" : "FAIL"}`,
    `prompt optimizer mcp：${promptOptimizerMcpAgent.ok && promptOptimizerMcpHttp.ok ? "OK" : "FAIL"}`,
    `knowledge-system.guard：${knowledgeGuard.ok ? "OK" : "FAIL"}`,
    `skill evolution：${skillEvolution?.status || "NO-STATE"}`,
    `route violation audit：${routeViolation?.status || "NO-STATE"}`,
    `action contracts：${actionContracts?.result || "NO-STATE"}`,
    `natural acceptance：${naturalAcceptance?.result || "NO-STATE"}`,
    `status schema：${statusSchema?.result || "NO-STATE"}`,
    `doctor noise：${doctorNoise?.result || "NO-STATE"}`,
    `production guard：${productionGuard?.result || "NO-STATE"}`,
    `business smoke：${businessSmoke?.result || "NO-STATE"}`,
    `cron jobs：${(cronJobAudit?.status || (cronJobAudit?.ok ? "ok" : "fail")).toUpperCase()}`,
    `qmd refresh launchd：${qmdRefreshAgent.ok ? "OK" : "FAIL"}`,
    `qmd index：${qmdIndex.ok ? "OK" : "FAIL"}`,
    `asset sync：${assetSync?.result || "NO-STATE"}`,
  ]);

  await sendFeishuMessage(message);
  try {
    await writeFeedbackHealthStatus({
      result: "ok",
      detail: "health receipt sent",
      digestExitCode: args.digestExitCode,
      pushedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`failed to write feedback health status: ${error.message}`);
  }
  const dashboardRefresh = await refreshHealthDashboard();
  if (!dashboardRefresh.ok) {
    console.warn(`health dashboard refresh failed: ${dashboardRefresh.detail}`);
  } else {
    console.log(`health dashboard refresh: ${dashboardRefresh.detail}`);
  }
  console.log(message);
}

main().catch(async (error) => {
  try {
    await appendOpsLog("alert", "10:15 网页反馈与系统健康回执失败", [`错误：${error.message}`]);
  } catch {
    // ignore secondary logging failures
  }
  try {
    await writeFeedbackHealthStatus({
      result: "fail",
      detail: error.message,
      failedAt: new Date().toISOString(),
    });
  } catch {
    // ignore secondary status write failures
  }
  const dashboardRefresh = await refreshHealthDashboard();
  if (!dashboardRefresh.ok) {
    console.warn(`health dashboard refresh failed: ${dashboardRefresh.detail}`);
  } else {
    console.log(`health dashboard refresh: ${dashboardRefresh.detail}`);
  }
  console.error(error);
  process.exit(1);
});
