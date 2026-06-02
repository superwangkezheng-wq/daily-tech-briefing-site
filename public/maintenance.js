const token = new URLSearchParams(window.location.search).get("token") || "";

const elements = {
  fixedUrl: document.getElementById("ops-fixed-url"),
  cacheTime: document.getElementById("ops-cache-time"),
  cacheNote: document.getElementById("ops-cache-note"),
  refreshResult: document.getElementById("ops-refresh-result"),
  refreshNote: document.getElementById("ops-refresh-note"),
  digestResult: document.getElementById("ops-digest-result"),
  digestNote: document.getElementById("ops-digest-note"),
  accessResult: document.getElementById("ops-access-result"),
  accessNote: document.getElementById("ops-access-note"),
  maintenancePaths: document.getElementById("maintenance-paths"),
};

async function fetchOps() {
  const response = await fetch(`/api/ops/status${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
    headers: token ? { "X-Maintenance-Token": token } : {},
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "无法读取维护状态");
  }
  return response.json();
}

function appendPath(label, value) {
  const item = document.createElement("div");
  item.className = "maintenance-path-item";
  item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  elements.maintenancePaths.appendChild(item);
}

async function trackVisit() {
  try {
    await fetch(`/api/visit${token ? `?token=${encodeURIComponent(token)}` : ""}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Maintenance-Token": token } : {}),
      },
      body: JSON.stringify({
        route: "maintenance",
        title: "维护页",
      }),
    });
  } catch (error) {
    // Ignore tracking failures so the maintenance page still renders.
  }
}

function renderOps(status) {
  const site = status.site || {};
  const refresh = status.refresh || {};
  const digest = status.digest || {};

  elements.fixedUrl.textContent = site.fixedUrl || "--";
  elements.cacheTime.textContent = site.lastCacheBuildAt || "--";
  elements.cacheNote.textContent = `最近业务快照：${site.indexedSnapshots || 0}，源文件总数：${site.archiveFileCount || 0}`;
  elements.refreshResult.textContent = refresh.lastResult || "--";
  elements.refreshNote.textContent = refresh.lastSuccessSnapshot
    ? `最近成功：${refresh.lastSuccessSnapshot.displayTitle}`
    : (refresh.lastFailureReason || "暂无刷新记录");
  elements.digestResult.textContent = digest.lastResult || "--";
  elements.digestNote.textContent = digest.lastRunDate
    ? `最近处理日期：${digest.lastRunDate}，飞书推送：${digest.lastPushed ? "成功" : "未成功"}`
    : "暂无 digest 记录";
  elements.accessResult.textContent = site.lastVisitedRoute || "--";
  elements.accessNote.textContent = site.lastVisitAt
    ? `最近访问：${site.lastVisitAt}${site.lastVisitedSnapshotId ? `，快照：${site.lastVisitedSnapshotId}` : ""}`
    : "暂无访问记录";

  appendPath("日报目录", site.archiveDir || "--");
  appendPath("反馈目录", site.feedbackDir || "--");
  appendPath("维护目录", site.maintenanceDir || "--");
}

fetchOps()
  .then((status) => {
    renderOps(status);
    return trackVisit();
  })
  .catch((error) => {
    elements.refreshResult.textContent = "error";
    elements.refreshNote.textContent = error.message;
  });
