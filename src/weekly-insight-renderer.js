const crypto = require("node:crypto");
const { createZip } = require("./ooxml");

const SECTION_LABELS = {
  core_insight: "核心洞察",
  verified_facts: "已验证事实",
  evidence: "证据",
  mechanism: "机制联系",
  industry_impact: "产业影响",
  trend_assessment: "趋势判断",
  lenovo_china_implications: "联想中国区启示",
  strategic_recommendations: "期级战略建议",
  counterevidence_scope: "反证与适用边界",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch (error) {
    return null;
  }
}

function mediaMarkup(media) {
  const src = safeHttpUrl(media.src);
  const sourceUrl = safeHttpUrl(media.source_url);
  const source = sourceUrl
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(media.source_label || "查看来源")}</a>`
    : escapeHtml(media.source_label || "");
  const visual = src
    ? `<div class="insight-media__frame"><img src="${escapeHtml(src)}" alt="${escapeHtml(media.alt)}" loading="lazy" data-weekly-media><div class="insight-media__fallback" hidden>图像暂不可用 · ${escapeHtml(media.alt)}</div></div>`
    : `<div class="insight-media__frame insight-media__fallback">图像暂不可用 · ${escapeHtml(media.alt)}</div>`;
  const logic = media.logic_type && media.logic_summary
    ? `<div class="insight-media__logic" data-logic-type="${escapeHtml(media.logic_type)}"><span>${escapeHtml(media.logic_type)}</span><p>${escapeHtml(media.logic_summary)}</p></div>`
    : "";
  return `<figure class="insight-media insight-media--${escapeHtml(media.kind)}">${visual}${logic}<figcaption>${escapeHtml(media.caption)}${source ? ` <span>${source}</span>` : ""}</figcaption></figure>`;
}

function sectionMarkup(section, evidenceById, mediaById) {
  const items = section.items.length
    ? `<ul class="insight-points">${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const media = section.media_ids.map((id) => mediaById.get(id)).filter(Boolean).map(mediaMarkup).join("");
  const evidence = section.evidence_ids
    .map((id) => evidenceById.get(id))
    .filter(Boolean)
    .map((item) => {
      const sourceUrl = safeHttpUrl(item.source_url);
      const link = sourceUrl
        ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原始证据</a>`
        : "";
      return `<article class="evidence-card" id="evidence-${escapeHtml(item.id)}"><div><span class="evidence-card__role">${escapeHtml(item.role)}</span><h3>${escapeHtml(item.title)}</h3></div><p>${escapeHtml(item.note)}</p><footer>${escapeHtml(item.publisher)} · ${escapeHtml(item.published_at || item.accessed_at)} ${link}</footer></article>`;
    })
    .join("");
  return `<section class="insight-section insight-section--${escapeHtml(section.kind)}" id="${escapeHtml(section.anchor)}" data-section-anchor="${escapeHtml(section.anchor)}"><header><span>${escapeHtml(SECTION_LABELS[section.kind] || section.kind)}</span><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(section.anchor)}" aria-label="复制本节链接">#</button><h2>${escapeHtml(section.title)}</h2></header>${section.summary ? `<p class="insight-section__summary">${escapeHtml(section.summary)}</p>` : ""}${items}${media}${evidence}</section>`;
}

function renderWeeklyV1Html(snapshot) {
  const { content } = snapshot;
  const evidenceById = new Map(content.evidence.map((item) => [item.id, item]));
  const mediaById = new Map(content.media.map((item) => [item.id, item]));
  const sections = content.sections.map((section) => sectionMarkup(section, evidenceById, mediaById)).join("\n");
  const nav = content.sections.map((section, index) => `<a href="#${escapeHtml(section.anchor)}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(section.title)}</a>`).join("");
  const statusLabel = content.status === "no_selection" ? "本期无入选判断" : `${content.selected_theses} 条战略判断`;
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="weekly:artifact_id" content="${escapeHtml(snapshot.artifact_id)}">
<meta name="weekly:source_run_id" content="${escapeHtml(snapshot.source_run_id)}">
<meta name="weekly:version" content="${escapeHtml(snapshot.version)}">
<meta name="weekly:content_sha256" content="${escapeHtml(snapshot.content_sha256)}">
<title>${escapeHtml(content.title)} · 周度技术战略洞察</title>
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/weekly-insights.css">
</head><body class="weekly-page weekly-detail-page">
<header class="weekly-topbar"><a class="weekly-brand" href="/"><strong>科技情报站</strong><span>HYBRID BRIEFING DESK</span></a><nav><a href="/">每日简报</a><a href="/insights/" aria-current="page">周度洞察</a></nav></header>
<main class="weekly-shell">
<aside class="weekly-toc" aria-label="本期目录"><p>本期目录</p><button class="weekly-toc__toggle" type="button" data-toc-toggle aria-expanded="false"><span>本期目录</span><span>展开</span></button><div class="weekly-toc__links">${nav}</div><div class="weekly-toc__meta"><span>${escapeHtml(content.period.label)}</span><span>${escapeHtml(statusLabel)}</span></div></aside>
<article class="weekly-article">
<header class="insight-hero"><p class="eyebrow">WEEKLY STRATEGIC INTELLIGENCE · ${escapeHtml(content.period.label)}</p><h1>${escapeHtml(content.title)}</h1>${content.dek ? `<p>${escapeHtml(content.dek)}</p>` : ""}<div class="insight-meta"><span>观察期 ${escapeHtml(content.period.start)}—${escapeHtml(content.period.end)}</span><span>截至 ${escapeHtml(content.period.as_of)}</span><span>${escapeHtml(statusLabel)}</span></div><div class="insight-actions"><a class="button button--primary" data-word-download href="/api/insights/${escapeHtml(snapshot.artifact_id)}/word">导出 Word (.docx)</a><button class="button" type="button" data-print>打印 / PDF</button><button class="button" type="button" data-feedback-open>提交校准反馈</button></div></header>
${content.status === "no_selection" ? `<section class="empty-insight"><span>NO SELECTION</span><h2>本期没有通过证据门槛的战略判断</h2><p>没有为了凑数而发布判断。下一期继续观察。</p></section>` : sections}
<footer class="insight-receipt"><p>批准快照</p><dl><div><dt>Artifact</dt><dd>${escapeHtml(snapshot.artifact_id)}</dd></div><div><dt>Run</dt><dd>${escapeHtml(snapshot.source_run_id)}</dd></div><div><dt>Version</dt><dd>${escapeHtml(snapshot.version)}</dd></div><div><dt>Content hash</dt><dd>${escapeHtml(snapshot.content_sha256)}</dd></div></dl></footer>
</article></main>
<dialog class="feedback-dialog" data-feedback-dialog><form method="dialog"><button class="feedback-dialog__close" value="cancel" aria-label="关闭">×</button><p class="eyebrow">SECTION-LEVEL CALIBRATION</p><h2>提交校准反馈</h2><p>反馈将绑定本期 artifact、run 与内容哈希，不会直接修改分析 Skill。</p><label>反馈对应章节<select data-feedback-section><option value="overall">整期</option>${content.sections.map((section) => `<option value="${escapeHtml(section.anchor)}">${escapeHtml(section.title)}</option>`).join("")}</select></label><label>反馈内容<textarea data-feedback-text maxlength="4000" required></textarea></label><label>可选：编辑后的 Word<input type="file" accept=".docx" data-feedback-docx></label><output data-feedback-status></output><button class="button button--primary" type="button" data-feedback-submit>提交反馈</button></form></dialog>
<script src="/weekly-insights.js" defer></script></body></html>`;
}

const BODY_FONT_XML = '<w:rFonts w:ascii="PingFang SC" w:hAnsi="PingFang SC" w:eastAsia="PingFang SC" w:cs="PingFang SC" w:hint="eastAsia"/>';
const DISPLAY_FONT_XML = '<w:rFonts w:ascii="Songti SC" w:hAnsi="Songti SC" w:eastAsia="Songti SC" w:cs="Songti SC" w:hint="eastAsia"/>';
const CJK_LANGUAGE_XML = '<w:lang w:val="zh-CN" w:eastAsia="zh-CN"/>';
const DISPLAY_STYLES = new Set(["WeeklyTitle", "WeeklyHeading1"]);

function explicitRunProperties(style) {
  return `<w:rPr>${DISPLAY_STYLES.has(style) ? DISPLAY_FONT_XML : BODY_FONT_XML}${CJK_LANGUAGE_XML}</w:rPr>`;
}

function paragraphXml(text, style = "Normal", options = {}) {
  const numbering = options.bullet
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : "";
  const paragraphProperties = `<w:pPr><w:pStyle w:val="${style}"/>${numbering}</w:pPr>`;
  return `<w:p>${paragraphProperties}<w:r>${explicitRunProperties(style)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function wordBookmarkName(anchor) {
  const value = String(anchor || "");
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_");
  const safe = /^[A-Za-z]/.test(normalized) ? normalized : `section_${normalized}`;
  if (safe.length <= 40) return safe;
  const digest = crypto.createHash("sha256").update(value).digest("hex").slice(0, 10);
  return `${safe.slice(0, 29)}_${digest}`;
}

function bookmarkedHeadingXml(title, anchor, bookmarkId) {
  return `<w:p><w:pPr><w:pStyle w:val="WeeklyHeading1"/></w:pPr><w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(anchor)}"/><w:r>${explicitRunProperties("WeeklyHeading1")}<w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
}

function closeBookmarkInLastParagraph(body, bookmarkId) {
  const lastIndex = body.length - 1;
  if (lastIndex < 0 || !body[lastIndex].endsWith("</w:p>")) throw new Error("Cannot close DOCX bookmark outside a paragraph");
  body[lastIndex] = body[lastIndex].replace(/<\/w:p>$/, `<w:bookmarkEnd w:id="${bookmarkId}"/></w:p>`);
}

function stylesXml() {
  const run = (extra = "", display = false) => `<w:rPr>${display ? DISPLAY_FONT_XML : BODY_FONT_XML}${CJK_LANGUAGE_XML}${extra}</w:rPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault>${run('<w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="24211D"/>')}</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="24211D"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyKicker"><w:name w:val="Weekly Kicker"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklyTitle"/><w:pPr><w:spacing w:before="0" w:after="100"/><w:keepNext/></w:pPr>${run('<w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="2F6B5B"/><w:caps/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyTitle"><w:name w:val="Weekly Title"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklySubtitle"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="120"/><w:keepNext/><w:keepLines/></w:pPr>${run('<w:b/><w:sz w:val="56"/><w:szCs w:val="56"/><w:color w:val="24211D"/>', true)}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklySubtitle"><w:name w:val="Weekly Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklyMeta"/><w:pPr><w:spacing w:before="0" w:after="200" w:line="288" w:lineRule="auto"/><w:keepNext/></w:pPr>${run('<w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="5F5A52"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyMeta"><w:name w:val="Weekly Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="746F67"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyHeading1"><w:name w:val="Weekly Heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklySummary"/><w:qFormat/><w:uiPriority w:val="9"/><w:pPr><w:spacing w:before="320" w:after="160"/><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr>${run('<w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2F6B5B"/>', true)}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklySummary"><w:name w:val="Weekly Summary"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:keepNext/></w:pPr>${run('<w:b/><w:sz w:val="23"/><w:szCs w:val="23"/><w:color w:val="2B2925"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyBullet"><w:name w:val="Weekly Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="22"/><w:szCs w:val="22"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyEvidence"><w:name w:val="Weekly Evidence"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="20" w:after="70" w:line="240" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="6C675F"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyReceipt"><w:name w:val="Weekly Receipt"/><w:basedOn w:val="WeeklyMeta"/><w:pPr><w:spacing w:after="30" w:line="220" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="777168"/>')}</w:style>
</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr>${BODY_FONT_XML}<w:sz w:val="22"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function fontTableXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Aptos"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="PingFang SC"><w:altName w:val="Microsoft YaHei"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="Georgia"><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font><w:font w:name="Songti SC"><w:altName w:val="SimSun"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font></w:fonts>`;
}

function imageDrawingXml(media, asset) {
  const maxWidth = 5_900_000;
  const maxHeight = 4_300_000;
  const emuPerPixel = 9_525;
  const width = Math.max(Number(asset.width) || 1600, 1) * emuPerPixel;
  const height = Math.max(Number(asset.height) || 900, 1) * emuPerPixel;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const cx = Math.round(width * scale);
  const cy = Math.round(height * scale);
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="100"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${asset.drawingId}" name="${escapeXml(media.id)}" descr="${escapeXml(media.alt)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${asset.drawingId}" name="${escapeXml(media.id)}" descr="${escapeXml(media.alt)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${asset.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function packageWeeklyDocx(snapshot, body, sectionBookmarks, mediaAssets = []) {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>`;
  const customProps = [
    ["artifact_id", snapshot.artifact_id],
    ["source_run_id", snapshot.source_run_id],
    ["version", snapshot.version],
    ["content_sha256", snapshot.content_sha256],
    ["section_anchors", snapshot.section_anchors.join(",")],
    ["section_bookmarks", JSON.stringify(sectionBookmarks)],
  ].map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${escapeXml(name)}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`).join("");
  const imageContentTypes = [...new Map(mediaAssets.map((asset) => [asset.extension, asset.contentType])).entries()]
    .map(([extension, contentType]) => `<Default Extension="${escapeXml(extension)}" ContentType="${escapeXml(contentType)}"/>`)
    .join("");
  const imageRelationships = mediaAssets.map((asset) => `<Relationship Id="${asset.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(asset.entryName)}"/>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imageContentTypes}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`],
    ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${imageRelationships}</Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(snapshot.content.title)}</dc:title><dc:creator>Daily Tech Weekly Insight</dc:creator></cp:coreProperties>`],
    ["docProps/custom.xml", `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${customProps}</Properties>`],
    ["word/document.xml", documentXml],
    ["word/styles.xml", stylesXml()],
    ["word/numbering.xml", numberingXml()],
    ["word/fontTable.xml", fontTableXml()],
    ["word/footer1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr>${BODY_FONT_XML}${CJK_LANGUAGE_XML}<w:color w:val="8A847B"/><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(`${snapshot.content.period.label} · 周度技术战略洞察`)}</w:t></w:r></w:p></w:ftr>`],
    ...mediaAssets.map((asset) => [`word/media/${asset.entryName}`, asset.buffer]),
  ];
  return createZip(entries);
}

function renderWeeklyV1Docx(snapshot) {
  let bookmarkId = 1;
  const sectionBookmarks = Object.fromEntries(
    snapshot.content.sections.map((section) => [section.anchor, wordBookmarkName(section.anchor)]),
  );
  const body = [
    paragraphXml("周度技术战略洞察 · INTERNAL PREVIEW", "WeeklyKicker"),
    paragraphXml(snapshot.content.title, "WeeklyTitle"),
    paragraphXml(snapshot.content.dek || "", "WeeklySubtitle"),
    paragraphXml(`观察期：${snapshot.content.period.start}—${snapshot.content.period.end} · ${snapshot.content.period.label}`, "WeeklyMeta"),
    paragraphXml(`截至：${snapshot.content.period.as_of} · ${snapshot.content.selected_theses} 条战略判断`, "WeeklyMeta"),
  ];
  for (const section of snapshot.content.sections) {
    const id = bookmarkId++;
    body.push(bookmarkedHeadingXml(section.title, sectionBookmarks[section.anchor], id));
    if (section.summary) body.push(paragraphXml(section.summary, "WeeklySummary"));
    for (const item of section.items) body.push(paragraphXml(item, "WeeklyBullet", { bullet: true }));
    for (const evidenceId of section.evidence_ids) {
      const evidence = snapshot.content.evidence.find((item) => item.id === evidenceId);
      if (evidence) body.push(paragraphXml(`证据：${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`, "WeeklyEvidence"));
    }
    closeBookmarkInLastParagraph(body, id);
  }
  if (snapshot.content.status === "no_selection") {
    body.push(paragraphXml("本期没有通过证据门槛的战略判断。", "WeeklyHeading1"));
  }
  body.push(paragraphXml("版本与反馈绑定信息", "WeeklyHeading1"));
  body.push(paragraphXml(`Artifact: ${snapshot.artifact_id}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Run: ${snapshot.source_run_id} · Version: ${snapshot.version}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Content SHA-256: ${snapshot.content_sha256}`, "WeeklyReceipt"));
  return packageWeeklyDocx(snapshot, body, sectionBookmarks);
}

function contentParagraphs(paragraphs) {
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function synthesisParagraphs(paragraphs) {
  return paragraphs.map((paragraph, index) => (
    `<p${index === 0 ? ' class="weekly-synthesis__lead"' : ""}>${escapeHtml(paragraph)}</p>`
  )).join("");
}

function pointList(items) {
  return items.length
    ? `<ul class="insight-points">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
}

function referenceLinks(evidenceIds, evidenceById) {
  const links = evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean).map((item) => (
    `<a href="#evidence-${escapeHtml(item.id)}" aria-label="查看证据 ${item.reference_number}">[${item.reference_number}]</a>`
  ));
  return links.length ? `<footer class="topic-references"><span>证据</span>${links.join("")}</footer>` : "";
}

function v2AnalysisBlockMarkup(block, evidenceById, mediaById) {
  const media = block.media_ids.map((id) => mediaById.get(id)).filter(Boolean).map(mediaMarkup).join("");
  return `<section class="topic-analysis-block topic-analysis-block--${escapeHtml(block.kind)}" id="${escapeHtml(block.anchor)}" data-section-anchor="${escapeHtml(block.anchor)}"><header><span>${escapeHtml(block.title)}</span><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(block.anchor)}" aria-label="复制本节链接">#</button></header><h3>${escapeHtml(block.headline)}</h3>${contentParagraphs(block.paragraphs)}${pointList(block.items)}${media}${referenceLinks(block.evidence_ids, evidenceById)}</section>`;
}

function v2ArticleSectionMarkup(block, evidenceById, mediaById, sequence) {
  const media = block.media_ids.map((id) => mediaById.get(id)).filter(Boolean).map(mediaMarkup).join("");
  const visualClass = media ? " topic-story--with-visual" : "";
  const structured = block.items.length
    ? `<div class="topic-story__structured">${pointList(block.items)}</div>`
    : "";
  return `<section class="topic-story topic-story--${escapeHtml(block.kind)}${visualClass}" id="${escapeHtml(block.anchor)}" data-section-anchor="${escapeHtml(block.anchor)}"><header class="topic-story__heading"><span class="topic-story__number">${String(sequence).padStart(2, "0")}</span><h3>${escapeHtml(block.title)}</h3><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(block.anchor)}" aria-label="复制本节链接">#</button></header><div class="topic-story__content"><div class="topic-story__prose">${contentParagraphs(block.paragraphs)}</div>${media ? `<div class="topic-story__visuals">${media}</div>` : ""}</div>${structured}${referenceLinks(block.evidence_ids, evidenceById)}</section>`;
}

function v2PresentationSheetsMarkup(sections, evidenceById, mediaById) {
  const sheets = [];
  for (let index = 0; index < sections.length; index += 2) {
    const stories = sections.slice(index, index + 2).map((section, offset) => (
      v2ArticleSectionMarkup(section, evidenceById, mediaById, index + offset + 1)
    )).join("");
    sheets.push(`<div class="topic-presentation-sheet" data-topic-sheet="${Math.floor(index / 2) + 1}">${stories}</div>`);
  }
  return `<div class="topic-presentation-deck">${sheets.join("")}</div>`;
}

function renderWeeklyV2Html(snapshot) {
  const { content } = snapshot;
  const evidenceById = new Map(content.evidence.map((item, index) => [item.id, { ...item, reference_number: index + 1 }]));
  const mediaById = new Map(content.media.map((item) => [item.id, item]));
  const statusLabel = content.status === "no_selection" ? "本期无入选专题" : `${content.selected_topics} 个技术专题`;
  const navItems = [
    ...(content.weekly_synthesis ? [{ anchor: "weekly-synthesis", title: "本期技术主线" }] : []),
    ...content.topics.map((topic) => ({ anchor: topic.topic_id, title: topic.title })),
    ...(content.strategic_recommendations.length ? [{ anchor: "strategic-recommendations", title: "期级战略建议" }] : []),
    ...(content.evidence.length ? [{ anchor: "evidence-sources", title: "证据来源" }] : []),
  ];
  const nav = navItems.map((item, index) => `<a href="#${escapeHtml(item.anchor)}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(item.title)}</a>`).join("");
  const synthesis = content.weekly_synthesis
    ? `<section class="weekly-synthesis" id="weekly-synthesis"><p class="eyebrow">WEEKLY SYNTHESIS</p><h2>${escapeHtml(content.weekly_synthesis.title)}</h2>${synthesisParagraphs(content.weekly_synthesis.paragraphs)}</section>`
    : "";
  const topics = content.topics.map((topic, topicIndex) => {
    const article = v2PresentationSheetsMarkup(topic.article_sections, evidenceById, mediaById);
    const impact = v2AnalysisBlockMarkup(topic.industry_impact, evidenceById, mediaById);
    const lenovo = v2AnalysisBlockMarkup(topic.lenovo_china_implication, evidenceById, mediaById);
    return `<article class="technical-topic" id="${escapeHtml(topic.topic_id)}"><header class="technical-topic__hero"><p class="technical-topic__number">专题 ${String(topicIndex + 1).padStart(2, "0")} / ${String(content.selected_topics).padStart(2, "0")}</p><h2>${escapeHtml(topic.title)}</h2></header>${article}<div class="topic-analysis-pair">${impact}${lenovo}</div></article>`;
  }).join("");
  const recommendations = content.strategic_recommendations.length
    ? `<section class="issue-recommendations" id="strategic-recommendations"><p class="eyebrow">ISSUE-LEVEL ACTION</p><h2>期级战略建议</h2>${content.strategic_recommendations.map((item, index) => `<article id="${escapeHtml(item.anchor)}" data-section-anchor="${escapeHtml(item.anchor)}"><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.headline)}</h3><p>${escapeHtml(item.rationale)}</p><h4>建议动作</h4><p>${escapeHtml(item.action)}</p><footer>${escapeHtml(item.decision_window)}</footer></article>`).join("")}</section>`
    : "";
  const evidence = content.evidence.length
    ? `<section class="evidence-sources" id="evidence-sources"><p class="eyebrow">SOURCE NOTES</p><h2>证据来源</h2>${content.evidence.map((item, index) => { const url = safeHttpUrl(item.source_url); return `<article class="evidence-card" id="evidence-${escapeHtml(item.id)}"><span class="evidence-number">[${index + 1}]</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note)}</p><footer>${escapeHtml(item.publisher)} · ${escapeHtml(item.published_at || item.accessed_at)}${url ? ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看原始证据</a>` : ""}</footer></div></article>`; }).join("")}</section>`
    : "";
  const feedbackOptions = content.topics.flatMap((topic, topicIndex) => [
    ...topic.article_sections.map((section) => ({ anchor: section.anchor, title: `专题 ${topicIndex + 1} · ${section.title}` })),
    { anchor: topic.industry_impact.anchor, title: `专题 ${topicIndex + 1} · 产业影响` },
    { anchor: topic.lenovo_china_implication.anchor, title: `专题 ${topicIndex + 1} · 联想中国区启示` },
  ]).concat(content.strategic_recommendations.map((item, index) => ({ anchor: item.anchor, title: `期级战略建议 ${index + 1}` })));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="weekly:artifact_id" content="${escapeHtml(snapshot.artifact_id)}"><meta name="weekly:source_run_id" content="${escapeHtml(snapshot.source_run_id)}"><meta name="weekly:version" content="${escapeHtml(snapshot.version)}"><meta name="weekly:content_sha256" content="${escapeHtml(snapshot.content_sha256)}"><title>${escapeHtml(content.title)} · 周度技术战略洞察</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/weekly-insights.css"></head><body class="weekly-page weekly-detail-page weekly-detail-page--v2"><header class="weekly-topbar"><a class="weekly-brand" href="/"><strong>科技情报站</strong><span>HYBRID BRIEFING DESK</span></a><nav><a href="/">每日简报</a><a href="/insights/" aria-current="page">周度洞察</a></nav></header><main class="weekly-shell"><aside class="weekly-toc" aria-label="本期目录"><p>本期目录</p><button class="weekly-toc__toggle" type="button" data-toc-toggle aria-expanded="false"><span>本期目录</span><span>展开</span></button><div class="weekly-toc__links">${nav}</div><div class="weekly-toc__meta"><span>${escapeHtml(content.period.label)}</span><span>${escapeHtml(statusLabel)}</span></div></aside><article class="weekly-article"><header class="insight-hero"><p class="eyebrow">WEEKLY STRATEGIC INTELLIGENCE · ${escapeHtml(content.period.label)}</p><span class="internal-preview-state">内部预览 · 未公开</span><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.dek)}</p><div class="insight-meta"><span>观察期 ${escapeHtml(content.period.start)}—${escapeHtml(content.period.end)}</span><span>截至 ${escapeHtml(content.period.as_of)}</span><span>${escapeHtml(statusLabel)}</span></div><div class="insight-actions"><a class="button button--primary" data-word-download href="/api/insights/${escapeHtml(snapshot.artifact_id)}/word">导出 Word (.docx)</a><button class="button" type="button" data-print>打印 / PDF</button><button class="button" type="button" data-feedback-open>提交校准反馈</button></div></header>${content.status === "no_selection" ? `<section class="empty-insight"><span>NO SELECTION</span><h2>本期没有通过证据门槛的技术专题</h2><p>没有为了凑数而发布专题。下一期继续观察。</p></section>` : `${synthesis}${topics}${recommendations}${evidence}`}<footer class="insight-receipt"><p>批准快照</p><dl><div><dt>Artifact</dt><dd>${escapeHtml(snapshot.artifact_id)}</dd></div><div><dt>Run</dt><dd>${escapeHtml(snapshot.source_run_id)}</dd></div><div><dt>Version</dt><dd>${escapeHtml(snapshot.version)}</dd></div><div><dt>Content hash</dt><dd>${escapeHtml(snapshot.content_sha256)}</dd></div></dl></footer></article></main><dialog class="feedback-dialog" data-feedback-dialog><form method="dialog"><button class="feedback-dialog__close" value="cancel" aria-label="关闭">×</button><p class="eyebrow">SECTION-LEVEL CALIBRATION</p><h2>提交校准反馈</h2><p>反馈绑定本期 artifact、run 与初稿哈希，不会直接修改分析 Skill。</p><label>反馈对应章节<select data-feedback-section><option value="overall">整期</option>${feedbackOptions.map((item) => `<option value="${escapeHtml(item.anchor)}">${escapeHtml(item.title)}</option>`).join("")}</select></label><label>反馈内容<textarea data-feedback-text maxlength="4000" required></textarea></label><label>可选：编辑后的 Word<input type="file" accept=".docx" data-feedback-docx></label><output data-feedback-status></output><button class="button button--primary" type="button" data-feedback-submit>提交反馈</button></form></dialog><script src="/weekly-insights.js" defer></script></body></html>`;
}

function pushV2BookmarkedBlock(body, block, sectionBookmarks, bookmarkId, evidenceById) {
  body.push(bookmarkedHeadingXml(block.title, sectionBookmarks[block.anchor], bookmarkId));
  if (block.headline) body.push(paragraphXml(block.headline, "WeeklySummary"));
  for (const paragraph of block.paragraphs) body.push(paragraphXml(paragraph));
  for (const item of block.items) body.push(paragraphXml(item, "WeeklyBullet", { bullet: true }));
  for (const evidenceId of block.evidence_ids) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence) body.push(paragraphXml(`证据：${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`, "WeeklyEvidence"));
  }
  closeBookmarkInLastParagraph(body, bookmarkId);
}

function renderWeeklyV2Docx(snapshot) {
  const sectionBookmarks = Object.fromEntries(snapshot.section_anchors.map((anchor) => [anchor, wordBookmarkName(anchor)]));
  const evidenceById = new Map(snapshot.content.evidence.map((item) => [item.id, item]));
  const body = [
    paragraphXml("周度技术战略洞察 · INTERNAL PREVIEW", "WeeklyKicker"),
    paragraphXml(snapshot.content.title, "WeeklyTitle"),
    paragraphXml(snapshot.content.dek, "WeeklySubtitle"),
    paragraphXml(`观察期：${snapshot.content.period.start}—${snapshot.content.period.end} · ${snapshot.content.period.label}`, "WeeklyMeta"),
    paragraphXml(`截至：${snapshot.content.period.as_of} · ${snapshot.content.selected_topics} 个技术专题`, "WeeklyMeta"),
  ];
  if (snapshot.content.weekly_synthesis) {
    body.push(paragraphXml(snapshot.content.weekly_synthesis.title, "WeeklyHeading1"));
    for (const paragraph of snapshot.content.weekly_synthesis.paragraphs) body.push(paragraphXml(paragraph));
  }
  let bookmarkId = 1;
  for (const [topicIndex, topic] of snapshot.content.topics.entries()) {
    body.push(paragraphXml(`专题 ${topicIndex + 1}`, "WeeklyKicker"));
    body.push(paragraphXml(topic.title, "WeeklyHeading1"));
    for (const section of topic.article_sections) {
      pushV2BookmarkedBlock(body, section, sectionBookmarks, bookmarkId++, evidenceById);
    }
    pushV2BookmarkedBlock(body, topic.industry_impact, sectionBookmarks, bookmarkId++, evidenceById);
    pushV2BookmarkedBlock(body, topic.lenovo_china_implication, sectionBookmarks, bookmarkId++, evidenceById);
  }
  if (snapshot.content.strategic_recommendations.length) {
    body.push(paragraphXml("期级战略建议", "WeeklyHeading1"));
    for (const recommendation of snapshot.content.strategic_recommendations) {
      const id = bookmarkId++;
      body.push(bookmarkedHeadingXml(recommendation.headline, sectionBookmarks[recommendation.anchor], id));
      body.push(paragraphXml(recommendation.rationale));
      body.push(paragraphXml(`建议动作：${recommendation.action}`, "WeeklySummary"));
      body.push(paragraphXml(`决策窗口：${recommendation.decision_window}`, "WeeklyMeta"));
      closeBookmarkInLastParagraph(body, id);
    }
  }
  if (snapshot.content.evidence.length) {
    body.push(paragraphXml("证据来源", "WeeklyHeading1"));
    for (const evidence of snapshot.content.evidence) {
      body.push(paragraphXml(`${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`, "WeeklyEvidence"));
      if (evidence.note) body.push(paragraphXml(evidence.note));
    }
  }
  if (snapshot.content.status === "no_selection") body.push(paragraphXml("本期没有通过证据门槛的技术专题。", "WeeklyHeading1"));
  body.push(paragraphXml("版本与反馈绑定信息", "WeeklyHeading1"));
  body.push(paragraphXml(`Artifact: ${snapshot.artifact_id}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Run: ${snapshot.source_run_id} · Version: ${snapshot.version}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Content SHA-256: ${snapshot.content_sha256}`, "WeeklyReceipt"));
  return packageWeeklyDocx(snapshot, body, sectionBookmarks);
}

function v3MediaNotesMarkup(mediaIds, mediaById) {
  return mediaIds.map((id) => mediaById.get(id)).filter(Boolean).map(mediaMarkup).join("");
}

function v3EvidenceLinks(evidenceIds, evidenceById) {
  return referenceLinks(evidenceIds, evidenceById);
}

function renderWeeklyV3Html(snapshot) {
  const { content } = snapshot;
  const evidenceById = new Map(content.evidence.map((item, index) => [item.id, { ...item, reference_number: index + 1 }]));
  const mediaById = new Map(content.media.map((item) => [item.id, item]));
  const statusLabel = content.status === "no_selection" ? "本期无入选专题" : `${content.selected_topics} 个技术专题`;
  const navItems = [
    ...(content.weekly_synthesis ? [{ anchor: "weekly-synthesis", title: "本期主线" }] : []),
    ...content.topics.map((topic) => ({ anchor: topic.topic_id, title: topic.title })),
    ...(content.strategic_recommendations.length ? [{ anchor: "strategic-recommendations", title: content.recommendation_title }] : []),
    ...(content.evidence.length ? [{ anchor: "evidence-sources", title: "证据来源" }] : []),
  ];
  const nav = navItems.map((item, index) => `<a href="#${escapeHtml(item.anchor)}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(item.title)}</a>`).join("");
  const synthesis = content.weekly_synthesis
    ? `<section class="weekly-synthesis" id="weekly-synthesis"><p class="eyebrow">本期主线</p><h2>${escapeHtml(content.weekly_synthesis.title)}</h2>${synthesisParagraphs(content.weekly_synthesis.paragraphs)}</section>`
    : "";
  const topics = content.topics.map((topic, topicIndex) => {
    const facts = `<section class="topic-story topic-story--facts${topic.facts.media_ids.length ? " topic-story--with-visual" : ""}" id="${escapeHtml(topic.facts.anchor)}" data-section-anchor="${escapeHtml(topic.facts.anchor)}"><header class="topic-story__heading"><span class="topic-story__number">01</span><h3>${escapeHtml(topic.facts.title)}</h3><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(topic.facts.anchor)}" aria-label="复制本节链接">#</button></header><div class="topic-story__content"><div class="topic-story__prose">${contentParagraphs(topic.facts.paragraphs)}${pointList(topic.facts.items)}${topic.facts.terms.length ? `<dl class="topic-terms">${topic.facts.terms.map((term) => `<div><dt>${escapeHtml(term.term)}</dt><dd>${escapeHtml(term.explanation)}</dd></div>`).join("")}</dl>` : ""}</div>${topic.facts.media_ids.length ? `<div class="topic-story__visuals">${v3MediaNotesMarkup(topic.facts.media_ids, mediaById)}</div>` : ""}</div>${v3EvidenceLinks(topic.facts.evidence_ids, evidenceById)}</section>`;
    const findings = topic.findings.map((finding, findingIndex) => `<section class="topic-finding" id="${escapeHtml(finding.finding_id)}" data-section-anchor="${escapeHtml(finding.finding_id)}"><header><span>发现 ${String(findingIndex + 1).padStart(2, "0")}</span><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(finding.finding_id)}" aria-label="复制本节链接">#</button></header><h3>${escapeHtml(finding.headline)}</h3>${contentParagraphs(finding.paragraphs)}${v3EvidenceLinks(finding.evidence_ids, evidenceById)}</section>`).join("");
    const impact = `<section class="topic-analysis-block topic-analysis-block--industry_impact" id="${escapeHtml(topic.industry_impact.anchor)}" data-section-anchor="${escapeHtml(topic.industry_impact.anchor)}"><header><span>${escapeHtml(topic.industry_impact.title)}</span><button type="button" class="anchor-copy" data-copy-anchor="${escapeHtml(topic.industry_impact.anchor)}" aria-label="复制本节链接">#</button></header><h3>${escapeHtml(topic.industry_impact.headline)}</h3>${contentParagraphs(topic.industry_impact.paragraphs)}${pointList(topic.industry_impact.items)}${v3MediaNotesMarkup(topic.industry_impact.media_ids, mediaById)}${v3EvidenceLinks(topic.industry_impact.evidence_ids, evidenceById)}</section>`;
    return `<article class="technical-topic technical-topic--v3" id="${escapeHtml(topic.topic_id)}"><header class="technical-topic__hero"><p class="technical-topic__number">专题 ${String(topicIndex + 1).padStart(2, "0")} / ${String(content.selected_topics).padStart(2, "0")}</p><h2>${escapeHtml(topic.title)}</h2></header><div class="topic-presentation-deck"><div class="topic-presentation-sheet">${facts}</div><div class="topic-presentation-sheet topic-presentation-sheet--findings"><div class="topic-findings"><p class="eyebrow">发现</p>${findings}</div>${impact}</div></div></article>`;
  }).join("");
  const recommendations = content.strategic_recommendations.length
    ? `<section class="issue-recommendations issue-recommendations--v3" id="strategic-recommendations"><p class="eyebrow">面向整期</p><h2>${escapeHtml(content.recommendation_title)}</h2>${content.strategic_recommendations.map((item, index) => `<article id="${escapeHtml(item.anchor)}" data-section-anchor="${escapeHtml(item.anchor)}"><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(item.headline)}</h3><p>${escapeHtml(item.rationale)}</p><h4>建议动作</h4><p>${escapeHtml(item.action)}</p><footer>${escapeHtml(item.decision_window)}</footer></article>`).join("")}</section>`
    : "";
  const evidence = content.evidence.length
    ? `<section class="evidence-sources" id="evidence-sources"><p class="eyebrow">证据与脚注</p><h2>证据来源</h2>${content.evidence.map((item, index) => { const url = safeHttpUrl(item.source_url); return `<article class="evidence-card" id="evidence-${escapeHtml(item.id)}"><span class="evidence-number">[${index + 1}]</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.note)}</p><footer>${escapeHtml(item.publisher)} · ${escapeHtml(item.published_at || item.accessed_at)}${url ? ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">查看原始证据</a>` : ""}</footer></div></article>`; }).join("")}</section>`
    : "";
  const feedbackOptions = content.topics.flatMap((topic, topicIndex) => [
    { anchor: topic.facts.anchor, title: `专题 ${topicIndex + 1} · 事实与案例` },
    ...topic.findings.map((finding, findingIndex) => ({ anchor: finding.finding_id, title: `专题 ${topicIndex + 1} · 发现 ${findingIndex + 1}` })),
    { anchor: topic.industry_impact.anchor, title: `专题 ${topicIndex + 1} · 产业影响` },
  ]).concat(content.strategic_recommendations.map((item, index) => ({ anchor: item.anchor, title: `战略建议 ${index + 1}` })));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="weekly:artifact_id" content="${escapeHtml(snapshot.artifact_id)}"><meta name="weekly:source_run_id" content="${escapeHtml(snapshot.source_run_id)}"><meta name="weekly:version" content="${escapeHtml(snapshot.version)}"><meta name="weekly:content_sha256" content="${escapeHtml(snapshot.content_sha256)}"><title>${escapeHtml(content.title)} · 周度技术战略洞察</title><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/weekly-insights.css"></head><body class="weekly-page weekly-detail-page weekly-detail-page--v3"><header class="weekly-topbar"><a class="weekly-brand" href="/"><strong>科技情报站</strong><span>HYBRID BRIEFING DESK</span></a><nav><a href="/">每日简报</a><a href="/insights/" aria-current="page">周度洞察</a></nav></header><main class="weekly-shell"><aside class="weekly-toc" aria-label="本期目录"><p>本期目录</p><button class="weekly-toc__toggle" type="button" data-toc-toggle aria-expanded="false"><span>本期目录</span><span>展开</span></button><div class="weekly-toc__links">${nav}</div><div class="weekly-toc__meta"><span>${escapeHtml(content.period.label)}</span><span>${escapeHtml(statusLabel)}</span></div></aside><article class="weekly-article"><header class="insight-hero"><p class="eyebrow">周度技术战略洞察 · ${escapeHtml(content.period.label)}</p><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.dek)}</p><div class="insight-meta"><span>观察期 ${escapeHtml(content.period.start)}—${escapeHtml(content.period.end)}</span><span>截至 ${escapeHtml(content.period.as_of)}</span><span>${escapeHtml(statusLabel)}</span></div><div class="insight-actions"><a class="button button--primary" data-word-download href="/api/insights/${escapeHtml(snapshot.artifact_id)}/word">导出 Word (.docx)</a><button class="button" type="button" data-print>打印 / PDF</button><button class="button" type="button" data-feedback-open>提交校准反馈</button></div></header>${content.status === "no_selection" ? `<section class="empty-insight"><span>NO SELECTION</span><h2>本期没有通过证据门槛的技术专题</h2><p>没有为了凑数而发布专题。下一期继续观察。</p></section>` : `${synthesis}${topics}${recommendations}${evidence}`}<footer class="insight-receipt"><p>批准快照</p><dl><div><dt>Artifact</dt><dd>${escapeHtml(snapshot.artifact_id)}</dd></div><div><dt>Run</dt><dd>${escapeHtml(snapshot.source_run_id)}</dd></div><div><dt>Version</dt><dd>${escapeHtml(snapshot.version)}</dd></div><div><dt>Content hash</dt><dd>${escapeHtml(snapshot.content_sha256)}</dd></div></dl></footer></article></main><dialog class="feedback-dialog" data-feedback-dialog><form method="dialog"><button class="feedback-dialog__close" value="cancel" aria-label="关闭">×</button><p class="eyebrow">章节级校准</p><h2>提交校准反馈</h2><p>反馈绑定本期 artifact、run 与初稿哈希，不会直接修改分析 Skill。</p><label>反馈对应章节<select data-feedback-section><option value="overall">整期</option>${feedbackOptions.map((item) => `<option value="${escapeHtml(item.anchor)}">${escapeHtml(item.title)}</option>`).join("")}</select></label><label>反馈内容<textarea data-feedback-text maxlength="4000" required></textarea></label><label>可选：编辑后的 Word<input type="file" accept=".docx" data-feedback-docx></label><output data-feedback-status></output><button class="button button--primary" type="button" data-feedback-submit>提交反馈</button></form></dialog><script src="/weekly-insights.js" defer></script></body></html>`;
}

function pushV3MediaNotesDocx(body, mediaIds, mediaById, assetById) {
  for (const mediaId of mediaIds) {
    const media = mediaById.get(mediaId);
    if (!media) continue;
    const asset = assetById.get(mediaId);
    if (asset) body.push(imageDrawingXml(media, asset));
    if (media.logic_type && media.logic_summary) {
      body.push(paragraphXml(`图示关系（${media.logic_type}）：${media.logic_summary}`, "WeeklySummary"));
    }
    body.push(paragraphXml(`图注：${media.caption}｜来源：${media.source_label}｜${media.source_url}｜使用权：${media.usage_rights || ""}`, "WeeklyEvidence"));
  }
}

function pushV3EvidenceNotesDocx(body, evidenceIds, evidenceById) {
  for (const evidenceId of evidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence) body.push(paragraphXml(`证据：${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`, "WeeklyEvidence"));
  }
}

function renderWeeklyV3Docx(snapshot, options = {}) {
  const sectionBookmarks = Object.fromEntries(snapshot.section_anchors.map((anchor) => [anchor, wordBookmarkName(anchor)]));
  const evidenceById = new Map(snapshot.content.evidence.map((item) => [item.id, item]));
  const mediaById = new Map(snapshot.content.media.map((item) => [item.id, item]));
  const mediaAssets = (options.mediaAssets || []).map((asset, index) => ({
    ...asset,
    drawingId: index + 1,
    relationshipId: `rId${index + 5}`,
    entryName: `${index + 1}-${String(asset.id).replace(/[^A-Za-z0-9_-]/g, "-")}.${asset.extension}`,
  }));
  const assetById = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const body = [
    paragraphXml("周度技术战略洞察", "WeeklyKicker"),
    paragraphXml(snapshot.content.title, "WeeklyTitle"),
    paragraphXml(snapshot.content.dek, "WeeklySubtitle"),
    paragraphXml(`观察期：${snapshot.content.period.start}—${snapshot.content.period.end} · ${snapshot.content.period.label}`, "WeeklyMeta"),
    paragraphXml(`截至：${snapshot.content.period.as_of} · ${snapshot.content.selected_topics} 个技术专题`, "WeeklyMeta"),
  ];
  if (snapshot.content.weekly_synthesis) {
    body.push(paragraphXml(snapshot.content.weekly_synthesis.title, "WeeklyHeading1"));
    for (const paragraph of snapshot.content.weekly_synthesis.paragraphs) body.push(paragraphXml(paragraph));
  }
  let bookmarkId = 1;
  for (const [topicIndex, topic] of snapshot.content.topics.entries()) {
    body.push(paragraphXml(`专题 ${topicIndex + 1}`, "WeeklyKicker"));
    body.push(paragraphXml(topic.title, "WeeklyHeading1"));
    let id = bookmarkId++;
    body.push(bookmarkedHeadingXml(topic.facts.title, sectionBookmarks[topic.facts.anchor], id));
    for (const paragraph of topic.facts.paragraphs) body.push(paragraphXml(paragraph));
    for (const item of topic.facts.items) body.push(paragraphXml(item, "WeeklyBullet", { bullet: true }));
    for (const term of topic.facts.terms) body.push(paragraphXml(`术语｜${term.term}：${term.explanation}`, "WeeklyEvidence"));
    pushV3MediaNotesDocx(body, topic.facts.media_ids, mediaById, assetById);
    pushV3EvidenceNotesDocx(body, topic.facts.evidence_ids, evidenceById);
    closeBookmarkInLastParagraph(body, id);
    for (const [findingIndex, finding] of topic.findings.entries()) {
      id = bookmarkId++;
      body.push(paragraphXml(`发现 ${findingIndex + 1}`, "WeeklyKicker"));
      body.push(bookmarkedHeadingXml(finding.headline, sectionBookmarks[finding.finding_id], id));
      for (const paragraph of finding.paragraphs) body.push(paragraphXml(paragraph));
      pushV3EvidenceNotesDocx(body, finding.evidence_ids, evidenceById);
      closeBookmarkInLastParagraph(body, id);
    }
    id = bookmarkId++;
    body.push(bookmarkedHeadingXml(topic.industry_impact.title, sectionBookmarks[topic.industry_impact.anchor], id));
    body.push(paragraphXml(topic.industry_impact.headline, "WeeklySummary"));
    for (const paragraph of topic.industry_impact.paragraphs) body.push(paragraphXml(paragraph));
    for (const item of topic.industry_impact.items) body.push(paragraphXml(item, "WeeklyBullet", { bullet: true }));
    pushV3MediaNotesDocx(body, topic.industry_impact.media_ids, mediaById, assetById);
    pushV3EvidenceNotesDocx(body, topic.industry_impact.evidence_ids, evidenceById);
    closeBookmarkInLastParagraph(body, id);
  }
  if (snapshot.content.strategic_recommendations.length) {
    body.push(paragraphXml(snapshot.content.recommendation_title, "WeeklyHeading1"));
    for (const recommendation of snapshot.content.strategic_recommendations) {
      const id = bookmarkId++;
      body.push(bookmarkedHeadingXml(recommendation.headline, sectionBookmarks[recommendation.anchor], id));
      body.push(paragraphXml(recommendation.rationale));
      body.push(paragraphXml(`建议动作：${recommendation.action}`, "WeeklySummary"));
      body.push(paragraphXml(`决策窗口：${recommendation.decision_window}`, "WeeklyMeta"));
      closeBookmarkInLastParagraph(body, id);
    }
  }
  if (snapshot.content.evidence.length) {
    body.push(paragraphXml("证据来源", "WeeklyHeading1"));
    for (const evidence of snapshot.content.evidence) {
      body.push(paragraphXml(`${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`, "WeeklyEvidence"));
      if (evidence.note) body.push(paragraphXml(evidence.note));
    }
  }
  if (snapshot.content.status === "no_selection") body.push(paragraphXml("本期没有通过证据门槛的技术专题。", "WeeklyHeading1"));
  body.push(paragraphXml("版本与反馈绑定信息", "WeeklyHeading1"));
  body.push(paragraphXml(`Artifact: ${snapshot.artifact_id}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Run: ${snapshot.source_run_id} · Version: ${snapshot.version}`, "WeeklyReceipt"));
  body.push(paragraphXml(`Content SHA-256: ${snapshot.content_sha256}`, "WeeklyReceipt"));
  return packageWeeklyDocx(snapshot, body, sectionBookmarks, mediaAssets);
}

function renderWeeklyHtml(snapshot) {
  if (snapshot.schema_version === "weekly-insight-publication/v3") return renderWeeklyV3Html(snapshot);
  if (snapshot.schema_version === "weekly-insight-publication/v2") return renderWeeklyV2Html(snapshot);
  return renderWeeklyV1Html(snapshot);
}

function renderWeeklyDocx(snapshot, options = {}) {
  if (snapshot.schema_version === "weekly-insight-publication/v3") return renderWeeklyV3Docx(snapshot, options);
  if (snapshot.schema_version === "weekly-insight-publication/v2") return renderWeeklyV2Docx(snapshot);
  return renderWeeklyV1Docx(snapshot);
}

module.exports = { escapeHtml, safeHttpUrl, wordBookmarkName, renderWeeklyHtml, renderWeeklyDocx };
