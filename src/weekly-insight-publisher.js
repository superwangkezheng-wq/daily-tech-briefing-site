const crypto = require("node:crypto");
const dns = require("node:dns/promises");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const { validateWeeklySnapshot } = require("./weekly-insight-contract");
const { renderWeeklyHtml, renderWeeklyDocx, wordBookmarkName } = require("./weekly-insight-renderer");
const { readZipEntries } = require("./ooxml");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sniffImage(buffer, declaredType = "") {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return {
      contentType: "image/png",
      extension: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if ((marker === 0xc0 || marker === 0xc2) && segmentLength >= 7) {
        return {
          contentType: "image/jpeg",
          extension: "jpg",
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += segmentLength;
    }
    throw new Error("Unsupported weekly media JPEG dimensions");
  }
  throw new Error(`Unsupported weekly media image type: ${declaredType || "unknown"}`);
}

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase();
  if (net.isIP(normalized) === 6) {
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  if (net.isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19));
}

async function validateRemoteMediaUrl(media, parsed, options) {
  if (parsed.protocol !== "https:" || (parsed.port && parsed.port !== "443")) {
    throw new Error(`Weekly media must use HTTPS or a local weekly asset: ${media.id}`);
  }
  const allowedHosts = new Set(
    (Array.isArray(options.mediaAllowedHosts) ? options.mediaAllowedHosts : [])
      .map((host) => String(host || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (media.source_url) allowedHosts.add(new URL(media.source_url).hostname.toLowerCase());
  const hostname = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) throw new Error(`Weekly media host is not allowlisted: ${media.id}`);
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || isPrivateAddress(hostname)) {
    throw new Error(`Weekly media host resolves to a private address: ${media.id}`);
  }
  const lookupHost = options.lookupHost || ((host) => dns.lookup(host, { all: true, verbatim: true }));
  const addresses = await lookupHost(hostname);
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error(`Weekly media host resolves to a private address: ${media.id}`);
  }
}

async function defaultLoadWeeklyMedia(media, options = {}) {
  const parsed = new URL(media.src);
  const publicRoot = path.resolve(options.publicRoot || path.join(__dirname, "..", "public"));
  const pathname = decodeURIComponent(parsed.pathname);
  if (pathname.startsWith("/weekly-assets/")) {
    const localPath = path.resolve(publicRoot, `.${pathname}`);
    const weeklyAssetsRoot = path.join(publicRoot, "weekly-assets") + path.sep;
    if (!localPath.startsWith(weeklyAssetsRoot)) throw new Error(`Unsafe weekly media path: ${media.id}`);
    try {
      const buffer = await fsp.readFile(localPath);
      return { buffer, ...sniffImage(buffer) };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await validateRemoteMediaUrl(media, parsed, options);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(parsed, {
    headers: { "user-agent": "DailyTechWeeklyInsight/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(options.mediaTimeoutMs || 5000),
  });
  if (!response.ok) throw new Error(`Weekly media request failed (${response.status}): ${media.id}`);
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  const maxBytes = options.mediaMaxBytes || 8 * 1024 * 1024;
  if (declaredBytes > maxBytes) throw new Error(`Weekly media exceeds ${maxBytes} bytes: ${media.id}`);
  if (!response.body) throw new Error(`Weekly media request returned no body: ${media.id}`);
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throw new Error(`Weekly media exceeds ${maxBytes} bytes: ${media.id}`);
    chunks.push(buffer);
  }
  const buffer = Buffer.concat(chunks, totalBytes);
  return { buffer, ...sniffImage(buffer, response.headers.get("content-type") || "") };
}

async function loadWeeklyMediaAssets(snapshot, options = {}) {
  if (snapshot.schema_version !== "weekly-insight-publication/v3") return [];
  const loader = options.loadMedia || ((media) => defaultLoadWeeklyMedia(media, options));
  return Promise.all(snapshot.content.media.map(async (media) => {
    if (!media.src) throw new Error(`V3 media requires a source image: ${media.id}`);
    const loaded = await loader(media);
    const buffer = Buffer.isBuffer(loaded) ? loaded : loaded?.buffer;
    if (!Buffer.isBuffer(buffer)) throw new Error(`Weekly media loader returned no image: ${media.id}`);
    const details = sniffImage(buffer, loaded?.contentType);
    return {
      id: media.id,
      buffer,
      ...details,
    };
  }));
}

async function fileReceipt(filePath) {
  const value = await fsp.readFile(filePath);
  return { sha256: sha256(value), bytes: value.length };
}

async function readMatchingArtifact(artifactDir, snapshot) {
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) return null;
  try {
    const manifest = JSON.parse(await fsp.readFile(path.join(artifactDir, "manifest.json"), "utf8"));
    if (
      manifest.schema_version !== "weekly-insight-publication-manifest/v1" ||
      (manifest.content_schema_version && manifest.content_schema_version !== snapshot.schema_version) ||
      manifest.artifact_id !== snapshot.artifact_id ||
      manifest.source_run_id !== snapshot.source_run_id ||
      manifest.version !== snapshot.version ||
      manifest.approved_candidate_sha256 !== snapshot.approved_candidate_sha256 ||
      manifest.content_sha256 !== snapshot.content_sha256 ||
      JSON.stringify(manifest.publication) !== JSON.stringify(snapshot.publication) ||
      JSON.stringify(manifest.section_anchors) !== JSON.stringify(snapshot.section_anchors)
    ) {
      return null;
    }
    for (const [key, name] of [
      ["html", "index.html"],
      ["docx", `${snapshot.artifact_id}.docx`],
      ["content", "content.json"],
    ]) {
      const actual = await fileReceipt(path.join(artifactDir, name));
      if (actual.sha256 !== manifest.files?.[key]?.sha256 || actual.bytes !== manifest.files?.[key]?.bytes) {
        return null;
      }
    }
    return manifest;
  } catch (error) {
    return null;
  }
}

function verifyDocx(docx, snapshot) {
  const entries = readZipEntries(docx);
  const custom = entries.get("docProps/custom.xml")?.toString("utf8") || "";
  const document = entries.get("word/document.xml")?.toString("utf8") || "";
  for (const value of [snapshot.artifact_id, snapshot.source_run_id, snapshot.version, snapshot.content_sha256]) {
    if (!custom.includes(value)) throw new Error(`DOCX receipt mismatch: ${value}`);
  }
  for (const anchor of snapshot.section_anchors) {
    if (!document.includes(`w:name="${wordBookmarkName(anchor)}"`)) throw new Error(`DOCX missing section anchor: ${anchor}`);
  }
}

function verifyHtml(html, snapshot) {
  for (const [key, value] of [
    ["artifact_id", snapshot.artifact_id],
    ["source_run_id", snapshot.source_run_id],
    ["version", snapshot.version],
    ["content_sha256", snapshot.content_sha256],
  ]) {
    if (!html.includes(`name="weekly:${key}" content="${value}"`)) throw new Error(`HTML receipt mismatch: ${key}`);
  }
  for (const anchor of snapshot.section_anchors) {
    if (!html.includes(`id="${anchor}"`)) throw new Error(`HTML missing section anchor: ${anchor}`);
  }
}

async function publishWeeklySnapshot(input, options = {}) {
  const snapshot = validateWeeklySnapshot(input);
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) {
    throw new Error("Invalid artifact_id for publication path");
  }
  const publishRoot = path.resolve(options.publishRoot || ".cache/weekly-insights");
  const htmlRenderer = options.renderHtml || renderWeeklyHtml;
  const docxRenderer = options.renderDocx || renderWeeklyDocx;
  const artifactDir = path.join(publishRoot, snapshot.artifact_id);
  const stageDir = path.join(publishRoot, `.stage-${snapshot.artifact_id}-${crypto.randomUUID()}`);
  await fsp.mkdir(publishRoot, { recursive: true });

  if (fs.existsSync(artifactDir)) {
    const existing = await readMatchingArtifact(artifactDir, snapshot);
    if (existing) return { ...existing, artifact_dir: artifactDir, unchanged: true };
    throw new Error(`Artifact already exists with different content: ${snapshot.artifact_id}`);
  }

  try {
    await fsp.mkdir(stageDir, { recursive: false });
    const mediaAssets = await loadWeeklyMediaAssets(snapshot, options);
    const html = htmlRenderer(snapshot);
    await fsp.writeFile(path.join(stageDir, "index.html"), html, "utf8");
    const docx = await docxRenderer(snapshot, { mediaAssets });
    if (!Buffer.isBuffer(docx)) throw new Error("DOCX renderer must return a Buffer");
    await fsp.writeFile(path.join(stageDir, `${snapshot.artifact_id}.docx`), docx);
    const { section_anchors, ...approvedSnapshot } = snapshot;
    await fsp.writeFile(path.join(stageDir, "content.json"), JSON.stringify(approvedSnapshot, null, 2), "utf8");

    verifyHtml(html, snapshot);
    verifyDocx(docx, snapshot);
    const manifest = {
      schema_version: "weekly-insight-publication-manifest/v1",
      content_schema_version: snapshot.schema_version,
      artifact_id: snapshot.artifact_id,
      source_run_id: snapshot.source_run_id,
      version: snapshot.version,
      approved_candidate_sha256: snapshot.approved_candidate_sha256,
      content_sha256: snapshot.content_sha256,
      section_anchors: snapshot.section_anchors,
      publication: snapshot.publication,
      period: snapshot.content.period,
      title: snapshot.content.title,
      dek: snapshot.content.dek,
      status: snapshot.content.status,
      selected_theses: snapshot.content.selected_theses,
      selected_topics: snapshot.content.selected_topics,
      committed_at: new Date().toISOString(),
      files: {
        html: await fileReceipt(path.join(stageDir, "index.html")),
        docx: await fileReceipt(path.join(stageDir, `${snapshot.artifact_id}.docx`)),
        content: await fileReceipt(path.join(stageDir, "content.json")),
      },
    };
    await fsp.writeFile(path.join(stageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    try {
      await fsp.rename(stageDir, artifactDir);
    } catch (renameError) {
      const existing = await readMatchingArtifact(artifactDir, snapshot);
      if (!existing) throw renameError;
      await fsp.rm(stageDir, { recursive: true, force: true });
      return { ...existing, artifact_dir: artifactDir, unchanged: true };
    }
    return { ...manifest, artifact_dir: artifactDir, unchanged: false };
  } catch (error) {
    await fsp.rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  publishWeeklySnapshot,
  verifyHtml,
  verifyDocx,
  readMatchingArtifact,
  loadWeeklyMediaAssets,
};
