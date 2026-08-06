const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { SITE_CONFIG } = require("./src/config");
const { getSnapshotsIndex, getLatestSnapshotMeta, getSnapshotDetail } = require("./src/site-index");
const { buildContentCache } = require("./src/content-index");
const { getWeeklyInsights, getWeeklyInsight } = require("./src/weekly-insight-index");
const { saveWeeklyFeedback } = require("./src/weekly-feedback");
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
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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

async function readRequestBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      raw += chunk;
      if (bytes > maxBytes) {
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

function isWeeklyPreviewAuthorized(req, searchParams) {
  if (!SITE_CONFIG.weeklyPreviewToken) return false;
  const headerToken = String(req.headers["x-weekly-preview-token"] || "");
  const queryToken = String(searchParams.get("preview_token") || "");
  return headerToken === SITE_CONFIG.weeklyPreviewToken || queryToken === SITE_CONFIG.weeklyPreviewToken;
}

function toPublicWeeklyDetail(detail) {
  if (!detail) return detail;
  return {
    schema_version: detail.schema_version,
    artifact_id: detail.artifact_id,
    source_run_id: detail.source_run_id,
    version: detail.version,
    content_sha256: detail.content_sha256,
    publication: {
      public_enabled: detail.publication?.public_enabled === true,
      visibility: detail.publication?.visibility,
    },
    content: detail.content,
    manifest: {
      content_schema_version: detail.manifest.content_schema_version || detail.schema_version,
      artifact_id: detail.manifest.artifact_id,
      source_run_id: detail.manifest.source_run_id,
      version: detail.manifest.version,
      content_sha256: detail.manifest.content_sha256,
      section_anchors: detail.manifest.section_anchors,
      period: detail.manifest.period,
      title: detail.manifest.title,
      status: detail.manifest.status,
      issue_kind: detail.manifest.issue_kind,
      selected_theses: detail.manifest.selected_theses,
      selected_topics: detail.manifest.selected_topics,
    },
  };
}

function toPublicWeeklyIndex(index) {
  return {
    generated_at: index.generated_at,
    count: index.count,
    insights: index.insights.map((item) => ({
      content_schema_version: item.content_schema_version || "weekly-insight-publication/v1",
      artifact_id: item.artifact_id,
      source_run_id: item.source_run_id,
      version: item.version,
      content_sha256: item.content_sha256,
      section_anchors: item.section_anchors,
      reader_sections: item.reader_sections,
      publication: {
        public_enabled: item.publication?.public_enabled === true,
        visibility: item.publication?.visibility,
      },
      period: item.period,
      title: item.title,
      dek: item.dek,
      status: item.status,
      issue_kind: item.issue_kind,
      selected_theses: item.selected_theses,
      selected_topics: item.selected_topics,
      committed_at: item.committed_at,
    })),
  };
}

async function sendFile(res, filePath, contentType, downloadName) {
  try {
    const stat = await fsp.stat(filePath);
    const headers = {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "private, no-store, max-age=0",
    };
    if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendText(res, 404, "Not Found");
  }
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

  if (req.method === "GET" && pathname === "/api/insights") {
    const includeUnpublished = isWeeklyPreviewAuthorized(req, searchParams);
    const index = await getWeeklyInsights({ includeUnpublished });
    return sendJson(res, 200, toPublicWeeklyIndex(index));
  }

  const weeklyMatch = pathname.match(/^\/api\/insights\/([a-z0-9][a-z0-9-]{2,99})(?:\/(word|feedback))?$/);
  if (weeklyMatch) {
    const artifactId = weeklyMatch[1];
    const action = weeklyMatch[2] || "detail";
    const includeUnpublished = isWeeklyPreviewAuthorized(req, searchParams);
    const detail = await getWeeklyInsight(artifactId, { includeUnpublished });
    if (!detail) return sendJson(res, 404, { error: "Weekly insight not found" });

    if (req.method === "GET" && action === "detail") {
      return sendJson(res, 200, toPublicWeeklyDetail(detail));
    }
    if (req.method === "GET" && action === "word") {
      return sendFile(
        res,
        path.join(detail.artifact_dir, `${artifactId}.docx`),
        CONTENT_TYPES[".docx"],
        `${artifactId}.docx`,
      );
    }
    if (req.method === "POST" && action === "feedback") {
      try {
        const maxBodyBytes = Math.ceil(SITE_CONFIG.weeklyFeedbackMaxDocxBytes * 1.5) + 64 * 1024;
        const rawBody = await readRequestBody(req, maxBodyBytes);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const encoded = String(body.editedDocxBase64 || "").trim();
        if (encoded && !/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) {
          return sendJson(res, 400, { error: "编辑后的 Word 编码无效" });
        }
        const editedDocx = encoded ? Buffer.from(encoded, "base64") : null;
        const result = await saveWeeklyFeedback({
          snapshot: detail,
          manifest: detail.manifest,
          originalDocxPath: path.join(detail.artifact_dir, `${artifactId}.docx`),
          feedbackDir: SITE_CONFIG.weeklyFeedbackDir,
          sectionAnchor: String(body.sectionAnchor || "overall"),
          comment: String(body.comment || ""),
          editedDocx,
          maxDocxBytes: SITE_CONFIG.weeklyFeedbackMaxDocxBytes,
        });
        const { file_path, ...receipt } = result;
        return sendJson(res, 201, { ok: true, receipt });
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }
    }
    return sendJson(res, 405, { error: "Method not allowed" });
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
    const result = await buildContentCache();
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
      const detailMatch = requestUrl.pathname.match(/^\/insights\/([a-z0-9][a-z0-9-]{2,99})\/?$/);
      if (detailMatch) {
        const detail = await getWeeklyInsight(detailMatch[1], {
          includeUnpublished: isWeeklyPreviewAuthorized(req, requestUrl.searchParams),
        });
        if (!detail) return sendText(res, 404, "Not Found");
        return sendFile(res, path.join(detail.artifact_dir, "index.html"), CONTENT_TYPES[".html"]);
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
    console.log(`Weekly insight source: ${SITE_CONFIG.weeklySourceDir}`);
    console.log(`Weekly insight cache: ${SITE_CONFIG.weeklyCacheDir}`);
  });
}

module.exports = { createServer, SITE_CONFIG };
