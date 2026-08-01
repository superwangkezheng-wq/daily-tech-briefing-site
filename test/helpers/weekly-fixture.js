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

function createWeeklyV2Snapshot(overrides = {}) {
  const content = {
    title: "AI 正在重写算力软件栈与 Agent 运行时",
    dek: "四个专题共享系统控制点上移这一背景，但不被强行拼成一条因果链。",
    period: {
      start: "2026-07-24",
      end: "2026-07-30",
      label: "2026 W31",
      as_of: "2026-07-31T07:32:41+08:00",
    },
    status: "complete",
    selected_topics: 1,
    weekly_synthesis: {
      title: "本期技术主线：竞争开始转向完整任务系统",
      paragraphs: ["模型能力仍是基础，生产差距开始移向软件适配、执行治理与状态管理。"],
    },
    topics: [
      {
        topic_id: "topic-agent-context-state",
        thesis_id: "thesis-agent-context-state-control",
        kicker: "Context-state control",
        title: "同一个模型为什么能差三倍",
        standfirst: "状态保留、压缩与同步开始成为 Agent 的能力—成本控制面。",
        article_sections: [
          {
            anchor: "thesis_agent_context_state_control_what_changed",
            section_id: "what_changed",
            role: "what_changed",
            kind: "what_changed",
            title: "发生了什么变化",
            paragraphs: ["同一模型只改变状态策略，就能显著改变任务表现和 token 成本。"],
            items: ["能力变化不是换模型，而是改变状态的保留、压缩和同步方式。"],
            evidence_ids: ["evidence-context"],
            media_ids: [],
          },
          {
            anchor: "thesis_agent_context_state_control_how_it_works",
            section_id: "how_it_works",
            role: "how_it_works",
            kind: "how_it_works",
            title: "状态控制如何工作",
            paragraphs: ["保留有效推理、压缩历史，并以当前工作集替换陈旧快照。"],
            items: ["保留", "压缩", "同步", "回放"],
            evidence_ids: ["evidence-context"],
            media_ids: ["benchmark-context"],
          },
          {
            anchor: "thesis_agent_context_state_control_evidence_and_limits",
            section_id: "evidence_and_limits",
            role: "evidence_and_limits",
            kind: "evidence_and_limits",
            title: "证据与边界",
            paragraphs: ["当前仍缺跨企业生产复现，不能把受控 benchmark 直接外推。"],
            items: ["需要比较任务完成率、成本、时延和状态错误。"],
            evidence_ids: ["evidence-context"],
            media_ids: [],
          },
        ],
        industry_impact: {
          anchor: "thesis_agent_context_state_control_industry",
          kind: "industry_impact",
          title: "产业影响",
          headline: "Agent runtime 将升级为管理状态质量与单位任务成本的核心层。",
          paragraphs: ["平台竞争将从模型选择扩展到状态质量、回放和成本归因。"],
          items: ["受益方：具备真实任务轨迹和状态观测的平台。"],
          evidence_ids: ["evidence-context"],
          media_ids: [],
        },
        lenovo_china_implication: {
          anchor: "thesis_agent_context_state_control_lenovo",
          kind: "lenovo_china_implications",
          title: "联想中国区启示",
          headline: "把 memory、compaction、同步与回放从隐藏实现变成可评测配置。",
          paragraphs: ["应在真实客户任务上比较每成功任务成本和错误类型。"],
          items: ["所有收益必须跨至少两类模型复测。"],
          evidence_ids: ["evidence-context"],
          media_ids: [],
        },
      },
    ],
    strategic_recommendations: [
      {
        anchor: "recommendation_context_pilot_recommendation",
        headline: "用真实长程任务验证状态策略。",
        rationale: "受控结果已经显示潜力，但企业外推仍需基线。",
        action: "选择两类可回放任务，比较成功率、成本与状态错误。",
        decision_window: "下一次平台版本规划前",
      },
    ],
    evidence: [
      {
        id: "evidence-context",
        title: "官方技术实验",
        publisher: "Example Research",
        source_url: "https://example.com/context",
        published_at: "2026-07-29",
        accessed_at: "2026-07-31T07:32:41+08:00",
        role: "source_in",
        note: "支持机制存在，但不能直接外推到企业生产。",
      },
    ],
    media: [
      {
        id: "benchmark-context",
        kind: "benchmark",
        src: "https://example.com/context-benchmark.png",
        alt: "状态策略 benchmark",
        caption: "同一模型在不同状态策略下的受控对比。",
        source_label: "Example Research",
        source_url: "https://example.com/context",
      },
    ],
    ...overrides.content,
  };

  const snapshot = {
    schema_version: "weekly-insight-publication/v2",
    artifact_id: "wsi-2026-w31-v2",
    source_run_id: "weekly-run-2026-w31-v2",
    version: "2.0",
    approved_candidate_sha256: "c".repeat(64),
    content_sha256: canonicalSha256(content),
    approval: {
      status: "approved",
      approval_id: "non-authoritative-test-projection",
      approved_at: "2026-08-01T10:00:00+08:00",
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
  snapshot.content_sha256 = Object.prototype.hasOwnProperty.call(overrides, "content_sha256")
    ? overrides.content_sha256
    : canonicalSha256(snapshot.content);
  return snapshot;
}

module.exports = { createWeeklySnapshot, createWeeklyV2Snapshot };
