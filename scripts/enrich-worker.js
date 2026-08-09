#!/usr/bin/env node

/**
 * enrich-worker.js
 *
 * Horizon-inspired enrichment worker.
 * Scans the archive dir for .md reports that have no corresponding .enrich file,
 * identifies unfamiliar terms (ALL-CAPS acronyms, known entity patterns),
 * optionally searches the web for background context, and writes an .enrich JSON file.
 *
 * Design:
 * - Non-blocking: never holds up site publishing.
 * - Idempotent: skips reports that already have an .enrich file.
 * - Degrades gracefully: no network → writes empty enrich (no crash).
 * - Triggered by check-refresh.js after finding a new report, or manually via npm run enrich.
 */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const https = require("node:https");
const { SITE_CONFIG } = require("../src/config");
const { listReportSnapshots, parseReportFile } = require("../src/report-parser");

// Patterns for terms worth enriching
const ACRONYM_RE = /\b([A-Z][A-Z0-9]{2,}(?:\.[A-Z0-9]+)?)\b/g;
// Company/project names preceding key phrases
const ENTITY_RE = /((?:[A-Z][a-z]+(?:[A-Z][a-z]+)+|Open(?:[A-Z][a-z]+|AI)))/g;

// Skip common tech terms that don't need enrichment
const SKIP_ACRONYMS = new Set([
  "API", "CPU", "GPU", "NPU", "TPU", "LLM", "RAG", "AI", "ML", "DL",
  "HTTP", "HTTPS", "SSH", "DNS", "HTML", "CSS", "JS", "JSON", "XML",
  "YAML", "CLI", "GUI", "IDE", "SDK", "DB", "SQL", "NoSQL", "BIOS",
  "RAM", "ROM", "SSD", "HDD", "USB", "PCI", "PCIe", "SATA", "NVMe",
  "ID", "URL", "URI", "UI", "UX", "QA", "CI", "CD", "DevOps", "MCP",
]);

function extractTerms(text) {
  if (!text) return [];
  const terms = new Set();
  let match;
  while ((match = ACRONYM_RE.exec(text)) !== null) {
    const term = match[1].replace(/\.$/, "");
    if (!SKIP_ACRONYMS.has(term) && term.length >= 3) {
      terms.add(term);
    }
  }
  while ((match = ENTITY_RE.exec(text)) !== null) {
    terms.add(match[1]);
  }
  return [...terms].slice(0, 5); // limit to top 5
}

async function webSearchBackground(term, timeoutMs = 5000, options = {}) {
  // Uses DuckDuckGo lite search (no API key needed)
  // Returns a short plain-text summary or null
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(term + " technology")}`;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const deadline = Date.now() + timeoutMs;

  const request = (target, redirectsLeft) => new Promise((resolve) => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const req = https.get(target, { timeout: remainingMs }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
        res.resume();
        let redirect;
        try {
          redirect = new URL(location, target);
        } catch {
          finish(null);
          return;
        }
        if (redirect.protocol !== "https:") {
          finish(null);
          return;
        }
        request(redirect, redirectsLeft - 1).then(finish);
        return;
      }
      if (status !== 200) {
        res.resume();
        finish(null);
        return;
      }
      const chunks = [];
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          req.destroy();
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (settled) return;
        const data = Buffer.concat(chunks).toString("utf8");
        const snippetMatch = data.match(/class="result-snippet">([^<]+)</);
        finish(snippetMatch ? snippetMatch[1].trim() : null);
      });
    });
    req.on("timeout", () => {
      req.destroy();
      finish(null);
    });
    req.on("error", () => finish(null));
  });
  return request(url, maxRedirects);
}

async function enrichReport(reportPath, options = {}) {
  if (!String(reportPath).endsWith(".md")) {
    throw new Error("Enrichment input must be a Markdown report (.md)");
  }
  const enrichPath = reportPath.replace(/\.md$/, ".enrich");
  // Idempotent: skip if already enriched
  if (fs.existsSync(enrichPath)) return null;

  const report = parseReportFile(reportPath);
  if (!report) return null;

  const allItems = [
    ...Object.entries(report.sections).flatMap(([section, items]) => (items || []).map((item) => ({ section, item }))),
  ];

  const enrichedItems = [];
  for (const { section, item } of allItems) {
    const text = `${item.title} ${item.summary} ${item.impact}`;
    const terms = extractTerms(text);
    if (terms.length === 0) continue;

    let background = "";
    if (options.webSearch !== false) {
      // Search for first unfamiliar term
      const result = await webSearchBackground(terms[0]);
      if (result) {
        background = `${terms[0]}: ${result}`;
      }
    }

    enrichedItems.push({
      section,
      rank: item.rank,
      itemKey: `${section}:${item.rank}`,
      background,
      terms,
    });
  }

  if (enrichedItems.length === 0) return null;

  const enrichData = {
    snapshotId: `${report.date}-${report.slot}-${report.snapshotTime}`,
    generatedAt: new Date().toISOString(),
    enrichedItems,
  };

  if (!options.dryRun) {
    await fsp.writeFile(enrichPath, JSON.stringify(enrichData, null, 2), "utf8");
  }
  return enrichData;
}

async function enrichAll(options = {}) {
  const snapshots = listReportSnapshots(SITE_CONFIG.archiveDir);
  const results = [];
  for (const snapshot of snapshots) {
    try {
      const result = await enrichReport(snapshot.path, options);
      if (result) results.push({ file: snapshot.name, terms: result.enrichedItems.length });
    } catch (error) {
      // Per-report enrichment failures should not stop the batch
      console.error(`[enrich-worker] Failed: ${snapshot.name} — ${error.message}`);
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const noSearch = args.includes("--no-search");
  const specificFile = args.find((a) => !a.startsWith("--"));

  if (specificFile) {
    const result = await enrichReport(specificFile, { webSearch: !noSearch, dryRun });
    if (result) {
      console.log(JSON.stringify({ ok: true, enriched: result.enrichedItems.length, file: specificFile }, null, 2));
    } else {
      console.log(JSON.stringify({ ok: true, enriched: 0, file: specificFile, note: "Already enriched or no terms found" }, null, 2));
    }
    return;
  }

  const results = await enrichAll({ webSearch: !noSearch, dryRun });
  const total = results.reduce((sum, r) => sum + r.terms, 0);
  console.log(JSON.stringify({ ok: true, reports: results.length, totalTerms: total, dryRun }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = { enrichReport, enrichAll, extractTerms };
