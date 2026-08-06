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
          (item.section_anchors || []).slice(0, 4).forEach((anchor) => {
            const tag = document.createElement("span");
            tag.textContent = anchor.replaceAll("_", " ");
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

    const dialog = document.querySelector("[data-feedback-dialog]");
    document.querySelector("[data-feedback-open]")?.addEventListener("click", () => dialog?.showModal());
    document.querySelector("[data-feedback-submit]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const status = dialog.querySelector("[data-feedback-status]");
      const comment = dialog.querySelector("[data-feedback-text]").value.trim();
      const file = dialog.querySelector("[data-feedback-docx]").files[0];
      if (!comment) { status.textContent = "请填写反馈内容。"; return; }
      if (file && file.size > 8 * 1024 * 1024) { status.textContent = "Word 文件不能超过 8 MB。"; return; }
      button.disabled = true;
      status.textContent = "正在绑定快照并计算章节差异…";
      try {
        const payload = {
          sectionAnchor: dialog.querySelector("[data-feedback-section]").value,
          comment,
          editedDocxBase64: file ? await fileToBase64(file) : "",
        };
        const result = await fetchJson(`/api/insights/${encodeURIComponent(artifactId)}/feedback`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        status.textContent = `已记录 · ${result.receipt.section_diffs.length} 个章节发生变化`;
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
