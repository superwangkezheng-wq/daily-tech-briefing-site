const editorialState = {
  config: null,
  snapshots: [],
  snapshotDetails: new Map(),
  activeSnapshotId: "",
  activeSnapshot: null,
  page: 1,
  drawerOpen: false,
  lastTrackedVisitKey: "",
};

const editorialFrontendVersion = "1.1.3";
const SLOT_ORDER = ["morning", "afternoon", "evening"];

const CJK_CHAR_RE = /[\u3400-\u9fff]/g;
const LATIN_CHAR_RE = /[A-Za-z]/g;
const INLINE_LABEL_RE = /^(摘要|产业影响)\s*[：:]\s*/;

const editorialElements = {
  appVersion: document.getElementById("app-version"),
  topbarMeta: document.getElementById("topbar-meta"),
  heroKicker: document.getElementById("hero-kicker"),
  heroSlot: document.getElementById("hero-slot"),
  heroTitle: document.getElementById("hero-title"),
  heroSummary: document.getElementById("hero-summary"),
  heroMetaDate: document.getElementById("hero-meta-date"),
  heroMetaRole: document.getElementById("hero-meta-role"),
  heroMetaCount: document.getElementById("hero-meta-count"),
  heroSideStatus: document.getElementById("hero-side-status"),
  heroSideVersion: document.getElementById("hero-side-version"),
  heroSideGenerated: document.getElementById("hero-side-generated"),
  heroSideCount: document.getElementById("hero-side-count"),
  heroSideDate: document.getElementById("hero-side-date"),
  snapshotToggle: document.getElementById("snapshot-toggle"),
  slotSwitcher: document.getElementById("slot-switcher"),
  snapshotStrip: document.getElementById("snapshot-strip"),
  snapshotPanel: document.getElementById("snapshot-panel"),
  quickTitle: document.getElementById("quick-title"),
  quickCopy: document.getElementById("quick-copy"),
  quickGrid: document.getElementById("quick-grid"),
  entryStream: document.getElementById("entry-stream"),
  pageIndicator: document.getElementById("page-indicator"),
  totalIndicator: document.getElementById("total-indicator"),
  pagination: document.getElementById("pagination"),
  feedbackForm: document.getElementById("feedback-form"),
  feedbackStatus: document.getElementById("feedback-status"),
  visitorName: document.getElementById("visitor-name"),
  visitorContact: document.getElementById("visitor-contact"),
  feedbackContent: document.getElementById("feedback-content"),
  quickCardTemplate: document.getElementById("quick-card-template"),
  entryTemplate: document.getElementById("entry-template"),
};

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function isMostlyEnglish(text) {
  const value = String(text || "");
  const latinCount = countMatches(value, LATIN_CHAR_RE);
  const cjkCount = countMatches(value, CJK_CHAR_RE);
  return latinCount >= 16 && latinCount > cjkCount * 1.2;
}

function normalizeDisplayTitle(text) {
  const original = String(text || "").trim();
  if (!original || !isMostlyEnglish(original)) return original;

  const cleaned = original
    .replace(/([\u3400-\u9fff][^()]{0,40}?)\s*\(([A-Za-z][^)]{0,80})\)/g, (_, __, english) => english.trim())
    .replace(/([A-Za-z][^()]{0,80}?)\s*\(([\u3400-\u9fff][^)]{0,40})\)/g, (_, english) => english.trim())
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  return cleaned || original;
}

function splitSentenceUnits(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  const paragraphs = normalized
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) return paragraphs;

  const units = [];
  let buffer = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1] || "";
    const afterNext = normalized[index + 2] || "";
    buffer += char;

    const hitCjkBoundary = /[。！？；!?]/.test(char) && (!next || /\s/.test(next));
    const hitEnglishBoundary = char === "." && next === " " && /[A-Z\u3400-\u9fff]/.test(afterNext);
    if (hitCjkBoundary || hitEnglishBoundary) {
      const unit = buffer.trim();
      if (unit) units.push(unit);
      buffer = "";
    }
  }

  const tail = buffer.trim();
  if (tail) units.push(tail);
  return units.length ? units : [normalized];
}

function classifyLanguage(text) {
  const value = String(text || "").trim();
  const cjkCount = countMatches(value, CJK_CHAR_RE);
  const latinCount = countMatches(value, LATIN_CHAR_RE);
  const firstCjkIndex = value.search(/[\u3400-\u9fff]/);
  const firstLatinIndex = value.search(/[A-Za-z]/);
  const hasChinesePunctuation = /[，。；：“”‘’《》、（）]/.test(value);

  if (!cjkCount && !latinCount) return "neutral";
  if (!latinCount) return "zh";
  if (!cjkCount) return "en";
  if (hasChinesePunctuation && cjkCount >= 8) return "zh";
  if (cjkCount >= 8 && firstCjkIndex !== -1 && (firstLatinIndex === -1 || firstCjkIndex < firstLatinIndex)) return "zh";
  if (latinCount >= 12 && firstLatinIndex !== -1 && (firstCjkIndex === -1 || firstLatinIndex < firstCjkIndex)) return "en";
  if (cjkCount >= latinCount * 1.15) return "zh";
  if (latinCount >= cjkCount * 1.15) return "en";
  return cjkCount >= latinCount ? "zh" : "en";
}

function joinLanguageUnits(units, language) {
  if (!units.length) return "";
  return units.join(language === "en" ? " " : "");
}

function buildBilingualSegments(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  const stripped = normalized.replace(INLINE_LABEL_RE, "").trim();
  if (!stripped) return [];

  const units = splitSentenceUnits(stripped);
  const zhUnits = [];
  const enUnits = [];
  const neutralUnits = [];

  units.forEach((unit) => {
    const language = classifyLanguage(unit);
    if (language === "zh") {
      zhUnits.push(unit);
    } else if (language === "en") {
      enUnits.push(unit);
    } else {
      neutralUnits.push(unit);
    }
  });

  if (zhUnits.length && enUnits.length) {
    if (neutralUnits.length) {
      if (zhUnits.length >= enUnits.length) zhUnits.push(...neutralUnits);
      else enUnits.push(...neutralUnits);
    }

    return [
      { language: "zh", text: joinLanguageUnits(zhUnits, "zh") },
      { language: "en", text: joinLanguageUnits(enUnits, "en") },
    ].filter((item) => item.text);
  }

  return [{ language: classifyLanguage(stripped), text: stripped }];
}

function primaryCopy(text) {
  const segments = buildBilingualSegments(text);
  if (!segments.length) return "暂无内容。";
  const zh = segments.find((segment) => segment.language === "zh");
  return (zh || segments[0]).text;
}

function renderBilingualCopy(element, text) {
  if (!element) return;
  const segments = buildBilingualSegments(text);
  element.innerHTML = "";

  if (!segments.length) {
    element.textContent = "--";
    return;
  }

  if (segments.length === 1) {
    element.textContent = segments[0].text;
    return;
  }

  segments.forEach((segment) => {
    const span = document.createElement("span");
    span.className = `editorial-copy-segment editorial-copy-segment--${segment.language}`;
    span.textContent = segment.text;
    element.appendChild(span);
  });
}

function editorialPageSize() {
  const configured = Number(editorialState.config && editorialState.config.pageSize);
  return Number.isFinite(configured) && configured > 0 ? configured : 6;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `请求失败：${response.status}`);
  }
  return response.json();
}

function formatGenerated(meta) {
  const label = String((meta && meta.generatedAtLabel) || "").trim();
  if (label) return label;
  const generatedAt = String((meta && meta.generatedAt) || "").trim();
  return generatedAt ? `生成于 ${generatedAt}` : "--";
}

function generatedValue(meta) {
  return formatGenerated(meta).replace(/^生成于\s*/, "");
}

function itemCount(meta, detail) {
  const detailItems = getItems(detail);
  if (detailItems.length) return detailItems.length;
  return Number(meta && meta.counts && meta.counts.techNews) || 0;
}

function getItems(detail) {
  const sections = (detail && detail.sections) || {};
  const techNews = Array.isArray(sections.techNews) ? sections.techNews : [];
  const videoItems = Array.isArray(sections.videoItems) ? sections.videoItems : [];
  const aiCreators = Array.isArray(sections.aiCreators) ? sections.aiCreators : [];
  const items = techNews.length ? techNews : [...videoItems, ...aiCreators];
  return items
    .filter((item) => item && (item.title || item.summary || item.impact))
    .map((item, index) => ({
      rank: Number(item.rank) || index + 1,
      title: item.title || "未命名条目",
      displayTitle: normalizeDisplayTitle(item.title || "未命名条目"),
      source: item.source || "未知来源",
      link: item.link || "#",
      summary: item.summary || "暂无摘要。",
      impact: item.impact || "暂无产业影响分析。",
    }));
}

function activeMeta() {
  return editorialState.snapshots.find((snapshot) => snapshot.id === editorialState.activeSnapshotId) || null;
}

function activeData() {
  const meta = activeMeta() || {};
  const detail = editorialState.activeSnapshot || {};
  const items = getItems(detail);
  return { meta, detail, items };
}

function buildHeroSummary(meta, detail, items) {
  const lead = items[0];
  if (lead && lead.summary) return lead.summary;
  return buildSummary(meta, detail, items);
}

function buildSummary(meta, detail, items) {
  if (meta.summaryNote) return meta.summaryNote;
  if (detail.heroNote) return detail.heroNote;
  if (items[0]) return `本版首条为“${items[0].displayTitle || items[0].title}”，页面提供摘要、产业影响和原文入口。`;
  return "当前版本暂无可展示条目，请稍后再试或切换其他版本。";
}

function groupSnapshots() {
  return editorialState.snapshots.reduce((groups, snapshot) => {
    const existing = groups.find((group) => group.date === snapshot.date);
    if (existing) {
      existing.items.push(snapshot);
    } else {
      groups.push({ date: snapshot.date, items: [snapshot] });
    }
    return groups;
  }, []);
}

function latestSnapshotForSlot(slotKey) {
  return editorialState.snapshots.find((snapshot) => snapshot.slotKey === slotKey) || null;
}

function setLink(linkElement, url) {
  if (!linkElement) return;
  const safeUrl = String(url || "").trim();
  linkElement.href = safeUrl || "#";
  if (safeUrl && safeUrl !== "#") {
    linkElement.removeAttribute("aria-disabled");
    linkElement.setAttribute("target", "_blank");
    linkElement.setAttribute("rel", "noreferrer");
  } else {
    linkElement.setAttribute("aria-disabled", "true");
    linkElement.removeAttribute("target");
    linkElement.removeAttribute("rel");
  }
}

function scrollWindowTo(target, offset = 24) {
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function scrollStripToActive(container, activeNode) {
  if (!container || !activeNode) return;
  const targetLeft = activeNode.offsetLeft - (container.clientWidth - activeNode.clientWidth) / 2;
  container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
}

function syncDrawer() {
  if (!editorialElements.snapshotToggle || !editorialElements.snapshotPanel) return;
  editorialElements.snapshotToggle.setAttribute("aria-expanded", editorialState.drawerOpen ? "true" : "false");
  editorialElements.snapshotToggle.textContent = editorialState.drawerOpen ? "收起全部快照" : "展开全部快照";
  editorialElements.snapshotPanel.hidden = !editorialState.drawerOpen;
}

function makeSnapshotCard(snapshot, activeSnapshotId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `snapshot-card${snapshot.id === activeSnapshotId ? " active" : ""}`;

  const title = document.createElement("strong");
  title.textContent = snapshot.displayTitle || `${snapshot.date} ${snapshot.slotLabel}`;
  const generated = document.createElement("span");
  generated.textContent = formatGenerated(snapshot);
  const count = document.createElement("em");
  count.textContent = `${itemCount(snapshot, null)} 条资讯`;

  button.append(title, generated, count);
  button.addEventListener("click", () => loadSnapshot(snapshot.id));
  return button;
}

function renderSwitchboard(meta) {
  editorialElements.slotSwitcher.innerHTML = "";
  SLOT_ORDER.forEach((slotKey) => {
    const snapshot = latestSnapshotForSlot(slotKey);
    if (!snapshot) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = snapshot.slotLabel;
    button.dataset.active = meta.slotKey === slotKey ? "true" : "false";
    button.addEventListener("click", () => loadSnapshot(snapshot.id));
    editorialElements.slotSwitcher.appendChild(button);
  });

  editorialElements.snapshotStrip.innerHTML = "";
  editorialState.snapshots.forEach((snapshot) => {
    editorialElements.snapshotStrip.appendChild(makeSnapshotCard(snapshot, meta.id));
  });

  editorialElements.snapshotPanel.innerHTML = "";
  groupSnapshots().forEach((group) => {
    const section = document.createElement("section");
    section.className = "snapshot-group";

    const head = document.createElement("p");
    head.className = "eyebrow";
    head.textContent = group.date;
    section.appendChild(head);

    const strip = document.createElement("div");
    strip.className = "snapshot-strip";
    group.items.forEach((snapshot) => {
      strip.appendChild(makeSnapshotCard(snapshot, meta.id));
    });
    section.appendChild(strip);
    editorialElements.snapshotPanel.appendChild(section);
  });

  const activeCard = editorialElements.snapshotStrip.querySelector(".snapshot-card.active");
  scrollStripToActive(editorialElements.snapshotStrip, activeCard);
}

function renderHero(meta, detail, items) {
  const lead = items[0];
  const displayTitle = meta.displayTitle || `${meta.date || "--"} ${meta.slotLabel || ""}`.trim();

  if (editorialElements.appVersion && editorialState.config && editorialState.config.appVersion) {
    editorialElements.appVersion.textContent = `v${editorialFrontendVersion}`;
  }

  editorialElements.topbarMeta.textContent = `${displayTitle} · ${generatedValue(meta)}`;
  editorialElements.heroKicker.textContent = `今日首条 · ${String(meta.date || "--").replace(/-/g, "/")}`;
  editorialElements.heroSlot.textContent = lead ? lead.source : "重点新闻";
  editorialElements.heroTitle.textContent = lead ? lead.displayTitle || lead.title : "当前版本暂无可展示条目";
  renderBilingualCopy(editorialElements.heroSummary, buildHeroSummary(meta, detail, items));
  editorialElements.heroMetaDate.textContent = displayTitle;
  editorialElements.heroMetaRole.textContent = "首条内容";
  editorialElements.heroMetaCount.textContent = `${itemCount(meta, detail)} 条资讯`;
  editorialElements.heroSideStatus.textContent = meta.statusLabel || generatedValue(meta);
  editorialElements.heroSideVersion.textContent = meta.shortSlotLabel || meta.slotLabel || "--";
  editorialElements.heroSideGenerated.textContent = generatedValue(meta);
  editorialElements.heroSideCount.textContent = `${itemCount(meta, detail)} 条资讯`;
  editorialElements.heroSideDate.textContent = meta.date || "--";
}

function renderQuickPicks(meta, items) {
  editorialElements.quickTitle.textContent = `${meta.shortSlotLabel || meta.slotLabel || "本版"}重点条目`;
  editorialElements.quickCopy.textContent = items.length
    ? `本版精选 ${items.length} 条资讯，优先把值得判断的结构性变化放在第一屏。`
    : buildSummary(meta, editorialState.activeSnapshot, items);

  editorialElements.quickGrid.innerHTML = "";

  items.slice(0, 3).forEach((item, index) => {
    const node = editorialElements.quickCardTemplate.content.firstElementChild.cloneNode(true);
    node.style.animationDelay = `${40 + index * 50}ms`;
    node.querySelector(".quick-source").textContent = item.source;
    node.querySelector(".quick-rank").textContent = String(item.rank).padStart(2, "0");
    node.querySelector(".quick-title-text").textContent = item.displayTitle || item.title;
    node.querySelector(".quick-summary").textContent = `摘要：${primaryCopy(item.summary)}`;
    node.querySelector(".quick-impact").textContent = `产业影响：${primaryCopy(item.impact)}`;
    setLink(node.querySelector(".quick-link"), item.link);
    node.querySelector(".quick-jump").addEventListener("click", () => jumpToRank(item.rank));
    editorialElements.quickGrid.appendChild(node);
  });

  if (!editorialElements.quickGrid.children.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "当前版本暂无重点条目。";
    editorialElements.quickGrid.appendChild(empty);
  }
}

function renderEntries(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / editorialPageSize()));
  editorialState.page = Math.min(editorialState.page, totalPages);
  editorialElements.pageIndicator.textContent = `当前页 ${editorialState.page} / ${totalPages}`;
  editorialElements.totalIndicator.textContent = `共 ${items.length} 条`;

  const start = (editorialState.page - 1) * editorialPageSize();
  const pageItems = items.slice(start, start + editorialPageSize());
  editorialElements.entryStream.innerHTML = "";

  if (!pageItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = items.length ? "当前页没有更多条目。" : "当前版本暂无可展示条目。";
    editorialElements.entryStream.appendChild(empty);
  }

  pageItems.forEach((item, index) => {
    const node = editorialElements.entryTemplate.content.firstElementChild.cloneNode(true);
    node.id = `entry-${item.rank}`;
    node.style.animationDelay = `${40 + index * 45}ms`;
    node.querySelector(".entry-rank").textContent = String(item.rank).padStart(2, "0");
    node.querySelector(".entry-source").textContent = item.source;
    node.querySelector(".entry-title").textContent = item.displayTitle || item.title;
    renderBilingualCopy(node.querySelector(".entry-summary-copy"), item.summary);
    renderBilingualCopy(node.querySelector(".entry-impact-copy"), item.impact);
    setLink(node.querySelector(".entry-link"), item.link);
    editorialElements.entryStream.appendChild(node);
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  editorialElements.pagination.innerHTML = "";
  const shell = document.createElement("div");
  shell.className = "pagination";

  const makeButton = (label, page, disabled = false, current = false) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-dot";
    button.textContent = label;
    button.disabled = disabled;
    if (current) button.dataset.current = "true";
    if (!disabled) {
      button.addEventListener("click", () => {
        editorialState.page = page;
        renderEditorial();
        scrollWindowTo(document.getElementById("dispatch-list"), 84);
      });
    }
    return button;
  };

  shell.appendChild(makeButton("上一页", Math.max(1, editorialState.page - 1), editorialState.page === 1));
  for (let page = 1; page <= totalPages; page += 1) {
    shell.appendChild(makeButton(String(page), page, false, page === editorialState.page));
  }
  shell.appendChild(
    makeButton("下一页", Math.min(totalPages, editorialState.page + 1), editorialState.page === totalPages),
  );

  editorialElements.pagination.appendChild(shell);
}

function jumpToRank(rank) {
  const { items } = activeData();
  const itemIndex = items.findIndex((item) => item.rank === rank);
  if (itemIndex === -1) return;
  editorialState.page = Math.floor(itemIndex / editorialPageSize()) + 1;
  renderEditorial();
  requestAnimationFrame(() => {
    scrollWindowTo(document.getElementById(`entry-${rank}`), 92);
  });
}

function renderEditorial() {
  const { meta, detail, items } = activeData();
  syncDrawer();
  renderHero(meta, detail, items);
  renderSwitchboard(meta);
  renderQuickPicks(meta, items);
  renderEntries(items);
}

async function loadSnapshot(snapshotId, options = {}) {
  editorialState.activeSnapshotId = snapshotId;
  editorialState.page = 1;
  if (window.innerWidth <= 920) editorialState.drawerOpen = false;

  if (!editorialState.snapshotDetails.has(snapshotId)) {
    const detail = await fetchJson(`/api/snapshots/${encodeURIComponent(snapshotId)}`);
    editorialState.snapshotDetails.set(snapshotId, detail);
  }

  editorialState.activeSnapshot = editorialState.snapshotDetails.get(snapshotId);
  renderEditorial();

  if (options.scrollToTop !== false) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const meta = activeMeta();
  await trackVisit("home", snapshotId, meta ? meta.displayTitle : "");
}

async function trackVisit(route, snapshotId, title) {
  const visitKey = [route, snapshotId || "", title || ""].join("|");
  if (editorialState.lastTrackedVisitKey === visitKey) return;
  editorialState.lastTrackedVisitKey = visitKey;

  try {
    await fetchJson("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route, snapshotId, title }),
    });
  } catch (error) {
    // Ignore access logging failures.
  }
}

function renderFatal(message) {
  editorialElements.topbarMeta.textContent = "Live issue · unavailable";
  editorialElements.heroKicker.textContent = "Lead Dispatch · unavailable";
  editorialElements.heroSlot.textContent = "暂无内容";
  editorialElements.heroTitle.textContent = "暂未读取到日报内容";
  editorialElements.heroSummary.textContent = message;
  editorialElements.quickTitle.textContent = "重点条目暂不可用";
  editorialElements.quickCopy.textContent = message;
  editorialElements.entryStream.innerHTML = `<p class="empty-state">${message}</p>`;
  editorialElements.pagination.innerHTML = "";
}

async function submitFeedback(event) {
  event.preventDefault();
  if (!editorialElements.feedbackStatus || !editorialElements.feedbackContent) return;

  editorialElements.feedbackStatus.textContent = "正在提交…";
  const meta = activeMeta();

  try {
    await fetchJson("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorName: editorialElements.visitorName ? editorialElements.visitorName.value.trim() : "",
        contact: editorialElements.visitorContact ? editorialElements.visitorContact.value.trim() : "",
        content: editorialElements.feedbackContent.value.trim(),
        reportDate: meta ? meta.date : "",
        reportTitle: meta ? meta.displayTitle || meta.title : "",
        snapshotId: editorialState.activeSnapshotId,
      }),
    });

    editorialElements.feedbackContent.value = "";
    editorialElements.feedbackStatus.textContent = "反馈已提交，感谢你的建议。";
  } catch (error) {
    editorialElements.feedbackStatus.textContent = error.message;
  }
}

async function bootstrap() {
  editorialState.config = await fetchJson("/api/config");
  const payload = await fetchJson("/api/snapshots");
  editorialState.snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];

  if (!editorialState.snapshots.length) {
    renderFatal("暂未发现可展示内容，请稍后刷新。");
    return;
  }

  const latestId = (payload.latest && payload.latest.id) || editorialState.snapshots[0].id;
  await loadSnapshot(latestId, { scrollToTop: false });
}

editorialElements.snapshotToggle?.addEventListener("click", () => {
  editorialState.drawerOpen = !editorialState.drawerOpen;
  syncDrawer();
});

editorialElements.feedbackForm?.addEventListener("submit", submitFeedback);

bootstrap().catch((error) => {
  renderFatal(error.message);
});
