const { buildContentCache } = require("../src/content-index");
const { appendOpsLog, updateOpsStatus } = require("../src/ops-store");

async function main() {
  const content = await buildContentCache();
  if (!content.daily.ok) throw new Error(`Daily cache build failed: ${content.daily.error}`);
  const result = content.daily.value;
  await updateOpsStatus({
    site: {
      lastCacheBuildAt: result.generatedAt,
      latestSnapshot: result.latest,
      indexedSnapshots: result.snapshots.length,
      archiveFileCount: result.totalFiles,
    },
  });
  await appendOpsLog("run", "站点缓存重建成功", [
    `最新快照：${result.latest ? result.latest.displayTitle : "无"}`,
    `业务快照数：${result.snapshots.length}`,
    `源文件总数：${result.totalFiles}`,
    content.weekly.ok
      ? `周度洞察：${content.weekly.value.published.length} 期，${content.weekly.value.errors.length} 个拒收`
      : `周度洞察失败（日报不受影响）：${content.weekly.error}`,
  ]);
  console.log(JSON.stringify({ ...result, weekly: content.weekly }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
