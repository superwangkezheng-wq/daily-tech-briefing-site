const { SITE_CONFIG, REFRESH_SLOTS } = require("../src/config");
const { buildSiteCache } = require("../src/site-index");
const { appendOpsLog, updateOpsStatus, todayString } = require("../src/ops-store");
const { sendFeishuMessage } = require("../src/feishu");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === "--slot") {
      args.slot = argv[index + 1];
      index += 1;
    } else if (part === "--date") {
      args.date = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function resolveSlot(input) {
  if (input && REFRESH_SLOTS[input]) return REFRESH_SLOTS[input];
  return REFRESH_SLOTS.morning;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultMaxAttempts(slot) {
  return slot.maxAttempts || 6;
}

function defaultRetryDelayMs(slot) {
  return slot.retryDelayMs || 300000;
}

async function main() {
  const args = parseArgs(process.argv);
  const slot = resolveSlot(args.slot);
  const targetDate = args.date || todayString();
  const retryDelayMs = Number(process.env.REFRESH_RETRY_DELAY_MS || defaultRetryDelayMs(slot));
  const maxAttempts = Number(process.env.REFRESH_MAX_ATTEMPTS || defaultMaxAttempts(slot));

  let found = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await buildSiteCache();
    const matched = result.snapshots.find(
      (item) => item.date === targetDate && item.slotLabel === slot.label,
    );

    if (matched) {
      found = matched;
      await updateOpsStatus({
        refresh: {
          lastCheckedAt: new Date().toISOString(),
          lastCheckedDate: targetDate,
          lastCheckedSlot: slot.label,
          lastSuccessAt: new Date().toISOString(),
          lastSuccessSnapshot: matched,
          lastResult: "ok",
          lastFailureAt: "",
          lastFailureReason: "",
        },
      });
      await appendOpsLog("refresh", "刷新检查成功", [
        `日期：${targetDate}`,
        `快照：${slot.label}`,
        `尝试次数：${attempt}`,
        `命中快照：${matched.displayTitle}`,
      ]);
      console.log(JSON.stringify({ ok: true, matched, attempt }, null, 2));
      return;
    }

    await appendOpsLog("refresh", "刷新检查未命中新日报", [
      `日期：${targetDate}`,
      `快照：${slot.label}`,
      `尝试次数：${attempt}/${maxAttempts}`,
      `源目录：${SITE_CONFIG.archiveDir}`,
    ]);
    await updateOpsStatus({
      refresh: {
        lastCheckedAt: new Date().toISOString(),
        lastCheckedDate: targetDate,
        lastCheckedSlot: slot.label,
        lastResult: "pending",
        lastFailureReason: `等待新日报生成中：第 ${attempt}/${maxAttempts} 次检查未命中`,
      },
    });

    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }

  await updateOpsStatus({
    refresh: {
      lastCheckedAt: new Date().toISOString(),
      lastCheckedDate: targetDate,
      lastCheckedSlot: slot.label,
      lastResult: "error",
      lastFailureAt: new Date().toISOString(),
      lastFailureReason: `超过 ${maxAttempts} 次检查仍未发现 ${targetDate} ${slot.label} 新日报`,
    },
  });

  const alertLines = [
    `严重异常：${targetDate} ${slot.label} 在 ${slot.scheduledCheckAt} 后 ${maxAttempts} 次检查仍未刷新到网页缓存。`,
    `目标目录：${SITE_CONFIG.archiveDir}`,
    `已同步写入 Obsidian 运维日志，请立即检查默认实例日报任务是否执行完成。`,
  ];

  await appendOpsLog("alert", "严重异常：网页未刷新到新日报", alertLines);

  try {
    await sendFeishuMessage(alertLines.join("\n"));
  } catch (error) {
    await appendOpsLog("alert", "严重异常告警发送失败", [`错误：${error.message}`]);
  }

  console.error(`Refresh check failed for ${targetDate} ${slot.label}`);
  process.exit(1);
}

main().catch(async (error) => {
  try {
    await appendOpsLog("alert", "刷新检查脚本异常退出", [`错误：${error.message}`]);
  } catch (inner) {
    // Ignore secondary logging failures.
  }
  console.error(error);
  process.exit(1);
});
