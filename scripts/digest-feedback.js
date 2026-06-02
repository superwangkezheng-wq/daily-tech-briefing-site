const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { SITE_CONFIG } = require("../src/config");
const { appendOpsLog, updateOpsStatus } = require("../src/ops-store");
const { sendFeishuMessage } = require("../src/feishu");

function parseArgs(argv) {
  const args = {
    targetDate: null,
    noPush: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === "--no-push") {
      args.noPush = true;
    } else if (!part.startsWith("--") && !args.targetDate) {
      args.targetDate = part;
    }
  }
  return args;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getTargetDate(args) {
  if (args.targetDate) {
    return args.targetDate;
  }
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  let body = raw;
  if (match) {
    body = raw.slice(match[0].length);
    for (const line of match[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      meta[key] = value.replace(/^"|"$/g, "");
    }
  }
  return { meta, body: body.trim() };
}

async function loadFeedbackEntries(targetDate) {
  const bucket = path.join(SITE_CONFIG.feedbackDir, targetDate);
  if (!fs.existsSync(bucket)) {
    return [];
  }

  const files = (await fsp.readdir(bucket))
    .filter((name) => name.endsWith(".md"))
    .sort();

  const entries = [];
  for (const name of files) {
    const fullPath = path.join(bucket, name);
    const raw = await fsp.readFile(fullPath, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    entries.push({
      filePath: fullPath,
      content: body.replace(/^#\s+一键反馈\s*/m, "").trim(),
      visitorName: meta.visitor_name || "匿名访客",
      contact: meta.contact || "",
      fingerprint: meta.fingerprint || "",
      createdAt: meta.created_at || "",
      reportDate: meta.report_date || "",
      reportTitle: meta.report_title || "",
      snapshotId: meta.snapshot_id || "",
    });
  }
  return entries;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function bigrams(text) {
  const cleaned = normalizeText(text);
  const parts = [];
  for (let index = 0; index < cleaned.length - 1; index += 1) {
    parts.push(cleaned.slice(index, index + 2));
  }
  return new Set(parts);
}

function similarityScore(a, b) {
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  return intersection / Math.max(setA.size, setB.size);
}

function clusterFeedback(entries) {
  const groups = [];
  for (const entry of entries) {
    const normalized = normalizeText(entry.content);
    let matched = null;
    for (const group of groups) {
      if (
        group.normalized === normalized ||
        similarityScore(group.representative.content, entry.content) >= 0.4
      ) {
        matched = group;
        break;
      }
    }
    if (matched) {
      matched.items.push(entry);
      matched.count += 1;
    } else {
      groups.push({
        normalized,
        count: 1,
        representative: entry,
        items: [entry],
      });
    }
  }
  return groups.sort((a, b) => b.count - a.count);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(stderr || `Command failed: ${command} ${args.join(" ")}`));
      }
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

async function buildModelSuggestions(targetDate, clusters, entries) {
  if (!process.env.SUMMARIZE_WRAPPER) {
    throw new Error("SUMMARIZE_WRAPPER is not configured");
  }

  const promptPayload = [
    "你是“每日科技信息站”的产品改进分析助手。",
    "任务：把下面这些网页用户反馈整理成可执行的“核心修改建议”。",
    "要求：",
    "1. 输出 3-5 条核心修改建议，每条必须是明确的修改动作，不要泛泛总结。",
    "2. 再输出 2 条可延后建议。",
    "3. 最后输出 1 条“今日最优先处理的问题”。",
    "4. 全部用中文，偏产品、信息架构、交互、内容呈现，不要解释你的方法。",
    "",
    `反馈日期：${targetDate}`,
    `原始反馈数：${entries.length}`,
    `去重后观点簇数：${clusters.length}`,
    "",
    JSON.stringify(
      clusters.map((cluster) => ({
        count: cluster.count,
        representative: cluster.representative.content,
        visitors: [...new Set(cluster.items.map((item) => item.visitorName))],
        snapshotIds: [...new Set(cluster.items.map((item) => item.snapshotId).filter(Boolean))],
      })),
      null,
      2,
    ),
  ].join("\n");

  const result = await runCommand(
    "zsh",
    [process.env.SUMMARIZE_WRAPPER, "-", "--length", "xl", "--max-output-tokens", "1400"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        OPENCLAW_SUMMARY_PROMPT_MODE: "passthrough",
        OPENCLAW_SUMMARY_RAW: "1",
      },
      input: promptPayload,
    },
  );

  return result.stdout.trim();
}

function buildFallbackSuggestions(targetDate, clusters, entries) {
  const topClusters = clusters.slice(0, 5);
  const core = topClusters.slice(0, 3).map((cluster, index) => {
    return `${index + 1}. 修改建议：围绕“${cluster.representative.content.slice(0, 36)}”这一高频反馈做优先改造，当前共有 ${cluster.count} 条相似意见。`;
  });
  const delayed = topClusters.slice(3, 5).map((cluster, index) => {
    return `${index + 1}. 可延后建议：继续观察“${cluster.representative.content.slice(0, 36)}”是否会在更多反馈中重复出现。`;
  });
  const priority = topClusters[0]
    ? `今日最优先处理的问题：${topClusters[0].representative.content}`
    : "今日最优先处理的问题：暂无。";

  return [
    `# 网站修改建议 (${targetDate})`,
    "",
    `- 原始反馈数：${entries.length}`,
    `- 去重后观点簇：${clusters.length}`,
    "",
    "## 核心修改建议",
    ...core,
    "",
    "## 可延后建议",
    ...(delayed.length ? delayed : ["1. 暂无额外延后建议。"]),
    "",
    "## 今日最优先处理的问题",
    priority,
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const targetDate = getTargetDate(args);
  const entries = await loadFeedbackEntries(targetDate);
  await fsp.mkdir(SITE_CONFIG.feedbackDigestDir, { recursive: true });

  if (!entries.length) {
    const digestPath = path.join(SITE_CONFIG.feedbackDigestDir, `${targetDate}-修改建议汇总.md`);
    const persisted = [
      `# 每日科技信息站修改建议汇总 (${targetDate})`,
      "",
      "## 结果",
      "昨日无反馈。",
      "",
      "## 执行统计",
      "- 原始反馈：0",
      "- 去重后观点簇：0",
      "- 生成方式：空结果回执",
      "",
    ].join("\n");
    await fsp.writeFile(digestPath, persisted, "utf8");

    let pushOk = false;
    const deliveryMode = args.noPush ? "embedded" : "feishu";
    if (!args.noPush) {
      try {
        await sendFeishuMessage(`网站修改建议汇总（${targetDate}）\n\n昨日无反馈。\n\n完整文档：${digestPath}`);
        pushOk = true;
      } catch (error) {
        await appendOpsLog("alert", "无反馈回执飞书推送失败", [`日期：${targetDate}`, `错误：${error.message}`]);
      }
    }

    await updateOpsStatus({
      digest: {
        lastRunAt: new Date().toISOString(),
        lastRunDate: targetDate,
        lastResult: args.noPush ? "empty_embedded" : pushOk ? "empty" : "empty_saved_only",
        lastDigestPath: digestPath,
        lastFeedbackCount: 0,
        lastClusterCount: 0,
        lastPushed: pushOk,
        lastDeliveryMode: deliveryMode,
        lastSummaryPreview: "昨日无反馈。",
      },
    });

    await appendOpsLog("run", "修改建议 digest 完成（无反馈）", [
      `日期：${targetDate}`,
      `交付方式：${args.noPush ? "并入 10:15 回执" : pushOk ? "飞书推送成功" : "仅落盘未推送"}`,
      `文档：${digestPath}`,
    ]);

    console.log(JSON.stringify({ digestPath, pushOk, empty: true, noPush: args.noPush }, null, 2));
    return;
  }

  const clusters = clusterFeedback(entries);
  let suggestionBody;
  let usedModel = true;

  try {
    suggestionBody = await buildModelSuggestions(targetDate, clusters, entries);
  } catch (error) {
    usedModel = false;
    suggestionBody = buildFallbackSuggestions(targetDate, clusters, entries);
  }

  const digestPath = path.join(SITE_CONFIG.feedbackDigestDir, `${targetDate}-修改建议汇总.md`);
  const persisted = [
    `# 每日科技信息站修改建议汇总 (${targetDate})`,
    "",
    suggestionBody,
    "",
    "## 执行统计",
    `- 原始反馈：${entries.length}`,
    `- 去重后观点簇：${clusters.length}`,
    `- 生成方式：${usedModel ? "模型提炼" : "规则回退"}`,
    "",
  ].join("\n");
  await fsp.writeFile(digestPath, persisted, "utf8");

  const outboundMessage = [
    `网站修改建议汇总（${targetDate}）`,
    "",
    suggestionBody.slice(0, 1500),
    "",
    `完整文档：${digestPath}`,
  ].join("\n");

  let pushOk = false;
  const deliveryMode = args.noPush ? "embedded" : "feishu";
  if (!args.noPush) {
    try {
      await sendFeishuMessage(outboundMessage);
      pushOk = true;
    } catch (error) {
      await appendOpsLog("alert", "修改建议飞书推送失败", [`日期：${targetDate}`, `错误：${error.message}`]);
    }
  }

  const summaryPreview = suggestionBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .slice(0, 3)
    .join(" | ");

  await updateOpsStatus({
    digest: {
      lastRunAt: new Date().toISOString(),
      lastRunDate: targetDate,
      lastResult: args.noPush ? "embedded" : pushOk ? "ok" : "saved_only",
      lastDigestPath: digestPath,
      lastFeedbackCount: entries.length,
      lastClusterCount: clusters.length,
      lastPushed: pushOk,
      lastDeliveryMode: deliveryMode,
      lastSummaryPreview: summaryPreview,
    },
  });

  await appendOpsLog("run", "修改建议 digest 完成", [
    `日期：${targetDate}`,
    `反馈数：${entries.length}`,
    `观点簇：${clusters.length}`,
    `生成方式：${usedModel ? "模型提炼" : "规则回退"}`,
    `交付方式：${args.noPush ? "并入 10:15 回执" : pushOk ? "飞书推送成功" : "仅落盘未推送"}`,
  ]);

  console.log(JSON.stringify({ digestPath, pushOk, usedModel, noPush: args.noPush }, null, 2));
}

main().catch(async (error) => {
  try {
    await appendOpsLog("alert", "修改建议 digest 异常退出", [`错误：${error.message}`]);
  } catch (inner) {
    // Ignore secondary logging failure.
  }
  console.error(error);
  process.exit(1);
});
