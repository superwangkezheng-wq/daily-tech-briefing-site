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
const url = require("node:url");

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
  const { configMod, reportParser } = loadModules();
  const feedbackDir = configMod.SITE_CONFIG.feedbackDir;
  const date = args && args.date;
  if (!date) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Missing required argument: date (YYYY-MM-DD)" }) }], isError: true };
  }
  const feedbackPath = path.join(feedbackDir, `${date}.md`);
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

function jsonRpcResult(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
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

    if (msg.method === "initialize") {
      process.stdout.write(jsonRpcResult(msg.id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "daily-tech-briefing-mcp", version: "1.0.0" },
        capabilities: { tools: {} },
      }));
      return;
    }

    if (msg.method === "tools/list") {
      const tools = Object.entries(TOOLS).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: def.inputSchema,
      }));
      process.stdout.write(jsonRpcResult(msg.id, { tools }));
      return;
    }

    if (msg.method === "tools/call") {
      const tool = TOOLS[msg.params.name];
      if (!tool) {
        process.stdout.write(jsonRpcError(msg.id, -32601, `Unknown tool: ${msg.params.name}`));
        return;
      }
      try {
        const result = await tool.handler(msg.params.arguments || {});
        process.stdout.write(jsonRpcResult(msg.id, result));
      } catch (error) {
        process.stdout.write(jsonRpcError(msg.id, -32603, error.message));
      }
      return;
    }

    if (msg.method === "notifications/initialized") {
      return; // no-op
    }

    // Fallback
    process.stdout.write(jsonRpcError(msg.id, -32601, `Unknown method: ${msg.method}`));
  });
}

// ─── HTTP mode (for testing only) ───────────────────────────────────

function startHttpServer(port) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:4321");
    res.setHeader("Content-Type", "application/json");

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", async () => {
      let msg;
      try { msg = JSON.parse(body); } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Parse error" }));
        return;
      }

      if (msg.method === "tools/list") {
        const tools = Object.entries(TOOLS).map(([name, def]) => ({
          name,
          description: def.description,
          inputSchema: def.inputSchema,
        }));
        res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools } }));
        return;
      }

      if (msg.method === "tools/call") {
        const tool = TOOLS[msg.params.name];
        if (!tool) {
          res.statusCode = 404;
          res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Unknown tool" } }));
          return;
        }
        try {
          const result = await tool.handler(msg.params.arguments || {});
          res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: error.message } }));
        }
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Unknown method" } }));
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.error(`MCP HTTP test server listening on http://127.0.0.1:${port}`);
  });
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

module.exports = { TOOLS };
