const { canonicalSha256 } = require("../../src/weekly-insight-contract");

function createWeeklySnapshot(overrides = {}) {
  const content = {
    title: "本周技术战略洞察：推理基础设施进入效率竞争",
    dek: "从已验证事实到中国区行动含义，保留证据边界。",
    period: {
      start: "2026-07-20",
      end: "2026-07-26",
      label: "2026 W30",
      as_of: "2026-07-26T23:59:59+08:00",
    },
    status: "partial",
    selected_theses: 2,
    sections: [
      {
        anchor: "core_insight",
        kind: "core_insight",
        title: "核心判断",
        summary: "竞争焦点正在从单点模型能力转向可验证的系统效率。",
        items: ["成本、时延与可靠性需要在同一评测口径下观察。"],
        evidence_ids: ["ev_01"],
        media_ids: ["arch_01"],
      },
      {
        anchor: "verified_facts",
        kind: "verified_facts",
        title: "已验证事实",
        summary: "以下事实均可回溯到公开来源。",
        items: ["样例事实一", "样例事实二"],
        evidence_ids: ["ev_01"],
        media_ids: [],
      },
      {
        anchor: "lenovo_china_implications",
        kind: "lenovo_china_implications",
        title: "联想中国区启示",
        summary: "这是批准进入公开展示层的启示，不包含内部战略附录。",
        items: ["优先验证可量化的端到端效率指标。"],
        evidence_ids: ["ev_01"],
        media_ids: [],
      },
    ],
    evidence: [
      {
        id: "ev_01",
        title: "公开技术报告",
        publisher: "Example Research",
        source_url: "https://example.com/report",
        published_at: "2026-07-24",
        accessed_at: "2026-07-26T12:00:00+08:00",
        role: "direct",
        note: "支持核心事实，不外推未披露结论。",
      },
    ],
    media: [
      {
        id: "arch_01",
        kind: "architecture",
        src: "https://example.com/architecture.png",
        alt: "推理系统技术架构示意图",
        caption: "架构图用于说明机制联系。",
        source_label: "Example Research",
        source_url: "https://example.com/report",
      },
    ],
    ...overrides.content,
  };

  const snapshot = {
    schema_version: "weekly-insight-publication/v1",
    artifact_id: "wsi-2026-w30",
    source_run_id: "weekly-run-2026-w30",
    version: "1.0",
    approved_candidate_sha256: "a".repeat(64),
    content_sha256: canonicalSha256(content),
    approval: {
      status: "approved",
      approval_id: "approval-2026-w30",
      approved_at: "2026-07-30T10:00:00+08:00",
    },
    ...overrides,
    publication: {
      public_enabled: false,
      visibility: "internal_preview",
      authorization_id: null,
      ...overrides.publication,
    },
    content,
  };

  if (Object.prototype.hasOwnProperty.call(overrides, "content_sha256")) {
    snapshot.content_sha256 = overrides.content_sha256;
  } else if (overrides.content) {
    snapshot.content_sha256 = canonicalSha256(snapshot.content);
  }
  return snapshot;
}

module.exports = { createWeeklySnapshot };
