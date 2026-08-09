const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseReportFile } = require("../src/report-parser");

function reportMarkdown({ decorated }) {
  const newsHeading = decorated ? "## 📰 主新闻" : "## 主新闻";
  const videoHeading = decorated ? "## 🎬 视频 / 播客" : "## 视频 / 播客";
  const creatorHeading = decorated ? "## 👤 AI 资讯博主" : "## AI 资讯博主";
  return `# 每日 AI & ICT 资讯精选 (2026-07-21)

${newsHeading}

#### 1. 测试主新闻
**来源**: Test Source  
**链接**: https://example.com/news  
**摘要**: 主新闻摘要。

**产业影响**: 主新闻影响。

${videoHeading}

*本版暂无入选内容*

${creatorHeading}

#### 1. 测试博主动态
**来源**: Test Creator  
**链接**: https://example.com/creator  
**摘要**: 博主动态摘要。

**产业影响**: 博主动态影响。

*生成时间: 2026-07-21T09:30:04+08:00*
*总计: 2 条精选新闻*
`;
}

function parseFixture(rootDir, name, decorated) {
  const filePath = path.join(rootDir, `2026-07-21-${name}-资讯采集.md`);
  fs.writeFileSync(filePath, reportMarkdown({ decorated }), "utf8");
  return parseReportFile(filePath);
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-tech-parser-"));
  try {
    const decorated = parseFixture(tempDir, "093000", true);
    const plain = parseFixture(tempDir, "093001", false);

    assert.deepEqual(decorated.counts, { techNews: 1, videoItems: 0, aiCreators: 1 });
    assert.deepEqual(plain.counts, decorated.counts, "plain semantic headings must match decorated headings");
    assert.equal(plain.sections.techNews[0].title, "测试主新闻");
    assert.equal(plain.sections.aiCreators[0].title, "测试博主动态");
    console.log("report parser contract ok");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
