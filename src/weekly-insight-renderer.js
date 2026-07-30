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
  return `<figure class="insight-media insight-media--${escapeHtml(media.kind)}">${visual}<figcaption>${escapeHtml(media.caption)}${source ? ` <span>${source}</span>` : ""}</figcaption></figure>`;
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

function renderWeeklyHtml(snapshot) {
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

function paragraphXml(text, style = "Normal", options = {}) {
  const numbering = options.bullet
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : "";
  const paragraphProperties = `<w:pPr><w:pStyle w:val="${style}"/>${numbering}</w:pPr>`;
  return `<w:p>${paragraphProperties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
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
  return `<w:p><w:pPr><w:pStyle w:val="WeeklyHeading1"/></w:pPr><w:bookmarkStart w:id="${bookmarkId}" w:name="${escapeXml(anchor)}"/><w:r><w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
}

function closeBookmarkInLastParagraph(body, bookmarkId) {
  const lastIndex = body.length - 1;
  if (lastIndex < 0 || !body[lastIndex].endsWith("</w:p>")) throw new Error("Cannot close DOCX bookmark outside a paragraph");
  body[lastIndex] = body[lastIndex].replace(/<\/w:p>$/, `<w:bookmarkEnd w:id="${bookmarkId}"/></w:p>`);
}

function stylesXml() {
  const fonts = '<w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS" w:cs="Arial Unicode MS" w:hint="eastAsia"/>';
  const language = '<w:lang w:val="zh-CN" w:eastAsia="zh-CN"/>';
  const run = (extra = "") => `<w:rPr>${fonts}${language}${extra}</w:rPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault>${run('<w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="24211D"/>')}</w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="24211D"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyKicker"><w:name w:val="Weekly Kicker"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklyTitle"/><w:pPr><w:spacing w:before="0" w:after="100"/><w:keepNext/></w:pPr>${run('<w:b/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="2F6B5B"/><w:caps/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyTitle"><w:name w:val="Weekly Title"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklySubtitle"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="120"/><w:keepNext/><w:keepLines/></w:pPr>${run('<w:b/><w:sz w:val="56"/><w:szCs w:val="56"/><w:color w:val="24211D"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklySubtitle"><w:name w:val="Weekly Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklyMeta"/><w:pPr><w:spacing w:before="0" w:after="200" w:line="288" w:lineRule="auto"/><w:keepNext/></w:pPr>${run('<w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="5F5A52"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyMeta"><w:name w:val="Weekly Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="746F67"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyHeading1"><w:name w:val="Weekly Heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="WeeklySummary"/><w:qFormat/><w:uiPriority w:val="9"/><w:pPr><w:spacing w:before="320" w:after="160"/><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/></w:pPr>${run('<w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2F6B5B"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklySummary"><w:name w:val="Weekly Summary"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:keepNext/></w:pPr>${run('<w:b/><w:sz w:val="23"/><w:szCs w:val="23"/><w:color w:val="2B2925"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyBullet"><w:name w:val="Weekly Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="22"/><w:szCs w:val="22"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyEvidence"><w:name w:val="Weekly Evidence"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:spacing w:before="20" w:after="70" w:line="240" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="6C675F"/>')}</w:style>
  <w:style w:type="paragraph" w:styleId="WeeklyReceipt"><w:name w:val="Weekly Receipt"/><w:basedOn w:val="WeeklyMeta"/><w:pPr><w:spacing w:after="30" w:line="220" w:lineRule="auto"/></w:pPr>${run('<w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="777168"/>')}</w:style>
</w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:ind w:left="720" w:hanging="360"/><w:spacing w:after="100" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS" w:cs="Arial Unicode MS" w:hint="eastAsia"/><w:sz w:val="22"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
}

function fontTableXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:font w:name="Arial Unicode MS"><w:altName w:val="Microsoft YaHei"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font></w:fonts>`;
}

function renderWeeklyDocx(snapshot) {
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
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>`;
  const customProps = [
    ["artifact_id", snapshot.artifact_id],
    ["source_run_id", snapshot.source_run_id],
    ["version", snapshot.version],
    ["content_sha256", snapshot.content_sha256],
    ["section_anchors", snapshot.section_anchors.join(",")],
    ["section_bookmarks", JSON.stringify(sectionBookmarks)],
  ].map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${escapeXml(name)}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`],
    ["word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(snapshot.content.title)}</dc:title><dc:creator>Daily Tech Weekly Insight</dc:creator></cp:coreProperties>`],
    ["docProps/custom.xml", `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${customProps}</Properties>`],
    ["word/document.xml", documentXml],
    ["word/styles.xml", stylesXml()],
    ["word/numbering.xml", numberingXml()],
    ["word/fontTable.xml", fontTableXml()],
    ["word/footer1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial Unicode MS" w:hAnsi="Arial Unicode MS" w:eastAsia="Arial Unicode MS" w:cs="Arial Unicode MS" w:hint="eastAsia"/><w:color w:val="8A847B"/><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(`${snapshot.content.period.label} · 周度技术战略洞察`)}</w:t></w:r></w:p></w:ftr>`],
  ];
  return createZip(entries);
}

module.exports = { escapeHtml, safeHttpUrl, wordBookmarkName, renderWeeklyHtml, renderWeeklyDocx };
