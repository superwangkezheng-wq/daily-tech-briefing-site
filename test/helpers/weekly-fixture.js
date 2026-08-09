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

function createWeeklyV3Snapshot(overrides = {}) {
  const content = {
    title: "企业 Agent 进入统一治理阶段",
    dek: "从已确认事件与公开案例出发，解释治理控制为何在本期变得重要。",
    period: {
      start: "2026-07-27",
      end: "2026-08-02",
      label: "2026 W31",
      as_of: "2026-08-03T09:30:00+08:00",
    },
    status: "complete",
    selected_topics: 1,
    weekly_synthesis: {
      title: "本期主线：Agent 的运行边界开始进入平台治理范围",
      paragraphs: ["连接器授权、计划任务与持续运行把 Agent 治理从单次交互扩展到完整生命周期。"],
    },
    topics: [
      {
        topic_id: "topic-agent-governance",
        thesis_id: "thesis-runtime-001",
        title: "企业开始把 Agent 纳入统一身份和权限管理",
        facts: {
          anchor: "thesis_runtime_001_facts",
          kind: "facts",
          title: "事实与案例",
          paragraphs: [
            "AgentForger 利用了已经修复的 CSRF（跨站请求伪造）问题。攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
            "公开复现显示，连接器授权、Agent 创建、审批设置与计划任务共同决定了后续执行范围；该案例不能代表其他 Agent 平台的总体安全状态。",
          ],
          items: ["漏洞已修复，公开披露与修复时间均可回溯。"],
          terms: [{ term: "CSRF", explanation: "攻击者诱导已登录用户的浏览器提交未经用户确认的请求。" }],
          evidence_ids: ["evidence-agentforger"],
          media_ids: ["architecture-agent-governance"],
        },
        findings: [
          {
            finding_id: "finding-agent-volume",
            headline: "Agent 数量增长推动统一治理",
            paragraphs: ["分散的创建入口、授权记录和计划任务增加了追踪、撤权和停用的难度，这在 Agent 数量增长后变得更重要。"],
            evidence_ids: ["evidence-agentforger"],
          },
        ],
        industry_impact: {
          anchor: "thesis_runtime_001_industry",
          kind: "industry_impact",
          title: "产业影响",
          headline: "Agent 管理将覆盖身份、权限、运行记录和停用流程",
          paragraphs: ["平台需要把统一清单、最小权限、操作审计、环境隔离和停用能力纳入产品验收。"],
          items: ["安全控制要与任务成功率、误报、审批次数和恢复时间共同验收。"],
          evidence_ids: ["evidence-agentforger"],
          media_ids: [],
        },
      },
    ],
    recommendation_title: "战略建议",
    strategic_recommendations: [
      {
        anchor: "recommendation_agent_governance_recommendation",
        headline: "建立 Agent 生命周期治理基线。",
        rationale: "连接器权限和计划任务使一次配置错误可能影响后续执行。",
        action: "在既有平台中统一清单、所有者、权限、运行记录、版本和停用入口。",
        decision_window: "下一次平台版本规划前",
      },
    ],
    evidence: [
      {
        id: "evidence-agentforger",
        title: "AgentForger 公开披露与修复记录",
        publisher: "Zenity Labs",
        source_url: "https://labs.zenity.io/p/agentforger-part-1-chatgpt-cross-site-agent-forgery",
        published_at: "2026-07-31",
        accessed_at: "2026-08-03T09:00:00+08:00",
        role: "source_in",
        note: "支持事件过程、成立条件和修复状态，不外推其他平台。",
      },
    ],
    media: [
      {
        id: "architecture-agent-governance",
        kind: "architecture",
        src: "http://127.0.0.1:4331/weekly-assets/gate6-w31/agent-governance-four-layer.png",
        alt: "企业 Agent 治理依赖关系图",
        caption: "Agent 经由连接器访问企业系统，治理控制约束身份、权限和审计。",
        source_label: "依据公开事实绘制",
        source_url: "https://labs.zenity.io/p/agentforger-part-1-chatgpt-cross-site-agent-forgery",
        usage_rights: "本项目依据公开事实绘制",
        logic_type: "dependency",
        logic_summary: "Agent 调用连接器访问企业系统；身份、权限和审计控制共同约束调用范围。",
      },
    ],
    ...overrides.content,
  };

  const snapshot = {
    schema_version: "weekly-insight-publication/v3",
    artifact_id: "wsi-2026-w31-v3",
    source_run_id: "weekly-run-2026-w31-v3",
    version: "1.0",
    approved_candidate_sha256: "d".repeat(64),
    content_sha256: canonicalSha256(content),
    approval: {
      status: "approved",
      approval_id: "approval-2026-w31-v3",
      approved_at: "2026-08-03T10:00:00+08:00",
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

function createWeeklyV4Topic(index, total, evidenceId = "evidence-v4") {
  const number = index + 1;
  const suffix = String(number).padStart(2, "0");
  const anchorPrefix = `thesis_v4_${suffix}`;
  return {
    topic_id: `topic-v4-${suffix}`,
    thesis_id: `thesis-v4-${suffix}`,
    sequence_label: `专题 ${suffix}/${String(total).padStart(2, "0")}`,
    title: `技术专题 ${number}的完整文章标题`,
    facts: {
      title: "事实与案例",
      sections: [
        {
          anchor: `${anchorPrefix}_what_changed`,
          section_id: `event_${suffix}`,
          role: "what_changed",
          kind: "what_changed",
          title: "公开事件与发生条件",
          paragraphs: [
            `专题 ${number}的公开事件、时间和利用条件均可从原始资料核对。`,
            "连接器授权决定 Agent 可以访问的邮件、文件或数据库范围。",
          ],
          items: [],
          evidence_ids: [evidenceId],
          media_ids: [],
        },
        {
          anchor: `${anchorPrefix}_how_it_works`,
          section_id: `mechanism_${suffix}`,
          role: "how_it_works",
          kind: "how_it_works",
          title: "技术机制和控制关系",
          paragraphs: ["Agent 在模型判断之外还受身份、权限、执行环境和计划任务策略约束。"],
          items: ["模型判断、人工确认和确定性策略承担不同职责。"],
          evidence_ids: [evidenceId],
          media_ids: [],
        },
        {
          anchor: `${anchorPrefix}_evidence_and_limits`,
          section_id: `limits_${suffix}`,
          role: "evidence_and_limits",
          kind: "evidence_and_limits",
          title: "证据边界与适用范围",
          paragraphs: ["已修复的具体漏洞不能用于估算其他平台的日常攻击率。"],
          items: [],
          evidence_ids: [evidenceId],
          media_ids: [],
        },
      ],
      terms: [
        {
          term: "连接器",
          explanation: "让 Agent 调用邮件、文件、数据库等外部系统的接口及授权配置。",
          first_section_id: `event_${suffix}`,
          after_section_anchor: `${anchorPrefix}_what_changed`,
          after_paragraph_index: 1,
          reader_text: "连接器：让 Agent 调用邮件、文件、数据库等外部系统的接口及授权配置。",
        },
      ],
    },
    findings: {
      title: "发现",
      items: [
        {
          anchor: `${anchorPrefix}_finding_1`,
          finding_id: `finding-v4-${suffix}-1`,
          title: `1、专题 ${number}的背景与原因在此时同时聚集`,
          paragraphs: ["企业 Agent 数量、可调用工具和企业系统连接同时增加，使统一治理成为投产条件。"],
          evidence_ids: [evidenceId],
        },
      ],
    },
    industry_impact: {
      anchor: `${anchorPrefix}_industry`,
      kind: "industry_impact",
      title: "产业影响",
      headline: "Agent 平台验收将覆盖身份、权限、审计和停用。",
      paragraphs: ["企业客户会要求平台提供 Agent 资产清单、执行轨迹和紧急停用能力。"],
      items: ["采购验收需要同时考察治理效果和任务成功率。"],
      evidence_ids: [evidenceId],
      media_ids: [],
    },
    strategic_recommendation: {
      anchor: `${anchorPrefix}_recommendation`,
      kind: "strategic_recommendation",
      title: "战略建议",
      headline: "联想中国区应把 Agent 治理纳入产品和项目验收。",
      paragraphs: ["擎天、百应与 AI Foundry 需要让客户看清每个 Agent 的所有者、权限、连接器和运行计划。"],
      items: ["交付统一停用入口、撤权验证和任务成功率报告。"],
      evidence_ids: [evidenceId],
      media_ids: [],
    },
  };
}

function createWeeklyV4Snapshot(overrides = {}) {
  const topicCount = Number.isInteger(overrides.topicCount) ? overrides.topicCount : 1;
  const status = topicCount === 0 ? "no_selection" : topicCount < 3 ? "partial" : "complete";
  const issueKind = topicCount === 0 ? "empty_preview" : topicCount < 3 ? "topic_preview" : "complete_issue";
  const releaseEligible = topicCount >= 3;
  const evidence = topicCount === 0 ? [] : [{
    id: "evidence-v4",
    title: "example.com",
    publisher: "example.com",
    source_url: "https://example.com/weekly-v4",
    published_at: "2026-07-31",
    accessed_at: "2026-08-03T09:00:00+08:00",
    role: "source_in",
    note: "支持事件、机制和边界，不外推未披露结论。",
  }];
  const content = {
    title: "企业 Agent 治理进入产品验收阶段",
    dek: "本期把可核对的事件、技术机制、产业影响和联想中国区动作放在同一阅读顺序中。",
    period: {
      start: "2026-07-27",
      end: "2026-08-02",
      label: "2026 W31",
      as_of: "2026-08-03T09:30:00+08:00",
    },
    status,
    issue_kind: issueKind,
    selected_topics: topicCount,
    topics: Array.from({ length: topicCount }, (_, index) => createWeeklyV4Topic(index, topicCount)),
    evidence,
    media: [],
    ...overrides.content,
  };
  const snapshot = {
    schema_version: "weekly-insight-publication/v4",
    artifact_id: `wsi-2026-w31-v4-${topicCount}`,
    source_run_id: `weekly-run-2026-w31-v4-${topicCount}`,
    version: "4.0",
    approved_candidate_sha256: "e".repeat(64),
    content_sha256: canonicalSha256(content),
    approval: {
      status: "approved",
      approval_id: `approval-2026-w31-v4-${topicCount}`,
      approved_at: "2026-08-03T10:00:00+08:00",
    },
    ...overrides,
    publication: {
      public_enabled: false,
      visibility: "internal_preview",
      authorization_id: null,
      release_eligible: releaseEligible,
      ...overrides.publication,
    },
    content,
  };
  delete snapshot.topicCount;
  snapshot.content_sha256 = Object.prototype.hasOwnProperty.call(overrides, "content_sha256")
    ? overrides.content_sha256
    : canonicalSha256(snapshot.content);
  return snapshot;
}

function createWeeklyV41Snapshot(overrides = {}) {
  const topicCount = Number.isInteger(overrides.topicCount) ? overrides.topicCount : 1;
  const base = createWeeklyV4Snapshot({ topicCount });
  const sequenceLabels = ["①", "②", "③", "④", "⑤"];
  const topics = base.content.topics.map((topic, topicIndex) => {
    const suffix = String(topicIndex + 1).padStart(2, "0");
    const [whatChanged, howItWorks, evidenceAndLimits] = topic.facts.sections;
    const sections = [
      {
        ...whatChanged,
        paragraphs: [
          `专题 ${topicIndex + 1}的公开事件属于 CSRF 类请求问题，时间与成立条件均可核对。`,
          whatChanged.paragraphs[1],
        ],
      },
      {
        anchor: `thesis_v4_${suffix}_case_study`,
        section_id: `case_study_${suffix}`,
        role: "case_study",
        kind: "case_study",
        title: "公开案例与执行过程",
        paragraphs: [
          "initial_assistant_prompt 会把初始指令传给 Agent Builder。",
          "Preview Mode 会立即试运行 Agent，随后计划任务继续按时执行。",
        ],
        items: [],
        evidence_ids: [...whatChanged.evidence_ids],
        media_ids: [],
      },
      howItWorks,
      {
        anchor: `thesis_v4_${suffix}_architecture`,
        section_id: `architecture_${suffix}`,
        role: "architecture",
        kind: "architecture",
        title: "执行链与控制架构",
        paragraphs: ["执行隔离限制文件、网络、凭据与工具的可达范围。"],
        items: [],
        evidence_ids: [...howItWorks.evidence_ids],
        media_ids: [],
      },
      evidenceAndLimits,
    ].map((section, index) => ({
      ...section,
      sequence_label: sequenceLabels[index] || `${index + 1}、`,
    }));
    const terms = [
      {
        term: "CSRF",
        explanation: "攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
        first_section_id: whatChanged.section_id,
        after_section_anchor: whatChanged.anchor,
        after_paragraph_index: 0,
        reader_text: "CSRF：攻击者诱导已登录用户的浏览器提交未经用户确认的请求。",
      },
      ...topic.facts.terms,
      {
        term: "initial_assistant_prompt",
        explanation: "Workspace Agent Builder URL 中用来传入初始指令的参数。",
        first_section_id: `case_study_${suffix}`,
        after_section_anchor: `thesis_v4_${suffix}_case_study`,
        after_paragraph_index: 0,
        reader_text: "initial_assistant_prompt：Workspace Agent Builder URL 中用来传入初始指令的参数。",
      },
      {
        term: "Preview Mode",
        explanation: "用于立即试运行 Agent 的预览功能。",
        first_section_id: `case_study_${suffix}`,
        after_section_anchor: `thesis_v4_${suffix}_case_study`,
        after_paragraph_index: 1,
        reader_text: "Preview Mode：用于立即试运行 Agent 的预览功能。",
      },
      {
        term: "执行隔离",
        explanation: "用沙箱和访问边界限制 Agent 能够触达的文件、网络与凭据。",
        first_section_id: `architecture_${suffix}`,
        after_section_anchor: `thesis_v4_${suffix}_architecture`,
        after_paragraph_index: 0,
        reader_text: "执行隔离：用沙箱和访问边界限制 Agent 能够触达的文件、网络与凭据。",
      },
    ];
    const groups = [];
    const groupBySectionId = new Map();
    for (const term of terms) {
      let group = groupBySectionId.get(term.first_section_id);
      if (!group) {
        group = {
          first_section_id: term.first_section_id,
          after_section_anchor: term.after_section_anchor,
          after_paragraph_index: term.after_paragraph_index,
          reader_texts: [],
        };
        groupBySectionId.set(term.first_section_id, group);
        groups.push(group);
      }
      group.after_paragraph_index = Math.max(group.after_paragraph_index, term.after_paragraph_index);
      group.reader_texts.push(term.reader_text);
    }
    return {
      ...topic,
      facts: {
        ...topic.facts,
        sections,
        terms,
        term_note_groups: groups,
      },
    };
  });
  const content = {
    ...base.content,
    topics,
    ...overrides.content,
  };
  return createWeeklyV4Snapshot({
    topicCount,
    ...overrides,
    artifact_id: overrides.artifact_id || `wsi-2026-w31-v4-1-${topicCount}`,
    source_run_id: overrides.source_run_id || `weekly-run-2026-w31-v4-1-${topicCount}`,
    version: "4.1",
    publication: {
      ...base.publication,
      ...overrides.publication,
    },
    content,
  });
}

module.exports = {
  createWeeklySnapshot,
  createWeeklyV2Snapshot,
  createWeeklyV3Snapshot,
  createWeeklyV4Snapshot,
  createWeeklyV41Snapshot,
};
