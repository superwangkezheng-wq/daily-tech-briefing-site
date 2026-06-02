const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { SITE_CONFIG } = require("./src/config");
const { getSnapshotsIndex, getLatestSnapshotMeta, getSnapshotDetail, buildSiteCache } = require("./src/site-index");
const { appendOpsLog, readOpsStatus, updateOpsStatus } = require("./src/ops-store");
const { saveFeedback } = require("./src/feedback-store");

const PUBLIC_DIR = path.join(__dirname, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function toPublicSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const { sourceFile, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}

function toPublicSnapshotDetail(detail) {
  if (!detail || typeof detail !== "object") return detail;
  const { sourceFile, ...publicDetail } = detail;
  return publicDetail;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function getClientFingerprint(req, visitorName) {
  const forwarded = req.headers["x-forwarded-for"];
  const remoteAddress = Array.isArray(forwarded)
    ? forwarded[0]
    : String(forwarded || req.socket.remoteAddress || "");
  const userAgent = String(req.headers["user-agent"] || "");
  return crypto
    .createHash("sha256")
    .update(`${visitorName}|${remoteAddress}|${userAgent}`)
    .digest("hex")
    .slice(0, 12);
}

function getRemoteAddress(req) {
  return String(req.socket.remoteAddress || "");
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function isLocalMaintenanceRequest(req) {
  return isLoopbackAddress(getRemoteAddress(req));
}

function sanitizeStaticPath(urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const finalName = safePath === "/" ? "index.html" : safePath;
  const resolved = path.join(PUBLIC_DIR, finalName);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return resolved;
}

async function serveStatic(req, res, pathname, searchParams = new URLSearchParams()) {
  if (pathname === "/maintenance.html" && !isMaintenanceAuthorized(req, searchParams)) {
    return sendText(res, 403, "Maintenance requires authorization");
  }

  const filePath = sanitizeStaticPath(pathname);
  if (!filePath) {
    return sendText(res, 403, "Forbidden");
  }

  try {
    const stat = await fsp.stat(filePath);
    const finalPath = stat.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const ext = path.extname(finalPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const stream = fs.createReadStream(finalPath);
    const headers = { "Content-Type": contentType };
    if (ext === ".html" || ext === ".css" || ext === ".js") {
      headers["Cache-Control"] = "no-store, max-age=0, must-revalidate";
      headers.Pragma = "no-cache";
      headers.Expires = "0";
    }
    res.writeHead(200, headers);
    stream.pipe(res);
  } catch (error) {
    if (pathname !== "/index.html" && pathname !== "/") {
      return serveStatic(req, res, "/index.html");
    }
    return sendText(res, 404, "Not Found");
  }
}

function isMaintenanceAuthorized(req, searchParams) {
  if (!SITE_CONFIG.maintenanceToken) {
    return true;
  }
  const headerToken = String(req.headers["x-maintenance-token"] || "");
  const queryToken = String(searchParams.get("token") || "");
  return headerToken === SITE_CONFIG.maintenanceToken || queryToken === SITE_CONFIG.maintenanceToken;
}

async function recordVisit(req, payload = {}) {
  const route = String(payload.route || "home").trim() || "home";
  const snapshotId = String(payload.snapshotId || "").trim();
  const title = String(payload.title || "").trim();
  const fingerprint = getClientFingerprint(req, route);

  await appendOpsLog("access", "网页访问", [
    `页面：${route}`,
    snapshotId ? `快照：${snapshotId}` : "快照：--",
    title ? `标题：${title}` : "标题：--",
    `访客指纹：${fingerprint}`,
  ]);

  await updateOpsStatus({
    site: {
      lastVisitAt: new Date().toISOString(),
      lastVisitedRoute: route,
      lastVisitedSnapshotId: snapshotId || "",
      lastVisitorHash: fingerprint,
    },
  });
}

async function handleApi(req, res, pathname, searchParams) {
  if (req.method === "GET" && pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "daily-tech-briefing-site",
      appVersion: SITE_CONFIG.appVersion,
    });
  }

  if (req.method === "GET" && pathname === "/api/config") {
    return sendJson(res, 200, {
      siteTitle: SITE_CONFIG.siteTitle,
      appVersion: SITE_CONFIG.appVersion,
      pageSize: SITE_CONFIG.pageSize,
      feedbackDigestHour: SITE_CONFIG.feedbackDigestHour,
    });
  }

  if (req.method === "GET" && pathname === "/api/snapshots") {
    const index = await getSnapshotsIndex();
    const latest = await getLatestSnapshotMeta();
    return sendJson(res, 200, {
      latest: toPublicSnapshot(latest),
      generatedAt: index.generatedAt,
      count: index.count,
      snapshots: index.snapshots.map(toPublicSnapshot),
    });
  }

  if (req.method === "GET" && pathname === "/api/snapshots/latest") {
    const latest = await getLatestSnapshotMeta();
    if (!latest) {
      return sendJson(res, 404, { error: "No snapshots found" });
    }
    const detail = await getSnapshotDetail(latest.id);
    return sendJson(res, 200, toPublicSnapshotDetail(detail));
  }

  if (req.method === "GET" && pathname.startsWith("/api/snapshots/")) {
    const snapshotId = decodeURIComponent(pathname.replace("/api/snapshots/", "").trim());
    const detail = await getSnapshotDetail(snapshotId);
    if (!detail) {
      return sendJson(res, 404, { error: `Snapshot not found: ${snapshotId}` });
    }
    return sendJson(res, 200, toPublicSnapshotDetail(detail));
  }

  if (req.method === "POST" && pathname === "/api/cache/rebuild") {
    if (!isLocalMaintenanceRequest(req) || !isMaintenanceAuthorized(req, searchParams)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    const result = await buildSiteCache();
    return sendJson(res, 200, result);
  }

  if (req.method === "GET" && pathname === "/api/ops/status") {
    if (!isLocalMaintenanceRequest(req) || !isMaintenanceAuthorized(req, searchParams)) {
      return sendJson(res, 401, { error: "Unauthorized" });
    }
    const status = await readOpsStatus();
    return sendJson(res, 200, status);
  }

  if (req.method === "POST" && pathname === "/api/visit") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      await recordVisit(req, body);
      return sendJson(res, 201, { ok: true });
    } catch (error) {
      return sendJson(res, 500, {
        error: "访问记录失败，请稍后重试",
      });
    }
  }

  if (req.method === "POST" && pathname === "/api/feedback") {
    try {
      const rawBody = await readRequestBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const visitorName = String(body.visitorName || "").trim() || "匿名访客";
      const content = String(body.content || "").trim();
      const reportDate = String(body.reportDate || "").trim();
      const reportTitle = String(body.reportTitle || "").trim();
      const contact = String(body.contact || "").trim();
      const snapshotId = String(body.snapshotId || "").trim();

      if (!content) {
        return sendJson(res, 400, { error: "反馈内容不能为空" });
      }
      if (content.length > 1200) {
        return sendJson(res, 400, { error: "反馈内容请控制在 1200 字以内" });
      }

      const fingerprint = getClientFingerprint(req, visitorName);
      const result = await saveFeedback({
        feedbackDir: SITE_CONFIG.feedbackDir,
        visitorName,
        contact,
        content,
        reportDate,
        reportTitle,
        source: "daily-tech-site",
        fingerprint,
        userAgent: String(req.headers["user-agent"] || ""),
        snapshotId,
      });

      await appendOpsLog("access", "用户提交反馈", [
        `访客：${visitorName}`,
        contact ? `联系方式：${contact}` : "联系方式：--",
        reportDate ? `报告日期：${reportDate}` : "报告日期：--",
        snapshotId ? `快照：${snapshotId}` : "快照：--",
        `反馈文件：${result.filePath}`,
      ]);
      await updateOpsStatus({
        site: {
          lastFeedbackAt: new Date().toISOString(),
          lastFeedbackSnapshotId: snapshotId || "",
        },
      });

      return sendJson(res, 201, {
        ok: true,
        received: true,
      });
    } catch (error) {
      return sendJson(res, 500, {
        error: "反馈提交失败，请稍后重试",
      });
    }
  }

  return sendJson(res, 404, { error: `Unknown route: ${pathname}` });
}

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (requestUrl.pathname.startsWith("/api/")) {
        return await handleApi(req, res, requestUrl.pathname, requestUrl.searchParams);
      }
      return await serveStatic(req, res, requestUrl.pathname, requestUrl.searchParams);
    } catch (error) {
      return sendJson(res, 500, {
        error: "Internal server error",
      });
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(SITE_CONFIG.port, SITE_CONFIG.host, () => {
    const listenHost = SITE_CONFIG.host === "0.0.0.0" ? "localhost" : SITE_CONFIG.host;
    console.log(`Daily tech site listening at http://${listenHost}:${SITE_CONFIG.port}`);
    console.log(`Configured public URL: ${SITE_CONFIG.fixedUrl}`);
    console.log(`Reports: ${SITE_CONFIG.archiveDir}`);
    console.log(`Feedback: ${SITE_CONFIG.feedbackDir}`);
    console.log(`Maintenance: ${SITE_CONFIG.maintenanceDir}`);
  });
}

module.exports = { createServer, SITE_CONFIG };
