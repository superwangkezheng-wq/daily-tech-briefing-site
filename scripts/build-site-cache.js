const { buildSiteCache } = require("../src/site-index");
const { appendOpsLog, updateOpsStatus } = require("../src/ops-store");

async function main() {
  const result = await buildSiteCache();
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
  ]);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
