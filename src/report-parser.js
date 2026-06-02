const fs = require("node:fs");
const path = require("node:path");

const REPORT_PATTERN = /^(\d{4}-\d{2}-\d{2})-(\d{6})-资讯采集\.md$/;

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listReportSnapshots(archiveDir) {
  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  return fs
    .readdirSync(archiveDir)
    .map((name) => {
      const match = name.match(REPORT_PATTERN);
      if (!match) {
        return null;
      }
      const [, date, time] = match;
      return {
        name,
        path: path.join(archiveDir, name),
        date,
        time,
        sortKey: `${date}-${time}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

function getLatestSnapshot(archiveDir) {
  return listReportSnapshots(archiveDir)[0] || null;
}

function getLatestSnapshotForDate(archiveDir, date) {
  return listReportSnapshots(archiveDir).find((item) => item.date === date) || null;
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    return "";
  }
  const sliced = text.slice(start + startMarker.length);
  if (!endMarker) {
    return sliced.trim();
  }
  const end = sliced.indexOf(endMarker);
  return (end === -1 ? sliced : sliced.slice(0, end)).trim();
}

function parseMeta(content, filePath) {
  const titleLine = content.match(/^#\s+(.+)$/m);
  const generatedAt = content.match(/^\*生成时间:\s*(.+)\*$/m);
  const slot = content.match(/^\*快照版本:\s*(.+)\*$/m);
  const total = content.match(/^\*总计:\s*(.+)\*$/m);
  const headline = titleLine ? titleLine[1].trim() : path.basename(filePath);
  const fileName = path.basename(filePath);
  const dateMatch = fileName.match(REPORT_PATTERN);
  return {
    title: headline,
    generatedAt: generatedAt ? generatedAt[1].trim() : "",
    slot: slot ? slot[1].trim() : "",
    total: total ? total[1].trim() : "",
    date: dateMatch ? dateMatch[1] : "",
    snapshotTime: dateMatch ? dateMatch[2] : "",
    sourceFile: filePath,
  };
}

function parseItems(sectionText) {
  const blocks = sectionText
    .split(/\n(?=####\s+\d+\.\s+)/g)
    .map((part) => part.trim())
    .filter((part) => /^####\s+\d+\.\s+/.test(part));

  return blocks.map((block) => {
    const titleMatch = block.match(/^####\s+(\d+)\.\s+(.+)$/m);
    const sourceMatch = block.match(/\*\*来源\*\*:\s*(.+?)\s{2,}$/m);
    const linkMatch = block.match(/\*\*链接\*\*:\s*(.+?)\s{2,}$/m);
    const summary = extractBetween(block, "**摘要**:", "\n\n**产业影响**");
    const impact = extractBetween(block, "**产业影响**：", "\n\n#### ");
    const fallbackImpact = impact || extractBetween(block, "**产业影响**:", "\n\n#### ");
    return {
      rank: titleMatch ? Number(titleMatch[1]) : 0,
      title: titleMatch ? titleMatch[2].trim() : "",
      source: sourceMatch ? sourceMatch[1].trim() : "",
      link: linkMatch ? linkMatch[1].trim() : "",
      summary: summary.trim(),
      impact: fallbackImpact.trim(),
    };
  });
}

function parseSection(content, heading) {
  const sectionStart = content.indexOf(heading);
  if (sectionStart === -1) {
    return [];
  }
  const remaining = content.slice(sectionStart + heading.length);
  const nextDivider = remaining.search(/\n##\s+|\n---/);
  const sectionBody = nextDivider === -1 ? remaining : remaining.slice(0, nextDivider);
  return parseItems(sectionBody);
}

function parseReportFile(filePath) {
  const content = readUtf8(filePath);
  const meta = parseMeta(content, filePath);
  const techNews = parseSection(content, "## 📰 主新闻");
  const aiCreators = parseSection(content, "## 👤 AI 资讯博主");
  const videoItems = parseSection(content, "## 🎬 视频 / 播客");

  return {
    ...meta,
    heroNote: "本版内容已整理为摘要、产业影响和原文入口。",
    sections: {
      techNews,
      videoItems,
      aiCreators,
    },
    counts: {
      techNews: techNews.length,
      videoItems: videoItems.length,
      aiCreators: aiCreators.length,
    },
  };
}

module.exports = {
  listReportSnapshots,
  getLatestSnapshot,
  getLatestSnapshotForDate,
  parseReportFile,
};
