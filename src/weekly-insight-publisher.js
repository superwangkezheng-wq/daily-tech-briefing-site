const crypto = require("node:crypto");
const dns = require("node:dns/promises");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const zlib = require("node:zlib");
const jpeg = require("jpeg-js");
const { canonicalSha256, validateWeeklySnapshot } = require("./weekly-insight-contract");
const { renderWeeklyHtml, renderWeeklyDocx, wordBookmarkName } = require("./weekly-insight-renderer");
const { readZipEntries } = require("./ooxml");
const { DEFAULT_WEEKLY_FEEDBACK_DOCX_MAX_BYTES } = require("./weekly-limits");

const MAX_IMAGE_PIXELS = 40_000_000;
const BUNDLE_MANIFEST_FIELDS = new Set([
  "schema_version", "artifact_id", "approved_candidate_sha256", "content_sha256",
  "snapshot_path", "public_enabled", "release_eligible", "bundle_entries_sha256", "entries",
]);
const BUNDLE_ENTRY_FIELDS = new Set(["path", "role", "sha256", "size_bytes"]);
const BUNDLE_MEDIA_ENTRY_FIELDS = new Set([
  ...BUNDLE_ENTRY_FIELDS, "mime_type", "width", "height", "rights_scope",
]);
const BUNDLE_ENTRY_ROLES = new Set([
  "analysis_candidate", "candidate_approval", "media_policy", "reader_snapshot", "reader_media",
  "editable_export", "editable_source", "visual_plan", "visual_qa_record", "editorial_qa_record",
]);
const BUNDLE_CORE_ENTRIES = [
  ["weekly-analysis-candidate.json", "analysis_candidate"],
  ["projection-approval.json", "candidate_approval"],
  ["publication-media-policy.json", "media_policy"],
];
const BUNDLE_SUPPORT_ENTRIES = [
  ["visual_asset_plan.json", "visual_plan"],
  ["visual_asset_log.md", "visual_qa_record"],
  ["editorial-review.md", "editorial_qa_record"],
];
const BUNDLE_SNAPSHOT_PATH = "weekly-insight-publication-v4.json";
const BUNDLE_V1_ENTRIES = [
  ...BUNDLE_CORE_ENTRIES,
  [BUNDLE_SNAPSHOT_PATH, "reader_snapshot"],
  ["media/agentforger-csrf-comparison.png", "reader_media"],
  ["media/agent-control-chain.png", "reader_media"],
  ["media/agent-control-chain.svg", "editable_export"],
  ["media/agent-control-chain.drawio", "editable_source"],
  ...BUNDLE_SUPPORT_ENTRIES,
];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngPasses(width, height, interlace) {
  if (!interlace) return [{ width, height }];
  return [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ].map(([startX, startY, stepX, stepY]) => ({
    width: width > startX ? Math.ceil((width - startX) / stepX) : 0,
    height: height > startY ? Math.ceil((height - startY) / stepY) : 0,
  })).filter((pass) => pass.width && pass.height);
}

function sniffPng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  let sawIhdr = false;
  let sawPalette = false;
  let sawIdat = false;
  let idatEnded = false;
  let sawIend = false;
  const idatChunks = [];
  while (offset + 12 <= buffer.length) {
    const chunkLength = buffer.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) throw new Error("Invalid weekly media PNG chunk length");
    const chunkTypeBuffer = buffer.subarray(offset + 4, dataStart);
    const chunkType = chunkTypeBuffer.toString("latin1");
    if (!/^[A-Za-z]{4}$/.test(chunkType)) throw new Error("Invalid weekly media PNG chunk type");
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([chunkTypeBuffer, buffer.subarray(dataStart, dataEnd)]));
    if (expectedCrc !== actualCrc) throw new Error(`Invalid weekly media PNG CRC: ${chunkType}`);
    if (!sawIhdr && chunkType !== "IHDR") throw new Error("Invalid weekly media PNG header");
    if (chunkType === "IHDR") {
      if (sawIhdr || offset !== 8 || chunkLength !== 13) throw new Error("Invalid weekly media PNG header");
      sawIhdr = true;
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      const compression = buffer[dataStart + 10];
      const filter = buffer[dataStart + 11];
      interlace = buffer[dataStart + 12];
      const allowedBitDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (
        !width || !height ||
        !allowedBitDepths[colorType]?.has(bitDepth) ||
        compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)
      ) {
        throw new Error("Invalid weekly media PNG image header");
      }
      if (height > MAX_IMAGE_PIXELS / width) {
        throw new Error("Weekly media PNG resolution exceeds 40 megapixels");
      }
    } else if (chunkType === "PLTE") {
      if (sawIdat || !chunkLength || chunkLength % 3 !== 0 || chunkLength > 768) {
        throw new Error("Invalid weekly media PNG palette");
      }
      sawPalette = true;
    } else if (chunkType === "IDAT") {
      if (idatEnded || !chunkLength) throw new Error("Invalid weekly media PNG image data");
      sawIdat = true;
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (chunkType === "IEND") {
      if (chunkLength !== 0 || !sawIdat) throw new Error("Invalid weekly media PNG end chunk");
      sawIend = true;
      offset = chunkEnd;
      break;
    } else {
      if (sawIdat) idatEnded = true;
      if (/^[A-Z]/.test(chunkType)) throw new Error(`Unsupported weekly media PNG critical chunk: ${chunkType}`);
    }
    offset = chunkEnd;
  }
  if (!sawIhdr || !sawIdat || !sawIend || offset !== buffer.length) {
    throw new Error("Incomplete weekly media PNG");
  }
  if (colorType === 3 && !sawPalette) throw new Error("Invalid weekly media PNG palette");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const passes = pngPasses(width, height, interlace);
  const passLayouts = passes.map((pass) => ({
    ...pass,
    rowBytes: Math.ceil((pass.width * channels * bitDepth) / 8),
  }));
  const decodedBytes = passLayouts.reduce((total, pass) => total + ((pass.rowBytes + 1) * pass.height), 0);
  const maxDecodedBytes = 64 * 1024 * 1024;
  if (!decodedBytes || decodedBytes > maxDecodedBytes) throw new Error("Weekly media PNG decoded image is too large");
  let decoded;
  try {
    decoded = zlib.inflateSync(Buffer.concat(idatChunks), { maxOutputLength: maxDecodedBytes });
  } catch (error) {
    throw new Error(`Invalid weekly media PNG image data: ${error.message}`);
  }
  if (decoded.length !== decodedBytes) throw new Error("Invalid weekly media PNG decoded length");
  let decodedOffset = 0;
  for (const pass of passLayouts) {
    for (let row = 0; row < pass.height; row += 1) {
      if (decoded[decodedOffset] > 4) throw new Error("Invalid weekly media PNG row filter");
      decodedOffset += pass.rowBytes + 1;
    }
  }
  return { contentType: "image/png", extension: "png", width, height };
}

const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function sniffJpeg(buffer) {
  let offset = 2;
  let width = 0;
  let height = 0;
  let sawSof = false;
  let sawSos = false;
  let sawEoi = false;
  let entropyBytes = 0;
  let frameComponentCount = 0;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error("Invalid weekly media JPEG marker");
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) throw new Error("Incomplete weekly media JPEG marker");
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x00 || marker === 0xd8) throw new Error("Invalid weekly media JPEG marker");
    if (marker === 0xd9) {
      sawEoi = true;
      if (offset !== buffer.length) throw new Error("Invalid trailing data after weekly media JPEG");
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) throw new Error("Incomplete weekly media JPEG segment");
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new Error("Invalid weekly media JPEG segment length");
    }
    const dataStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (sawSof || segmentLength < 11) throw new Error("Invalid weekly media JPEG frame");
      const componentCount = buffer[dataStart + 5];
      if (segmentLength !== 8 + (componentCount * 3)) throw new Error("Invalid weekly media JPEG frame");
      height = buffer.readUInt16BE(dataStart + 1);
      width = buffer.readUInt16BE(dataStart + 3);
      if (!width || !height || ![1, 3, 4].includes(componentCount)) {
        throw new Error("Unsupported weekly media JPEG component count");
      }
      frameComponentCount = componentCount;
      sawSof = true;
    }
    offset = segmentEnd;
    if (marker !== 0xda) continue;
    if (!sawSof || segmentLength < 8) throw new Error("Invalid weekly media JPEG scan header");
    const componentCount = buffer[dataStart];
    if (!componentCount || segmentLength !== 6 + (componentCount * 2)) {
      throw new Error("Invalid weekly media JPEG scan header");
    }
    sawSos = true;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      const markerStart = offset;
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      if (offset >= buffer.length) throw new Error("Incomplete weekly media JPEG scan");
      const scanMarker = buffer[offset];
      if (scanMarker === 0x00) {
        entropyBytes += 1;
        offset += 1;
        continue;
      }
      if (scanMarker >= 0xd0 && scanMarker <= 0xd7) {
        offset += 1;
        continue;
      }
      offset = markerStart;
      break;
    }
  }
  if (!sawSof || !sawSos || !sawEoi || !entropyBytes) {
    throw new Error("Incomplete weekly media JPEG image data");
  }
  try {
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: false,
      tolerantDecoding: false,
      maxResolutionInMP: MAX_IMAGE_PIXELS / 1_000_000,
      maxMemoryUsageInMB: 64,
    });
    // jpeg-js normalizes grayscale, RGB and CMYK/YCCK input to three-channel RGB here.
    if (decoded.width !== width || decoded.height !== height || decoded.data.length !== width * height * 3) {
      throw new Error(`decoded dimensions do not match the ${frameComponentCount}-component JPEG frame`);
    }
  } catch (error) {
    throw new Error(`Invalid weekly media JPEG decode: ${error.message}`);
  }
  return { contentType: "image/jpeg", extension: "jpg", width, height };
}

function sniffImage(buffer, declaredType = "") {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return sniffPng(buffer);
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return sniffJpeg(buffer);
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

function assertExactFields(value, allowed, context) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Invalid ${context}; unknown field: ${key}`);
  }
}

function bundleString(value, context, pattern) {
  if (typeof value !== "string" || !value || (pattern && !pattern.test(value))) {
    throw new Error(`Invalid ${context}`);
  }
  return value;
}

function isSafeBundlePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || path.isAbsolute(value)) return false;
  const parts = value.split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

async function resolveWeeklyBundleRoot(options = {}) {
  if (!options.mediaBundleRoot) throw new Error("Weekly private bundle root is required");
  const configuredRoot = path.resolve(options.mediaBundleRoot);
  try {
    const configuredRootStat = await fsp.lstat(configuredRoot);
    if (!configuredRootStat.isDirectory() || configuredRootStat.isSymbolicLink()) {
      throw new Error("not a real directory");
    }
    const root = await fsp.realpath(configuredRoot);
    const rootStat = await fsp.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("not a real directory");
    return root;
  } catch (error) {
    throw new Error("Weekly private bundle root is unavailable");
  }
}

async function resolveWeeklyBundleEntry(root, relativePath) {
  if (!isSafeBundlePath(relativePath)) throw new Error(`unsafe bundle entry path: ${relativePath}`);
  let candidate = root;
  for (const part of relativePath.split("/")) {
    candidate = path.join(candidate, part);
    const partStat = await fsp.lstat(candidate);
    if (partStat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${relativePath}`);
  }
  const resolved = await fsp.realpath(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`bundle entry escapes root: ${relativePath}`);
  }
  const stat = await fsp.lstat(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`bundle entry is not a regular file: ${relativePath}`);
  return { resolved, stat };
}

async function validateWeeklyBundleManifest(snapshot, options = {}) {
  if (snapshot.schema_version !== "weekly-insight-publication/v4" || snapshot.version !== "4.1") return null;
  const root = await resolveWeeklyBundleRoot(options);
  let manifest;
  try {
    const { resolved, stat } = await resolveWeeklyBundleEntry(root, "bundle-manifest.json");
    if (stat.size > (options.bundleManifestMaxBytes || 2 * 1024 * 1024)) {
      throw new Error("manifest is too large");
    }
    manifest = JSON.parse(await fsp.readFile(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Invalid weekly bundle manifest: ${error.message}`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Invalid weekly bundle manifest");
  }
  assertExactFields(manifest, BUNDLE_MANIFEST_FIELDS, "weekly bundle manifest");
  if (
    manifest.schema_version !== "weekly-insight-private-bundle/v1" ||
    manifest.artifact_id !== snapshot.artifact_id ||
    manifest.approved_candidate_sha256 !== snapshot.approved_candidate_sha256 ||
    manifest.content_sha256 !== snapshot.content_sha256 ||
    manifest.public_enabled !== snapshot.publication.public_enabled ||
    manifest.release_eligible !== snapshot.publication.release_eligible ||
    manifest.snapshot_path !== BUNDLE_SNAPSHOT_PATH
  ) {
    throw new Error("Invalid weekly bundle manifest identity");
  }
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) {
    throw new Error("Invalid weekly bundle manifest entries");
  }
  if (
    !/^[a-f0-9]{64}$/.test(String(manifest.bundle_entries_sha256 || "")) ||
    canonicalSha256(manifest.entries) !== manifest.bundle_entries_sha256
  ) {
    throw new Error("Invalid weekly bundle manifest entries hash");
  }

  const entries = [];
  const seenPaths = new Set();
  const roleCounts = new Map();
  const maxEntryBytes = options.bundleEntryMaxBytes || 16 * 1024 * 1024;
  const maxTotalBytes = options.bundleTotalMaxBytes || 64 * 1024 * 1024;
  if (!Number.isSafeInteger(maxEntryBytes) || maxEntryBytes <= 0) {
    throw new Error("Invalid weekly bundle manifest entry size limit");
  }
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes <= 0) {
    throw new Error("Invalid weekly bundle manifest total size limit");
  }
  let totalBytes = 0;
  for (const [index, entry] of manifest.entries.entries()) {
    const context = `weekly bundle manifest entry ${index}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid ${context}`);
    const role = bundleString(entry.role, `${context}.role`);
    if (!BUNDLE_ENTRY_ROLES.has(role)) throw new Error(`Invalid ${context}.role`);
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
    assertExactFields(entry, role === "reader_media" ? BUNDLE_MEDIA_ENTRY_FIELDS : BUNDLE_ENTRY_FIELDS, context);
    const relativePath = bundleString(entry.path, `${context}.path`);
    if (!isSafeBundlePath(relativePath) || relativePath === "bundle-manifest.json" || seenPaths.has(relativePath)) {
      throw new Error(`Invalid or duplicate ${context}.path`);
    }
    seenPaths.add(relativePath);
    bundleString(entry.sha256, `${context}.sha256`, /^[a-f0-9]{64}$/);
    if (!Number.isSafeInteger(entry.size_bytes) || entry.size_bytes < 0) throw new Error(`Invalid ${context}.size_bytes`);
    if (role === "reader_media") {
      if (entry.mime_type !== "image/png") throw new Error(`Invalid ${context}.mime_type`);
      if (!Number.isSafeInteger(entry.width) || entry.width <= 0) throw new Error(`Invalid ${context}.width`);
      if (!Number.isSafeInteger(entry.height) || entry.height <= 0) throw new Error(`Invalid ${context}.height`);
      if (!new Set(["internal_only", "public_allowed"]).has(entry.rights_scope)) {
        throw new Error(`Invalid ${context}.rights_scope`);
      }
    }
    let file;
    try {
      file = await resolveWeeklyBundleEntry(root, relativePath);
    } catch (error) {
      throw new Error(`Invalid ${context}: ${error.message}`);
    }
    if (file.stat.size !== entry.size_bytes) throw new Error(`Invalid ${context}; byte size mismatch`);
    if (file.stat.size > maxEntryBytes) throw new Error(`Invalid ${context}; entry is too large`);
    totalBytes += file.stat.size;
    if (totalBytes > maxTotalBytes) throw new Error("Invalid weekly bundle manifest; bundle is too large");
    const payload = await fsp.readFile(file.resolved);
    if (payload.length !== entry.size_bytes || sha256(payload) !== entry.sha256) {
      throw new Error(`Invalid ${context}; file receipt mismatch`);
    }
    entries.push({ ...entry, resolved: file.resolved, payload });
  }

  for (const role of [
    "analysis_candidate", "candidate_approval", "media_policy", "reader_snapshot",
    "visual_plan", "visual_qa_record", "editorial_qa_record",
  ]) {
    if (roleCounts.get(role) !== 1) throw new Error(`Invalid weekly bundle manifest authority role count: ${role}`);
  }

  if (
    entries.length !== BUNDLE_V1_ENTRIES.length ||
    BUNDLE_V1_ENTRIES.some(([entryPath, role], index) => (
      entries[index]?.path !== entryPath || entries[index]?.role !== role
    ))
  ) {
    throw new Error("Invalid weekly bundle manifest entry order");
  }
  if (options.sourcePath) {
    const configuredSourcePath = path.resolve(options.sourcePath);
    let sourceStat;
    let sourceParent;
    let sourceParentStat;
    try {
      sourceStat = await fsp.lstat(configuredSourcePath);
      sourceParentStat = await fsp.lstat(path.dirname(configuredSourcePath));
      sourceParent = await fsp.realpath(path.dirname(configuredSourcePath));
    } catch {
      throw new Error("Invalid weekly bundle manifest snapshot path");
    }
    if (
      sourceParent !== root ||
      sourceParentStat.isSymbolicLink() ||
      !sourceParentStat.isDirectory() ||
      path.basename(configuredSourcePath) !== BUNDLE_SNAPSHOT_PATH ||
      sourceStat.isSymbolicLink() ||
      !sourceStat.isFile() ||
      await fsp.realpath(configuredSourcePath) !== entries[BUNDLE_CORE_ENTRIES.length].resolved
    ) {
      throw new Error("Invalid weekly bundle manifest snapshot path");
    }
  }

  const snapshotEntry = entries[BUNDLE_CORE_ENTRIES.length];
  let manifestSnapshot;
  try {
    manifestSnapshot = validateWeeklySnapshot(JSON.parse(snapshotEntry.payload.toString("utf8")));
  } catch (error) {
    throw new Error(`Invalid weekly bundle manifest snapshot: ${error.message}`);
  }
  if (canonicalSha256(manifestSnapshot) !== canonicalSha256(snapshot)) {
    throw new Error("Invalid weekly bundle manifest snapshot identity");
  }
  const readerMediaEntries = entries.filter((entry) => entry.role === "reader_media");
  if (readerMediaEntries.length !== snapshot.content.media.length) {
    throw new Error("Invalid weekly bundle manifest reader media count");
  }
  for (const [index, media] of snapshot.content.media.entries()) {
    const entry = readerMediaEntries[index];
    if (
      entry.path !== media.asset_ref || entry.sha256 !== media.asset_sha256 ||
      entry.size_bytes !== media.size_bytes || entry.mime_type !== media.mime_type ||
      entry.width !== media.width || entry.height !== media.height ||
      entry.rights_scope !== media.rights_scope
    ) {
      throw new Error(`Invalid weekly bundle manifest reader media receipt: ${media.id}`);
    }
  }
  return { root, manifest };
}

async function loadBundledWeeklyMedia(media, options = {}) {
  let root;
  try {
    root = await resolveWeeklyBundleRoot(options);
    const { resolved, stat: assetStat } = await resolveWeeklyBundleEntry(root, media.asset_ref);
    const maxBytes = options.mediaMaxBytes || 8 * 1024 * 1024;
    if (assetStat.size > maxBytes || assetStat.size !== media.size_bytes) throw new Error("asset size mismatch");
    const buffer = await fsp.readFile(resolved);
    if (buffer.length !== media.size_bytes) throw new Error("asset changed while being read");
    if (sha256(buffer) !== media.asset_sha256) throw new Error("asset hash mismatch");
    const details = sniffImage(buffer, media.mime_type);
    if (
      details.contentType !== media.mime_type ||
      details.width !== media.width ||
      details.height !== media.height
    ) {
      throw new Error("asset metadata mismatch");
    }
    return { buffer, ...details };
  } catch (error) {
    throw new Error(`Invalid bundled weekly media ${media.id}: ${error.message}`);
  }
}

async function loadWeeklyMediaAssets(snapshot, options = {}) {
  if (!["weekly-insight-publication/v3", "weekly-insight-publication/v4"].includes(snapshot.schema_version)) {
    return [];
  }
  const loader = options.loadMedia || ((media) => defaultLoadWeeklyMedia(media, options));
  return Promise.all(snapshot.content.media.map(async (media) => {
    if (!media.asset_ref && !media.src) throw new Error(`Weekly media requires a source image: ${media.id}`);
    const loaded = media.asset_ref
      ? await loadBundledWeeklyMedia(media, options)
      : await loader(media);
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

function assertDocxFitsFeedbackLimit(manifest, maxDocxBytes) {
  if (manifest.files.docx.bytes > maxDocxBytes) {
    throw new Error(`Weekly DOCX exceeds the feedback upload limit (${maxDocxBytes} bytes)`);
  }
}

async function publishWeeklySnapshot(input, options = {}) {
  const snapshot = validateWeeklySnapshot(input);
  if (
    snapshot.schema_version === "weekly-insight-publication/v4" &&
    snapshot.content.issue_kind === "empty_preview"
  ) {
    throw new Error("v4 empty_preview cannot be published because it contains no topics");
  }
  if (!/^[a-z0-9][a-z0-9-]{2,99}$/.test(snapshot.artifact_id)) {
    throw new Error("Invalid artifact_id for publication path");
  }
  const maxDocxBytes = options.maxDocxBytes === undefined
    ? DEFAULT_WEEKLY_FEEDBACK_DOCX_MAX_BYTES
    : Number(options.maxDocxBytes);
  if (!Number.isSafeInteger(maxDocxBytes) || maxDocxBytes <= 0) {
    throw new Error("Invalid weekly feedback DOCX size limit");
  }
  const publishRoot = path.resolve(options.publishRoot || ".cache/weekly-insights");
  const htmlRenderer = options.renderHtml || renderWeeklyHtml;
  const docxRenderer = options.renderDocx || renderWeeklyDocx;
  const artifactDir = path.join(publishRoot, snapshot.artifact_id);
  const stageDir = path.join(publishRoot, `.stage-${snapshot.artifact_id}-${crypto.randomUUID()}`);
  await fsp.mkdir(publishRoot, { recursive: true });

  await validateWeeklyBundleManifest(snapshot, options);

  if (fs.existsSync(artifactDir)) {
    const existing = await readMatchingArtifact(artifactDir, snapshot);
    if (existing) {
      assertDocxFitsFeedbackLimit(existing, maxDocxBytes);
      return { ...existing, artifact_dir: artifactDir, unchanged: true };
    }
    throw new Error(`Artifact already exists with different content: ${snapshot.artifact_id}`);
  }

  try {
    await fsp.mkdir(stageDir, { recursive: false });
    const mediaAssets = await loadWeeklyMediaAssets(snapshot, options);
    const html = htmlRenderer(snapshot, { mediaAssets, feedbackMaxDocxBytes: maxDocxBytes });
    await fsp.writeFile(path.join(stageDir, "index.html"), html, "utf8");
    const docx = await docxRenderer(snapshot, { mediaAssets });
    if (!Buffer.isBuffer(docx)) throw new Error("DOCX renderer must return a Buffer");
    if (docx.length > maxDocxBytes) {
      throw new Error(`Weekly DOCX exceeds the feedback upload limit (${maxDocxBytes} bytes)`);
    }
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
      issue_kind: snapshot.content.issue_kind,
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
      assertDocxFitsFeedbackLimit(existing, maxDocxBytes);
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
