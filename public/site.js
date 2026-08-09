const state = {
  config: null,
  snapshots: [],
  details: new Map(),
  activeSnapshotId: "",
  activeDetail: null,
  category: "all",
  query: "",
  page: 1,
  activeDrawer: null,
  drawerTrigger: null,
  lastTrackedVisitKey: "",
};

const CATEGORY_LABELS = {
  all: "今日总览",
  model: "模型与算法",
  product: "产品与工具",
  industry: "产业与商业",
  research: "研究与论文",
  opinion: "观点与动态",
};

const SLOT_LABELS = { morning: "早报", afternoon: "午报", evening: "晚报" };
const SLOT_ORDER = ["morning", "afternoon", "evening"];
const CJK_RE = /[\u3400-\u9fff]/g;
const LATIN_RE = /[A-Za-z]/g;

const elements = {
  searchWrap: document.getElementById("search-wrap"),
  searchInput: document.getElementById("search-input"),
  desktopEditions: document.getElementById("edition-bar-desktop"),
  mobileEditions: document.getElementById("edition-bar-mobile"),
  archiveToggle: document.getElementById("archive-toggle"),
  archivePanel: document.getElementById("archive-panel"),
  thirtyList: document.getElementById("thirty-list"),
  pulseViewport: document.getElementById("pulse-viewport"),
  pulseRow: document.getElementById("pulse-row"),
  pulseToggle: document.getElementById("pulse-toggle"),
  streamLabel: document.getElementById("stream-label"),
  streamCount: document.getElementById("stream-count"),
  cardGrid: document.getElementById("card-grid"),
  pagination: document.getElementById("pagination"),
  cardTemplate: document.getElementById("story-card-template"),
  sidebarEdition: document.getElementById("sidebar-edition"),
  sidebarCount: document.getElementById("sidebar-count"),
  sidebarScore: document.getElementById("sidebar-score"),
  sidebarDate: document.getElementById("sidebar-date"),
  overlay: document.getElementById("drawer-overlay"),
  feedbackDrawer: document.getElementById("feedback-drawer"),
  agentDrawer: document.getElementById("agent-drawer"),
  feedbackForm: document.getElementById("feedback-form"),
  feedbackSuccess: document.getElementById("feedback-success"),
  feedbackError: document.getElementById("feedback-error"),
  feedbackStatus: document.getElementById("feedback-status"),
  feedbackSubmit: document.getElementById("feedback-submit"),
  visitorName: document.getElementById("visitor-name"),
  visitorContact: document.getElementById("visitor-contact"),
  feedbackContent: document.getElementById("feedback-content"),
  copyStatus: document.getElementById("copy-status"),
};

function countMatches(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

function isMostlyEnglish(text) {
  const value = String(text || "");
  const latin = countMatches(value, LATIN_RE);
  const cjk = countMatches(value, CJK_RE);
  return latin >= 16 && latin > cjk * 1.2;
}

function normalizeDisplayTitle(text) {
  const original = String(text || "").trim();
  if (!original || !isMostlyEnglish(original)) return original;
  return (
    original
      .replace(/([\u3400-\u9fff][^()]{0,40}?)\s*\(([A-Za-z][^)]{0,80})\)/g, (_, __, english) => english.trim())
      .replace(/([A-Za-z][^()]{0,80}?)\s*\(([\u3400-\u9fff][^)]{0,40})\)/g, (_, english) => english.trim())
      .replace(/\s{2,}/g, " ")
      .trim() || original
  );
}

function classifyCategory(item, sectionKey) {
  if (sectionKey === "videoItems" || sectionKey === "aiCreators") return "opinion";
  const haystack = `${item.title || ""} ${item.summary || ""} ${item.impact || ""}`.toLowerCase();
  const patterns = {
    model: /(模型|算法|推理|训练|agent|llm|参数|注意力|token|神经网络|芯片|算力|rag|多模态)/gi,
    product: /(发布|推出|上线|产品|工具|平台|设备|系统|版本|开源|api|应用|插件|station|桌面超算|runtime)/gi,
    industry: /(融资|交易|营收|商业|市场|监管|政策|采购|客户|生态|供应链|数据中心|aidc|电力成本|合作|租赁|出售|投资|协议|企业|公司)/gi,
    research: /(论文|研究团队|研究者|arxiv|paper|benchmark|评测基准|实验室|学术|可解释性|workspace|j-space)/gi,
  };
  const scores = Object.entries(patterns).map(([category, pattern]) => [category, countMatches(haystack, pattern)]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : "opinion";
}

function getItems(detail) {
  const sections = (detail && detail.sections) || {};
  const sources = [
    ["techNews", Array.isArray(sections.techNews) ? sections.techNews : []],
    ["videoItems", Array.isArray(sections.videoItems) ? sections.videoItems : []],
    ["aiCreators", Array.isArray(sections.aiCreators) ? sections.aiCreators : []],
  ];
  let globalRank = 0;
  return sources.flatMap(([sectionKey, list]) =>
    list
      .filter((item) => item && (item.title || item.summary || item.impact))
      .map((item) => {
        globalRank += 1;
        return {
          rank: globalRank,
          originalRank: Number(item.rank) || globalRank,
          title: item.title || "未命名条目",
          displayTitle: normalizeDisplayTitle(item.title || "未命名条目"),
          source: item.source || "未知来源",
          link: item.link || "#",
          summary: item.summary || "暂无摘要。",
          impact: item.impact || "暂无产业影响分析。",
          score:
            item.score != null && item.score !== "" && Number.isFinite(Number(item.score))
              ? Number(item.score)
              : null,
          background: item.background || "",
          sectionKey,
          category: classifyCategory(item, sectionKey),
        };
      }),
  );
}

function activeMeta() {
  return state.snapshots.find((snapshot) => snapshot.id === state.activeSnapshotId) || {};
}

function activeItems() {
  return getItems(state.activeDetail);
}

function visibleItems() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  return activeItems().filter((item) => {
    if (state.category !== "all" && item.category !== state.category) return false;
    if (!query) return true;
    return `${item.title} ${item.source} ${item.summary} ${item.impact}`.toLocaleLowerCase("zh-CN").includes(query);
  });
}

function pageSize() {
  const configured = Number(state.config && state.config.pageSize);
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

function snapshotLabel(snapshot) {
  return SLOT_LABELS[snapshot.slotKey] || snapshot.shortSlotLabel || snapshot.slotLabel || "日报";
}

function latestSnapshotForSlot(slotKey) {
  return state.snapshots.find((snapshot) => snapshot.slotKey === slotKey) || null;
}

function formatDate(date) {
  return String(date || "--").replace(/-/g, "/");
}

function excerpt(text, max = 70) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max).trim()}…` : value;
}

function setExternalLink(anchor, link) {
  const safeLink = String(link || "").trim();
  anchor.href = safeLink || "#";
  if (!safeLink || safeLink === "#") {
    anchor.setAttribute("aria-disabled", "true");
    anchor.removeAttribute("target");
    anchor.removeAttribute("rel");
  }
}

function renderEditions() {
  [elements.desktopEditions, elements.mobileEditions].forEach((container) => {
    container.innerHTML = "";
    SLOT_ORDER.forEach((slotKey) => {
      const snapshot = latestSnapshotForSlot(slotKey);
      if (!snapshot) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "edition-pill";
      button.textContent = snapshotLabel(snapshot);
      button.setAttribute("aria-pressed", snapshot.id === state.activeSnapshotId ? "true" : "false");
      button.addEventListener("click", () => loadSnapshot(snapshot.id));
      container.appendChild(button);
    });
  });
}

function renderArchive() {
  elements.archivePanel.innerHTML = "";
  state.snapshots.forEach((snapshot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "archive-button";
    button.textContent = `${formatDate(snapshot.date)} · ${snapshotLabel(snapshot)} · ${snapshot.counts?.techNews || 0} 条`;
    if (snapshot.id === state.activeSnapshotId) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => loadSnapshot(snapshot.id));
    elements.archivePanel.appendChild(button);
  });
  document.getElementById("nav-count-archive").textContent = String(state.snapshots.length);
}

function renderCategoryControls(items) {
  const counts = Object.fromEntries(Object.keys(CATEGORY_LABELS).map((key) => [key, 0]));
  counts.all = items.length;
  items.forEach((item) => {
    counts[item.category] += 1;
  });
  document.querySelectorAll("[data-category]").forEach((control) => {
    const category = control.dataset.category;
    control.setAttribute("aria-pressed", category === state.category ? "true" : "false");
  });
  Object.entries(counts).forEach(([category, count]) => {
    const output = document.getElementById(`nav-count-${category}`);
    if (output) output.textContent = String(count);
  });
}

function renderSidebar(items) {
  const meta = activeMeta();
  const scores = items.map((item) => item.score).filter((score) => score != null);
  elements.sidebarEdition.textContent = snapshotLabel(meta);
  elements.sidebarCount.textContent = `${items.length} 条`;
  elements.sidebarScore.textContent = scores.length ? Math.max(...scores).toFixed(1) : "--";
  elements.sidebarDate.textContent = formatDate(meta.date);
}

function renderThirty(items) {
  elements.thirtyList.innerHTML = "";
  items.slice(0, 3).forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "thirty-item";
    const rank = document.createElement("span");
    rank.className = "thirty-rank";
    rank.textContent = String(index + 1);
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "thirty-title";
    title.textContent = item.displayTitle;
    const summary = document.createElement("p");
    summary.className = "thirty-summary";
    summary.textContent = excerpt(item.summary, 82);
    copy.append(title, summary);
    li.append(rank, copy);
    elements.thirtyList.appendChild(li);
  });
  if (!elements.thirtyList.children.length) {
    const li = document.createElement("li");
    li.className = "thirty-item";
    li.textContent = "当前筛选暂无信号。";
    elements.thirtyList.appendChild(li);
  }
}

function renderPulse(items) {
  elements.pulseRow.innerHTML = "";
  items.slice(0, 5).forEach((item, index) => {
    const article = document.createElement("article");
    article.className = "pulse-item";
    const line = document.createElement("div");
    line.className = "pulse-line";
    const rank = document.createElement("span");
    rank.className = "pulse-rank";
    rank.textContent = String(index + 1);
    const title = document.createElement("h3");
    title.className = "pulse-title";
    title.textContent = item.displayTitle;
    const source = document.createElement("span");
    source.className = "pulse-source";
    source.textContent = item.source;
    line.append(rank, title);
    article.append(line, source);
    elements.pulseRow.appendChild(article);
  });
}

function renderCard(item) {
  const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.category = item.category;
  card.querySelector(".story-category").textContent = CATEGORY_LABELS[item.category];
  const score = card.querySelector(".story-score");
  if (item.score != null) {
    score.hidden = false;
    score.textContent = item.score.toFixed(1);
  }
  card.querySelector(".story-title").textContent = item.displayTitle;
  card.querySelector(".story-source").textContent = item.source;
  card.querySelector(".story-rank").textContent = `#${String(item.rank).padStart(2, "0")}`;
  card.querySelector(".story-summary").textContent = item.summary;
  card.querySelector(".story-impact").textContent = item.impact;
  const backgroundWrap = card.querySelector(".story-background-wrap");
  if (item.background) {
    backgroundWrap.hidden = false;
    card.querySelector(".story-background").textContent = item.background;
  }
  setExternalLink(card.querySelector(".story-link"), item.link);
  const toggle = card.querySelector(".story-toggle");
  const details = card.querySelector(".story-details");
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
    toggle.textContent = expanded ? "展开详情" : "收起详情";
    details.hidden = expanded;
  });
  return card;
}

function renderCards(items) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize()));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * pageSize();
  const pageItems = items.slice(start, start + pageSize());
  elements.cardGrid.innerHTML = "";
  pageItems.forEach((item) => elements.cardGrid.appendChild(renderCard(item)));
  if (!pageItems.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.query ? "没有找到匹配的情报，请换个关键词。" : "当前分类暂无情报。";
    elements.cardGrid.appendChild(empty);
  }
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  elements.pagination.innerHTML = "";
  if (totalPages <= 1) return;
  const addButton = (label, page, options = {}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-button";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);
    if (options.current) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => {
      state.page = page;
      render();
      document.getElementById("stream-label").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    elements.pagination.appendChild(button);
  };
  addButton("上一页", Math.max(1, state.page - 1), { disabled: state.page === 1 });
  for (let page = 1; page <= totalPages; page += 1) addButton(String(page), page, { current: page === state.page });
  addButton("下一页", Math.min(totalPages, state.page + 1), { disabled: state.page === totalPages });
}

function render() {
  const allItems = activeItems();
  const filtered = visibleItems();
  renderEditions();
  renderArchive();
  renderCategoryControls(allItems);
  renderSidebar(allItems);
  renderThirty(filtered);
  renderPulse(filtered);
  elements.streamLabel.textContent = state.query ? `搜索：${state.query}` : CATEGORY_LABELS[state.category];
  elements.streamCount.textContent = `${filtered.length} 条`;
  renderCards(filtered);
}

async function loadSnapshot(snapshotId, options = {}) {
  state.activeSnapshotId = snapshotId;
  state.page = 1;
  if (!state.details.has(snapshotId)) {
    const detail = await fetchJson(`/api/snapshots/${encodeURIComponent(snapshotId)}`);
    state.details.set(snapshotId, detail);
  }
  state.activeDetail = state.details.get(snapshotId);
  render();
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  const meta = activeMeta();
  trackVisit("home", snapshotId, meta.displayTitle || meta.title || "");
}

async function trackVisit(route, snapshotId, title) {
  const key = [route, snapshotId, title].join("|");
  if (state.lastTrackedVisitKey === key) return;
  state.lastTrackedVisitKey = key;
  try {
    await fetchJson("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route, snapshotId, title }),
    });
  } catch {
    // Access logging must not interrupt reading.
  }
}

function setCategory(category) {
  if (!CATEGORY_LABELS[category]) return;
  state.category = category;
  state.page = 1;
  render();
}

function openDrawer(drawer, trigger) {
  if (!drawer) return;
  closeDrawer(false);
  if (drawer === elements.feedbackDrawer) {
    elements.feedbackForm.reset();
    elements.feedbackSuccess.hidden = true;
    elements.feedbackForm.hidden = false;
    elements.feedbackError.textContent = "";
    elements.feedbackStatus.textContent = "";
    elements.feedbackSubmit.disabled = false;
  }
  state.activeDrawer = drawer;
  state.drawerTrigger = trigger || document.activeElement;
  elements.overlay.hidden = false;
  drawer.dataset.open = "true";
  drawer.setAttribute("aria-hidden", "false");
  setPageInert(true);
  document.body.style.overflow = "hidden";
  drawer.querySelector("button, input, textarea")?.focus();
}

function setPageInert(inert) {
  [
    document.querySelector(".site-header"),
    document.querySelector(".mobile-controls"),
    document.querySelector(".page-layout"),
    document.querySelector(".bottom-nav"),
  ].filter(Boolean).forEach((element) => {
    element.inert = inert;
  });
}

function closeDrawer(restoreFocus = true) {
  if (!state.activeDrawer) return;
  state.activeDrawer.removeAttribute("data-open");
  state.activeDrawer.setAttribute("aria-hidden", "true");
  setPageInert(false);
  elements.overlay.hidden = true;
  document.body.style.overflow = "";
  const trigger = state.drawerTrigger;
  state.activeDrawer = null;
  state.drawerTrigger = null;
  if (restoreFocus) trigger?.focus();
}

async function submitFeedback(event) {
  event.preventDefault();
  const content = elements.feedbackContent.value.trim();
  elements.feedbackError.textContent = content.length < 4 ? "请至少输入 4 个字符" : "";
  if (content.length < 4) {
    elements.feedbackContent.focus();
    return;
  }
  elements.feedbackSubmit.disabled = true;
  elements.feedbackStatus.textContent = "正在提交…";
  const meta = activeMeta();
  try {
    await fetchJson("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorName: elements.visitorName.value.trim(),
        contact: elements.visitorContact.value.trim(),
        content,
        reportDate: meta.date || "",
        reportTitle: meta.displayTitle || meta.title || "",
        snapshotId: state.activeSnapshotId,
      }),
    });
    elements.feedbackForm.hidden = true;
    elements.feedbackSuccess.hidden = false;
    elements.feedbackStatus.textContent = "";
  } catch (error) {
    elements.feedbackSubmit.disabled = false;
    elements.feedbackStatus.textContent = error.message;
  }
}

function renderFatal(message) {
  elements.thirtyList.innerHTML = "";
  elements.cardGrid.innerHTML = "";
  const notice = document.createElement("p");
  notice.className = "empty-state";
  notice.textContent = message;
  elements.cardGrid.appendChild(notice);
  elements.streamLabel.textContent = "暂不可用";
  elements.streamCount.textContent = "0 条";
}

async function bootstrap() {
  state.config = await fetchJson("/api/config");
  const payload = await fetchJson("/api/snapshots");
  state.snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  if (!state.snapshots.length) {
    renderFatal("暂未发现可展示内容，请稍后刷新。");
    return;
  }
  const latestId = (payload.latest && payload.latest.id) || state.snapshots[0].id;
  await loadSnapshot(latestId, { scroll: false });
}

document.querySelectorAll("[data-category]").forEach((control) => {
  control.addEventListener("click", () => setCategory(control.dataset.category));
});

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.page = 1;
  render();
});

elements.archiveToggle.addEventListener("click", () => {
  const expanded = elements.archiveToggle.getAttribute("aria-expanded") === "true";
  elements.archiveToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
  elements.archivePanel.hidden = expanded;
});

elements.pulseToggle.addEventListener("click", () => {
  const collapsed = elements.pulseViewport.dataset.collapsed === "true";
  elements.pulseViewport.dataset.collapsed = collapsed ? "false" : "true";
  elements.pulseToggle.setAttribute("aria-expanded", collapsed ? "true" : "false");
  elements.pulseToggle.textContent = collapsed ? "收起" : "展开";
});

document.getElementById("btn-agent").addEventListener("click", (event) => openDrawer(elements.agentDrawer, event.currentTarget));
document.getElementById("btn-feedback").addEventListener("click", (event) => openDrawer(elements.feedbackDrawer, event.currentTarget));
document.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", () => closeDrawer()));
elements.overlay.addEventListener("click", () => closeDrawer());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.activeDrawer) closeDrawer();
});
elements.feedbackForm.addEventListener("submit", submitFeedback);
elements.feedbackContent.addEventListener("input", () => {
  elements.feedbackError.textContent = "";
  elements.feedbackSubmit.disabled = false;
});

document.getElementById("copy-mcp-command").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("npm run mcp:http");
    elements.copyStatus.textContent = "已复制";
  } catch {
    elements.copyStatus.textContent = "请手动复制：npm run mcp:http";
  }
});

document.querySelectorAll("[data-mobile-action]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-mobile-action]").forEach((item) => item.removeAttribute("aria-current"));
    button.setAttribute("aria-current", "page");
    const action = button.dataset.mobileAction;
    if (action === "home") window.scrollTo({ top: 0, behavior: "smooth" });
    if (action === "editions") document.getElementById("edition-bar-mobile").scrollIntoView({ behavior: "smooth", block: "center" });
    if (action === "search") {
      const isOpen = elements.searchWrap.dataset.mobileOpen === "true";
      elements.searchWrap.dataset.mobileOpen = isOpen ? "false" : "true";
      if (!isOpen) elements.searchInput.focus();
    }
    if (action === "agent") openDrawer(elements.agentDrawer, button);
    if (action === "feedback") openDrawer(elements.feedbackDrawer, button);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (state.activeDrawer) closeDrawer();
  else if (elements.searchWrap.dataset.mobileOpen === "true") {
    elements.searchWrap.dataset.mobileOpen = "false";
    document.querySelector('[data-mobile-action="search"]')?.focus();
  }
});

bootstrap().catch((error) => renderFatal(error.message));
