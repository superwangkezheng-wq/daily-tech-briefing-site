(() => {
  const params = new URLSearchParams(window.location.search);
  const previewToken = params.get("preview_token") || "";
  const withPreview = (url) => {
    if (!previewToken) return url;
    const next = new URL(url, window.location.origin);
    next.searchParams.set("preview_token", previewToken);
    return `${next.pathname}${next.search}${next.hash}`;
  };
  document.querySelectorAll('a[href^="/insights/"]').forEach((link) => {
    link.href = withPreview(link.getAttribute("href"));
  });

  async function fetchJson(url, options) {
    const response = await fetch(withPreview(url), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败：${response.status}`);
    return payload;
  }

  function statusLabel(item) {
    if (item.status === "no_selection") return "本期无入选";
    if (item.content_schema_version === "weekly-insight-publication/v4") {
      if (item.issue_kind === "complete_issue") return `${item.selected_topics} 个技术专题`;
      if (item.issue_kind === "topic_preview") {
        return item.selected_topics === 1 ? "单题内容评审" : `${item.selected_topics} 个专题内容评审`;
      }
      return "本期无入选";
    }
    if (["weekly-insight-publication/v2", "weekly-insight-publication/v3"].includes(item.content_schema_version)) {
      return `${item.selected_topics} 个专题`;
    }
    return `${item.selected_theses} 条判断`;
  }

  function renderIndex() {
    const grid = document.getElementById("insight-card-grid");
    const template = document.getElementById("insight-card-template");
    const count = document.getElementById("weekly-count");
    if (!grid || !template || !count) return;
    fetchJson("/api/insights")
      .then((index) => {
        count.textContent = `${index.count} 期`;
        grid.replaceChildren();
        if (!index.insights.length) {
          const empty = document.createElement("div");
          empty.className = "weekly-empty";
          const label = document.createElement("p");
          label.className = "eyebrow";
          label.textContent = "NO PUBLISHED ISSUES";
          const title = document.createElement("h2");
          title.textContent = previewToken ? "当前没有可预览的批准快照" : "周度洞察尚未公开发布";
          const copy = document.createElement("p");
          copy.textContent = "内容批准不会自动推断为公开授权。";
          empty.append(label, title, copy);
          grid.append(empty);
          return;
        }
        index.insights.forEach((item) => {
          const card = template.content.firstElementChild.cloneNode(true);
          card.querySelector(".insight-card__period").textContent = item.period.label;
          card.querySelector(".insight-card__status").textContent = statusLabel(item);
          card.querySelector("h2").textContent = item.title;
          card.querySelector(".insight-card__dek").textContent = item.dek || "本期洞察保留证据边界与适用范围。";
          const anchors = card.querySelector(".insight-card__anchors");
          const sectionLabels = item.content_schema_version === "weekly-insight-publication/v4"
            ? (item.reader_sections || ["事实与案例", "发现", "产业影响", "战略建议"])
            : (item.section_anchors || []).slice(0, 4).map((anchor) => anchor.replaceAll("_", " "));
          sectionLabels.forEach((label) => {
            const tag = document.createElement("span");
            tag.textContent = label;
            anchors.append(tag);
          });
          card.querySelector(".insight-card__receipt").textContent = `${item.artifact_id} · v${item.version} · ${item.content_sha256.slice(0, 12)}`;
          card.querySelector("a").href = withPreview(`/insights/${encodeURIComponent(item.artifact_id)}`);
          grid.append(card);
        });
      })
      .catch((error) => {
        count.textContent = "读取失败";
        grid.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "weekly-empty";
        const title = document.createElement("h2");
        title.textContent = "暂时无法读取周度洞察";
        const copy = document.createElement("p");
        copy.textContent = error.message;
        empty.append(title, copy);
        grid.append(empty);
      });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function enhanceDetail() {
    const artifactId = document.querySelector('meta[name="weekly:artifact_id"]')?.content;
    if (!artifactId) return;
    const word = document.querySelector("[data-word-download]");
    if (word) word.href = withPreview(word.getAttribute("href"));
    document.querySelector("[data-print]")?.addEventListener("click", () => window.print());
    document.querySelectorAll("[data-copy-anchor]").forEach((button) => {
      button.addEventListener("click", async () => {
        const url = new URL(window.location.href);
        url.hash = button.dataset.copyAnchor;
        try {
          if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(url.toString());
          button.textContent = "✓";
        } catch (error) {
          button.textContent = "!";
        }
        window.setTimeout(() => { button.textContent = "#"; }, 1200);
      });
    });
    document.querySelectorAll("[data-weekly-media]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
        const fallback = image.nextElementSibling;
        if (fallback) fallback.hidden = false;
      });
    });
    const toc = document.querySelector(".weekly-toc");
    const toggle = toc?.querySelector("[data-toc-toggle]");
    toggle?.addEventListener("click", () => {
      const open = toc.dataset.open !== "true";
      toc.dataset.open = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      const label = toggle.querySelector("span:last-child");
      if (label) label.textContent = open ? "收起" : "展开";
    });
    toc?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
      toc.dataset.open = "false";
      toggle?.setAttribute("aria-expanded", "false");
      const label = toggle?.querySelector("span:last-child");
      if (label) label.textContent = "展开";
    }));

    const chapterNav = toc?.querySelector("[data-v4-chapter-nav]");
    const topics = [...document.querySelectorAll("[data-v4-topic]")];
    if (chapterNav && topics.length) {
      const topicLinks = [...toc.querySelectorAll('.weekly-toc__links a[href^="#"]')];
      const chapterLinks = [...chapterNav.querySelectorAll("[data-v4-chapter-link]")];
      const currentTopic = chapterNav.querySelector("[data-v4-current-topic]");
      let scheduled = false;
      const updateChapterNav = () => {
        scheduled = false;
        let topic = topics[0];
        for (const candidate of topics) {
          if (candidate.getBoundingClientRect().top <= 190) topic = candidate;
          else break;
        }
        if (currentTopic) currentTopic.textContent = topic.dataset.sequenceLabel || "当前专题";
        topicLinks.forEach((link) => {
          if (link.getAttribute("href") === `#${topic.id}`) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
        const chapters = [...topic.querySelectorAll("[data-v4-chapter]")];
        let activeChapter = chapters[0];
        for (const candidate of chapters) {
          if (candidate.getBoundingClientRect().top <= 210) activeChapter = candidate;
          else break;
        }
        chapterLinks.forEach((link) => {
          const target = topic.querySelector(`[data-v4-chapter="${link.dataset.v4ChapterLink}"]`);
          if (!target) return;
          link.href = `#${target.id}`;
          if (target === activeChapter) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      };
      const scheduleChapterNavUpdate = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(updateChapterNav);
      };
      window.addEventListener("scroll", scheduleChapterNavUpdate, { passive: true });
      window.addEventListener("resize", scheduleChapterNavUpdate);
      scheduleChapterNavUpdate();
    }

    const codexDialog = document.querySelector("[data-codex-feedback-dialog]");
    const wordDialog = document.querySelector("[data-word-feedback-dialog]");
    document.querySelector("[data-codex-feedback-open]")?.addEventListener("click", () => codexDialog?.showModal());
    document.querySelector("[data-word-feedback-open]")?.addEventListener("click", () => wordDialog?.showModal());
    [codexDialog, wordDialog].forEach((dialog) => {
      dialog?.querySelector(".feedback-dialog__close")?.addEventListener("click", (event) => {
        event.preventDefault();
        dialog.close();
      });
    });

    const codexSelect = codexDialog?.querySelector("[data-codex-feedback-section]");
    const codexTemplate = codexDialog?.querySelector("[data-codex-feedback-template]");
    const updateCodexTemplate = () => {
      if (!codexSelect || !codexTemplate) return;
      const option = codexSelect.selectedOptions[0];
      const cleanUrl = new URL(window.location.origin + window.location.pathname);
      cleanUrl.hash = option?.value || "";
      const categories = {
        facts: "事实与案例",
        findings: "关键发现",
        industry_impact: "产业影响",
        strategic_recommendation: "战略建议",
        overall: "整篇",
      };
      codexTemplate.value = [
        "请将以下意见作为绑定原始产物的 pending_review 反馈，不要直接改写已发布内容或 Skill。",
        `artifact_id: ${artifactId}`,
        `content_sha256: ${document.querySelector('meta[name="weekly:content_sha256"]')?.content || ""}`,
        `topic_id: ${option?.dataset.topicId || "overall"}`,
        `reader_anchor: ${option?.value || "overall"}`,
        `feedback_category: ${categories[option?.dataset.feedbackCategory] || option?.dataset.feedbackCategory || "整篇"}`,
        `page_url: ${cleanUrl}`,
        "",
        "反馈意见：",
      ].join("\n");
    };
    codexSelect?.addEventListener("change", updateCodexTemplate);
    updateCodexTemplate();
    codexDialog?.querySelector("[data-codex-feedback-copy]")?.addEventListener("click", async () => {
      const status = codexDialog.querySelector("[data-codex-feedback-status]");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("当前浏览器无法使用剪贴板。");
        await navigator.clipboard.writeText(codexTemplate.value);
        status.textContent = "已复制，请在 Codex 中粘贴并补充意见。";
      } catch (error) {
        status.textContent = error.message;
      }
    });

    let feedbackId = null;
    const nextFeedbackId = () => {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
      if (!globalThis.crypto?.getRandomValues) {
        throw new Error("当前浏览器无法安全生成反馈编号。");
      }
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
    wordDialog?.querySelector("[data-word-feedback-submit]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = wordDialog.querySelector("[data-word-feedback-status]");
      const fileInput = wordDialog.querySelector("[data-feedback-docx]");
      const tokenInput = wordDialog.querySelector("[data-feedback-token]");
      if (!status || !fileInput || !tokenInput) return;
      const token = tokenInput.value;
      const file = fileInput.files[0];
      const parsedMaxDocxBytes = Number(fileInput.dataset.maxBytes);
      const maxDocxBytes = Number.isFinite(parsedMaxDocxBytes) && parsedMaxDocxBytes > 0
        ? parsedMaxDocxBytes
        : 8 * 1024 * 1024;
      if (!file) { status.textContent = "请选择修改后的 Word 文件。"; return; }
      if (!token) { status.textContent = "请输入私有反馈凭据。"; return; }
      if (file.size > maxDocxBytes) {
        const maxMegabytes = (maxDocxBytes / (1024 * 1024)).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
        status.textContent = `Word 文件不能超过 ${maxMegabytes} MiB。`;
        return;
      }
      button.disabled = true;
      status.textContent = "正在校验书签、快照绑定和包差异…";
      try {
        feedbackId ||= nextFeedbackId();
        await fetchJson(`/api/insights/${encodeURIComponent(artifactId)}/feedback`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-weekly-feedback-token": token,
          },
          body: JSON.stringify({
            feedbackId,
            editedDocxBase64: await fileToBase64(file),
          }),
        });
        status.textContent = "已收到，等待 Codex/WBR 复核";
        feedbackId = null;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  renderIndex();
  enhanceDetail();
})();
