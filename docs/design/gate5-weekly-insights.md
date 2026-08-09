# Gate 5 — 周度技术战略洞察网站侧设计与实现

## 最小实现

Gate 5 在现有 Node 服务内增加一条窄而深的 `weekly_insight` 内容通道：

1. WBR 未来输出已批准、展示就绪的 `weekly-insight-publication/v1` snapshot。
2. 网站严格校验 allowlist、内容哈希、0–4 条状态与逐期公开授权；网站不调用分析执行器，也不解释原始研究产物。
3. 现有 refresh 每次同时触发 daily 与 weekly 构建。两者用 `Promise.all` 隔离结果，不增加 scheduler。
4. weekly publisher 在同一 staging 目录生成 HTML、DOCX、content JSON，校验标识与 anchors 后最后写 manifest，再原子 rename。
5. `.cache/weekly-insights` 是私有派生缓存。`public_enabled=false` 的期刊只有携带 `WEEKLY_PREVIEW_TOKEN` 才能读取页面、API 和 Word；Word 反馈还必须单独提供 `WEEKLY_FEEDBACK_TOKEN`。
6. 网页只有“通过 Codex 反馈”和“上传修改后 Word”两个入口。Codex 入口只复制带 artifact/hash/topic/anchor/category/page URL 的模板；Word 入口核验同一快照的 DOCX bookmarks 与 package state，生成 `weekly-insight-docx-diff/v2` 和原子 outbox。两者都只进入 `pending_review`，前端不修改 WBR Skill。

权威消费合同见 [weekly-insight-publication-v1.md](../contracts/weekly-insight-publication-v1.md)。

## 视觉与交互

OpenDesign 方向采用既有日报的暖色编辑部语言，把 AI Hot 的左侧信息架构节奏与 AI Hunt 的卡片浏览感重新组合为周度栏目：

- 首页用窄幅入口建立“每日信号 → 周度判断”的索引关系。
- `/insights/` 用期刊式大标题和可扫读卡片，不使用 PPT 分页布局。
- 详情页使用 sticky 章节目录、文章流和可回溯 evidence cards。
- fact、evidence、mechanism、industry impact、trend、Lenovo China implications、optional strategic recommendations 使用不同 section kind 与视觉语气。
- 图片、技术架构图和评测图共用具备 alt、caption、source 和错误 fallback 的 figure contract。
- 卡片进场、hover、锚点复制、反馈 modal 和移动端折叠目录均尊重 `prefers-reduced-motion`。

OpenDesign 原型中的示例事实只用于版式探索，没有进入仓库或生产实现。实现页面只渲染通过批准 snapshot 合同的数据。这是相对原型的有意内容偏差。

## 设计产物

- `design/gate5/weekly-insights-index-concept.png`
- `design/gate5/weekly-insight-detail-concept.png`
- `design/gate5/weekly-insight-mobile-concept.png`
- `design/gate5/weekly-insights-index-implemented.png`
- `design/gate5/weekly-insight-detail-implemented.png`
- `design/gate5/weekly-insight-mobile-implemented.png`

## 验收矩阵

| 场景 | 验收点 | 自动化/浏览器证据 |
| --- | --- | --- |
| 1–4 条动态 | 合同接受 1、2、3、4，拒绝 5 | contract tests |
| 0 条动态 | `no_selection` 可发布为空态 | contract + renderer tests |
| 无战略建议 | 不要求 recommendation section，不补造内容 | publisher test |
| 长标题 | HTML 转义且桌面/移动不溢出 | publisher + Browser |
| 坏图片/坏 URL | 不可达图片显示 fallback；畸形或 executable URL 拒收 | contract + publisher + Browser |
| XSS | 标题与正文转义，外链仅 http(s) | publisher tests |
| HTML/DOCX 一致 | artifact/run/version/hash/anchors 一致 | publisher + OOXML tests |
| 半套失败 | DOCX 失败后无 artifact 目录 | atomic publisher test |
| 反馈校准 | 精确 snapshot 绑定、bookmark/package diff、v2 canonical outbox hash、ack/retry/碰撞 | feedback + WBR cross-repo tests |
| 未公开隔离 | 无 token 的页面/API/Word/feedback 均不可见 | server integration test |
| 公开授权 | `approved` 不能推断 public；public 需单独 authorization id | contract tests |
| weekly 失败 | daily 成功结果保留 | isolation test |
| daily 失败 | weekly 成功结果保留 | isolation test |
| 现有回归 | parser、schedule、plist、privacy、syntax | existing scripts |
| 桌面/移动 | 索引、详情、反馈 modal、移动 TOC、无横向溢出 | in-app Browser QA |

## WBR producer contract 缺口

WBR Gate 4 当前没有生成 `weekly-insight-publication/v1` 的 producer。WBR 后续只需补一个批准后 adapter：

- 把已批准 candidate 映射成展示 sections、公开安全 evidence 与 media；
- 生成稳定 anchors 和 canonical `content_sha256`；
- 显式设置 `public_enabled=false`，只有独立逐期授权才写 `public` 与 `authorization_id`；
- 不把内部战略附录或 raw/internal evidence 放入 snapshot；
- 原子落盘到 `WEEKLY_INSIGHT_SOURCE_DIR`。

该 adapter 不属于本仓库；Gate 5 网站实现不会自行反向解析 Gate 4 candidate，也不会启用 OpenClaw 定时化或公开发布。
