const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { extractTerms, enrichReport } = require("../scripts/enrich-worker");
const { parseNonNegativeNumber } = require("../src/config");
const { buildEnrichmentMap } = require("../src/site-index");
const {
  handleFeedbackSearch,
  httpTokenMatches,
  processJsonRpc,
  startHttpServer,
} = require("../src/mcp-server/server");

test("enrichment captures entity names and refuses non-Markdown input paths", async () => {
  const terms = extractTerms("OpenAI introduced AgentForger alongside a GPU workflow.");
  assert.ok(terms.includes("OpenAI"));
  assert.ok(terms.includes("AgentForger"));
  await assert.rejects(enrichReport("/tmp/not-a-report.json", { dryRun: true }), /Markdown report/);
});

test("enrichment uses a section-and-rank key and only accepts unambiguous legacy ranks", () => {
  const enrichment = buildEnrichmentMap({
    enrichment: {
      enrichedItems: [
        { section: "techNews", rank: 1, background: "新闻背景" },
        { section: "videoItems", rank: 1, background: "视频背景" },
        { rank: 2, background: "旧格式背景" },
        { rank: 3, background: "冲突一" },
        { rank: 3, background: "冲突二" },
      ],
    },
  });
  assert.equal(enrichment.map["techNews:1"], "新闻背景");
  assert.equal(enrichment.map["videoItems:1"], "视频背景");
  assert.equal(enrichment.legacy.get(2), "旧格式背景");
  assert.equal(enrichment.legacy.get(3), null);
});

test("configuration accepts zero but rejects invalid numeric enrichment limits", () => {
  assert.equal(parseNonNegativeNumber("0", 5), 0);
  assert.equal(parseNonNegativeNumber("3.5", 0), 3.5);
  assert.equal(parseNonNegativeNumber("NaN", 7), 7);
  assert.equal(parseNonNegativeNumber("-1", 7), 7);
});

test("MCP rejects malformed tool requests and unsafe feedback dates without crashing", async () => {
  const response = await processJsonRpc({ jsonrpc: "2.0", id: 7, method: "tools/call" });
  assert.equal(response.status, 400);
  assert.equal(response.payload.error.code, -32602);
  const feedback = await handleFeedbackSearch({ date: "../../private" });
  assert.equal(feedback.isError, true);
  assert.match(feedback.content[0].text, /date/i);
  assert.equal(httpTokenMatches("token", "token"), true);
  assert.equal(httpTokenMatches("token", "other"), false);
});

test("HTTP MCP is bearer-authenticated, JSON-only, bounded, and does not enable CORS", async (t) => {
  assert.throws(() => startHttpServer(0, { token: "" }), /MCP_HTTP_TOKEN/);
  const server = startHttpServer(0, { token: "review-token", maxBodyBytes: 32 });
  await once(server, "listening");
  t.after(() => server.close());
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const unauthorized = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" } });
  assert.equal(unauthorized.status, 401);
  const wrongType = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer review-token", "content-type": "text/plain" },
  });
  assert.equal(wrongType.status, 415);
  const malformed = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer review-token", "content-type": "application/json" },
    body: JSON.stringify({ method: "tools/call" }),
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32602);
  assert.equal(malformed.headers.get("access-control-allow-origin"), null);
  const oversized = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "Bearer review-token", "content-type": "application/json" },
    body: "x".repeat(33),
  });
  assert.equal(oversized.status, 413);
});
