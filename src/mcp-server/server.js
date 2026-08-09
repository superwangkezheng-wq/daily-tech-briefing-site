#!/usr/bin/env node

/**
 * daily-tech-briefing MCP Server
 *
 * Horizon-inspired MCP server that exposes the site's key capabilities
 * as MCP tools for AI assistants (Claude Code, Codex, OpenClaw agents).
 *
 * Principles (from Horizon MCP design):
 * 1. Keep existing modules as the single source of business logic
 * 2. Expose via stdio, never via HTTP
 * 3. No extra side effects unless explicitly requested
 *
 * Usage:
 *   node src/mcp-server/server.js    # stdio mode for MCP clients
 *   node src/mcp-server/server.js --http 4322   # HTTP mode for testing
 */

const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const crypto = require("node:crypto");

// ─── MCP Protocol helpers ───────────────────────────────────────────
// Minimal MCP stdio implementation — no external SDK dependency

const ROOT_DIR = path.resolve(__dirname, "..", "..");

// Dynamic requires — only load when the tool is actually called
let siteIndex, configMod, reportParser, opsStore, feedbackStore;

function loadModules() {
  if (!siteIndex) siteIndex = require(path.join(ROOT_DIR, "src", "site-index"));
  if (!configMod) configMod = require(path.join(ROOT_DIR, "src", "config"));
  if (!reportParser) reportParser = require(path.join(ROOT_DIR, "src", "report-parser"));
  if (!opsStore) opsStore = require(path.join(ROOT_DIR, "src", "ops-store"));
  return { siteIndex, configMod, reportParser, opsStore };
}

// ─── Tool implementations ───────────────────────────────────────────

async function handleSnapshotList(args) {
  const { siteIndex } = loadModules();
  const index = await siteIndex.getSnapshotsIndex();
  return {
    content: [{ type: "text", text: JSON.stringify(index, null, 2) }],
  };
}

async function handleSnapshotLatest(args) {
  const { siteIndex } = loadModules();
  const latest = await siteIndex.getLatestSnapshotMeta();
  if (!latest) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "No snapshots found" }) }], isError: true };
  }
  const detail = await siteIndex.getSnapshotDetail(latest.id);
  return {
    content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
  };
}

async function handleSnapshotGet(args) {
  const { siteIndex } = loadModules();
  const id = args && args.id;
  if (!id) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Missing required argument: id" }) }], isError: true };
  }
  const detail = await siteIndex.getSnapshotDetail(id);
  if (!detail) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `Snapshot not found: ${id}` }) }], isError: true };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
  };
}

async function handleCacheRebuild(args) {
  const { siteIndex } = loadModules();
  const result = await siteIndex.buildSiteCache();
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

async function handleHealthStatus(args) {
  const { configMod, siteIndex, opsStore } = loadModules();
  const meta = await siteIndex.getLatestSnapshotMeta();
  const ops = await opsStore.readOpsStatus();
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ok: true,
        service: "daily-tech-briefing-site",
        appVersion: configMod.SITE_CONFIG.appVersion,
        archiveDir: configMod.SITE_CONFIG.archiveDir,
        latestSnapshot: meta ? {
          id: meta.id,
          date: meta.date,
          slotLabel: meta.slotLabel,
          displayTitle: meta.displayTitle,
          total: meta.total,
          counts: meta.counts,
        } : null,
        opsStatus: {
          lastRefreshResult: ops.refresh ? ops.refresh.lastResult : null,
          lastRefreshDate: ops.refresh ? ops.refresh.lastCheckedDate : null,
          lastFeedbackAt: ops.site ? ops.site.lastFeedbackAt : null,
          updatedAt: ops.updatedAt,
        },
      }, null, 2),
    }],
  };
}

async function handleFeedbackSearch(args) {
  const { configMod } = loadModules();
  const feedbackDir = configMod.SITE_CONFIG.feedbackDir;
  const date = String(args?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Missing required argument: date (YYYY-MM-DD)" }) }], isError: true };
  }
  const root = path.resolve(feedbackDir);
  const feedbackPath = path.resolve(root, `${date}.md`);
  if (!feedbackPath.startsWith(`${root}${path.sep}`)) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Invalid feedback date" }) }], isError: true };
  }
  if (!fs.existsSync(feedbackPath)) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `No feedback found for ${date}` }) }],
      isError: true,
    };
  }
  const content = fs.readFileSync(feedbackPath, "utf8");
  return {
    content: [{ type: "text", text: content }],
  };
}

async function handleEnrichTrigger(args) {
  const { configMod } = loadModules();
  if (!configMod.SITE_CONFIG.enrichEnabled) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Enrichment is disabled (ENRICH_ENABLED=false)" }) }], isError: true };
  }
  // Spawn enrich-worker as detached child
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [
    path.join(ROOT_DIR, "scripts", "enrich-worker.js"),
    "--no-search",
  ], { stdio: "ignore", detached: true });
  child.once("error", () => {});
  child.unref();
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, message: "Enrichment worker triggered (async)" }) }],
  };
}

// ─── Tool registry ──────────────────────────────────────────────────

const TOOLS = {
  snapshot_list: {
    description: "List all available daily briefing snapshots with date, slot, and count",
    handler: handleSnapshotList,
    inputSchema: { type: "object", properties: {} },
  },
  snapshot_latest: {
    description: "Get the latest daily briefing snapshot with full content (sections, items, summaries)",
    handler: handleSnapshotLatest,
    inputSchema: { type: "object", properties: {} },
  },
  snapshot_get: {
    description: "Get a specific daily briefing snapshot by its ID (e.g. '2026-06-16-上午版-094000')",
    handler: handleSnapshotGet,
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Snapshot ID from snapshot_list" } },
      required: ["id"],
    },
  },
  cache_rebuild: {
    description: "Rebuild the site cache from Markdown reports (non-blocking)",
    handler: handleCacheRebuild,
    inputSchema: { type: "object", properties: {} },
  },
  health_status: {
    description: "Get overall system health: latest snapshot, refresh status, feedback status",
    handler: handleHealthStatus,
    inputSchema: { type: "object", properties: {} },
  },
  feedback_search: {
    description: "Read reader feedback for a specific date (YYYY-MM-DD)",
    handler: handleFeedbackSearch,
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "Date in YYYY-MM-DD format" } },
      required: ["date"],
    },
  },
  enrich_trigger: {
    description: "Trigger asynchronous enrichment worker for new reports (requires ENRICH_ENABLED=true)",
    handler: handleEnrichTrigger,
    inputSchema: { type: "object", properties: {} },
  },
};

// ─── JSON-RPC helpers ───────────────────────────────────────────────

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function invalidToolParams(msg) {
  return !msg.params || typeof msg.params !== "object" || typeof msg.params.name !== "string";
}

async function processJsonRpc(msg) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return { status: 400, payload: { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } } };
  }
  if (msg.method === "initialize") {
    return {
      status: 200,
      payload: {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "daily-tech-briefing-mcp", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      },
    };
  }
  if (msg.method === "tools/list") {
    const tools = Object.entries(TOOLS).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema,
    }));
    return { status: 200, payload: { jsonrpc: "2.0", id: msg.id, result: { tools } } };
  }
  if (msg.method === "tools/call") {
    if (invalidToolParams(msg)) {
      return { status: 400, payload: { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32602, message: "Invalid params: tool name is required" } } };
    }
    const tool = TOOLS[msg.params.name];
    if (!tool) {
      return { status: 404, payload: { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown tool: ${msg.params.name}` } } };
    }
    try {
      const result = await tool.handler(msg.params.arguments || {});
      return { status: 200, payload: { jsonrpc: "2.0", id: msg.id, result } };
    } catch (error) {
      return { status: 500, payload: { jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32603, message: errorMessage(error) } } };
    }
  }
  if (msg.method === "notifications/initialized") {
    return null;
  }
  return { status: 404, payload: { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Unknown method: ${msg.method}` } } };
}

// ─── Stdio MCP Server ───────────────────────────────────────────────

function startStdioServer() {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on("line", async (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(jsonRpcError(null, -32700, "Parse error"));
      return;
    }

    const response = await processJsonRpc(msg);
    if (response) process.stdout.write(JSON.stringify(response.payload) + "\n");
  });
}

// ─── HTTP mode (for testing only) ───────────────────────────────────

function httpTokenMatches(requestToken, expectedToken) {
  const actual = Buffer.from(String(requestToken || ""));
  const expected = Buffer.from(String(expectedToken || ""));
  return actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
}

function startHttpServer(port, options = {}) {
  loadModules();
  const token = String(options.token ?? process.env.MCP_HTTP_TOKEN ?? "").trim();
  if (!token) throw new Error("MCP_HTTP_TOKEN is required for HTTP MCP mode");
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }

    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      res.statusCode = 415;
      res.end(JSON.stringify({ error: "Content-Type must be application/json" }));
      return;
    }
    const authorization = String(req.headers.authorization || "");
    const requestToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!httpTokenMatches(requestToken, token)) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const chunks = [];
    let bodyBytes = 0;
    let ended = false;
    const rejectBody = (status, message) => {
      if (ended) return;
      ended = true;
      res.statusCode = status;
      res.end(JSON.stringify({ error: message }));
      req.destroy();
    };
    req.on("data", (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > maxBodyBytes) {
        rejectBody(413, "Request body too large");
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => rejectBody(400, "Request stream error"));
    req.on("end", async () => {
      if (ended) return;
      ended = true;
      let msg;
      try { msg = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Parse error" }));
        return;
      }
      const response = await processJsonRpc(msg);
      if (!response) {
        res.statusCode = 204;
        res.end();
        return;
      }
      res.statusCode = response.status;
      res.end(JSON.stringify(response.payload));
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.error(`MCP HTTP test server listening on http://127.0.0.1:${port}`);
  });
  return server;
}

// ─── Entry point ────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const httpIndex = args.indexOf("--http");
  if (httpIndex !== -1 && args[httpIndex + 1]) {
    startHttpServer(Number(args[httpIndex + 1]));
  } else {
    startStdioServer();
  }
}

if (require.main === module) {
  main();
}

module.exports = { TOOLS, handleFeedbackSearch, processJsonRpc, startHttpServer, httpTokenMatches };
