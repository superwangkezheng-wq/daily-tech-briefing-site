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

function paragraphXml(text, style) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function renderWeeklyDocx(snapshot) {
  let bookmarkId = 1;
  const body = [
    paragraphXml(snapshot.content.title, "Title"),
    paragraphXml(snapshot.content.dek || "", "Subtitle"),
    paragraphXml(`观察期：${snapshot.content.period.start}—${snapshot.content.period.end} · ${snapshot.content.period.label}`),
    paragraphXml(`Artifact: ${snapshot.artifact_id} · Run: ${snapshot.source_run_id} · Version: ${snapshot.version}`),
    paragraphXml(`Content SHA-256: ${snapshot.content_sha256}`),
  ];
  for (const section of snapshot.content.sections) {
    const id = bookmarkId++;
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="${id}" w:name="${escapeXml(section.anchor)}"/><w:r><w:t>${escapeXml(section.title)}</w:t></w:r></w:p>`);
    if (section.summary) body.push(paragraphXml(section.summary));
    for (const item of section.items) body.push(paragraphXml(`• ${item}`));
    for (const evidenceId of section.evidence_ids) {
      const evidence = snapshot.content.evidence.find((item) => item.id === evidenceId);
      if (evidence) body.push(paragraphXml(`证据：${evidence.title}｜${evidence.publisher}｜${evidence.source_url}`));
    }
    body.push(`<w:p><w:bookmarkEnd w:id="${id}"/></w:p>`);
  }
  if (snapshot.content.status === "no_selection") {
    body.push(paragraphXml("本期没有通过证据门槛的战略判断。", "Heading1"));
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const customProps = [
    ["artifact_id", snapshot.artifact_id],
    ["source_run_id", snapshot.source_run_id],
    ["version", snapshot.version],
    ["content_sha256", snapshot.content_sha256],
    ["section_anchors", snapshot.section_anchors.join(",")],
  ].map(([name, value], index) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${index + 2}" name="${escapeXml(name)}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`],
    ["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(snapshot.content.title)}</dc:title><dc:creator>Daily Tech Weekly Insight</dc:creator></cp:coreProperties>`],
    ["docProps/custom.xml", `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${customProps}</Properties>`],
    ["word/document.xml", documentXml],
  ];
  return createZip(entries);
}

module.exports = { escapeHtml, safeHttpUrl, renderWeeklyHtml, renderWeeklyDocx };
