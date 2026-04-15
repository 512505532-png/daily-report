/**
 * 将 Markdown 日报文件转换为产品级卡片式 HTML
 * 参考 tanqiutong.github.io/art-report 设计风格
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(__dirname, 'reports');

const files = fs.readdirSync(SRC_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}-未成年动态日报\.md$/.test(f))
  .sort();

console.log(`Found ${files.length} report files`);

const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

function getWeekday(dateStr) {
  return WEEKDAYS[new Date(dateStr).getDay()];
}

/**
 * 解析 Markdown 日报为结构化数据
 */
function parseMd(md) {
  const result = {
    title: '',
    dateLine: '',
    sections: [],     // {type:'domestic'|'international'|'summary'|'thinking', title:'', items:[]}
  };

  // 提取标题和日期
  const titleMatch = md.match(/^# (.+)$/m);
  if (titleMatch) result.title = titleMatch[1];
  const dateLineMatch = md.match(/\*\*日期：(.+)\*\*/);
  if (dateLineMatch) result.dateLine = dateLineMatch[1];

  // 按 ## 分割板块
  const sectionBlocks = md.split(/^## /m).filter(s => s.trim());

  for (const block of sectionBlocks) {
    const lines = block.split('\n');
    const sectionTitle = lines[0].trim();

    let type = 'other';
    if (sectionTitle.includes('国内')) type = 'domestic';
    else if (sectionTitle.includes('国际')) type = 'international';
    else if (sectionTitle.includes('总结') || sectionTitle.includes('趋势')) type = 'summary';
    else if (sectionTitle.includes('思考')) type = 'thinking';

    if (type === 'other') continue;

    // 按 ### 分割每条动态
    const itemBlocks = block.split(/^### /m).slice(1);
    const items = [];

    for (const itemBlock of itemBlocks) {
      const itemLines = itemBlock.split('\n');
      const itemTitle = itemLines[0].trim();

      // 提取元数据
      let source = '', timing = '', links = [], content = [], impact = '';
      let inContent = false;

      for (let i = 1; i < itemLines.length; i++) {
        const line = itemLines[i];
        const stripped = line.replace(/^[-\s]*/, '');

        if (stripped.startsWith('**来源：**') || stripped.startsWith('**来源:**')) {
          source = stripped.replace(/\*\*来源[：:]\*\*\s*/, '');
        } else if (stripped.startsWith('**时效：**') || stripped.startsWith('**时效:**')) {
          timing = stripped.replace(/\*\*时效[：:]\*\*\s*/, '');
        } else if (stripped.startsWith('**链接：**') || stripped.startsWith('**链接:**')) {
          const linkStr = stripped.replace(/\*\*链接[：:]\*\*\s*/, '');
          const linkMatches = linkStr.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
          for (const m of linkMatches) {
            links.push({ text: m[1], url: m[2] });
          }
        } else if (stripped.startsWith('**值得关注：**') || stripped.startsWith('**值得关注:**')) {
          impact = stripped.replace(/\*\*值得关注[：:]\*\*\s*/, '');
        } else if (stripped.startsWith('**内容：**') || stripped.startsWith('**内容:**')) {
          content.push(stripped.replace(/\*\*内容[：:]\*\*\s*/, ''));
          inContent = true;
        } else if (stripped.startsWith('**跟进') || stripped.startsWith('**核心')) {
          content.push(stripped);
        } else if (line.trim().startsWith('- ') || line.trim().startsWith('  -')) {
          content.push(line);
        } else if (line.trim()) {
          content.push(line);
        }
      }

      items.push({
        title: itemTitle,
        source, timing, links, impact,
        content: content.join('\n')
      });
    }

    result.sections.push({ type, title: sectionTitle, items, rawBlock: block });
  }

  return result;
}

/**
 * 简单 inline markdown 转 HTML
 */
function inlineMd(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

/**
 * 将内容文本转为HTML列表/段落
 */
function contentToHtml(content) {
  if (!content) return '';
  const lines = content.split('\n').filter(l => l.trim());
  let html = '';
  let inUl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      if (!inUl) { html += '<ul>'; inUl = true; }
      const indent = line.search(/\S/);
      const text = trimmed.replace(/^-\s+/, '');
      html += '<li>' + inlineMd(text) + '</li>';
    } else {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (trimmed) html += '<p>' + inlineMd(trimmed) + '</p>';
    }
  }
  if (inUl) html += '</ul>';
  return html;
}

/**
 * 判断标签类型
 */
function getTagInfo(title) {
  if (title.includes('【新·重大】') || title.includes('【重磅】')) return { label: '🔴 重大', color: '#dc2626', bg: '#fef2f2' };
  if (title.includes('【新】')) return { label: '✦ 新增', color: '#d97706', bg: '#fffbeb' };
  if (title.includes('【跟进】')) return { label: '🔄 跟进', color: '#2563eb', bg: '#eff6ff' };
  return { label: '', color: '', bg: '' };
}

/**
 * 判断影响等级
 */
function getImpactLevel(title, content) {
  if (title.includes('重大') || title.includes('重磅')) return '极高';
  if (title.includes('新·')) return '高';
  if (title.includes('跟进')) return '中';
  return '中';
}

/**
 * 生成单条动态的卡片HTML
 */
function itemToCard(item, index) {
  const tag = getTagInfo(item.title);
  const impact = getImpactLevel(item.title, item.content);
  const impactColor = impact === '极高' ? '#dc2626' : impact === '高' ? '#d97706' : '#2563eb';
  const borderColor = tag.label.includes('重大') ? '#dc2626' : tag.label.includes('新增') ? '#10b981' : '#3b82f6';

  // 清理标题中的标签
  let cleanTitle = item.title
    .replace(/【新·重大】/g, '').replace(/【重磅】/g, '')
    .replace(/【新】/g, '').replace(/【跟进】/g, '').trim();

  // 标题链接：取第一个报道链接
  const titleUrl = item.links.length > 0 ? item.links[0].url : '';

  let html = `<div class="card" style="border-left: 4px solid ${borderColor};">`;
  html += `<div class="card-header">`;
  html += `<h3 class="card-title">`;
  if (titleUrl) {
    html += `<a href="${titleUrl}" target="_blank" class="card-title-link">${inlineMd(cleanTitle)}</a>`;
  } else {
    html += inlineMd(cleanTitle);
  }
  if (tag.label) html += ` <span class="tag-new" style="background:${tag.bg};color:${tag.color}">${tag.label}</span>`;
  html += `</h3></div>`;

  // meta行
  html += `<div class="card-meta">`;
  if (impact) html += `<span class="tag-impact" style="color:${impactColor}">影响：${impact}</span>`;
  if (item.source) html += `<span>${inlineMd(item.source)}</span>`;
  if (item.timing) html += `<span>${inlineMd(item.timing)}</span>`;
  html += `</div>`;

  // body
  html += `<div class="card-body">${contentToHtml(item.content)}</div>`;

  // impact box
  if (item.impact) {
    html += `<div class="card-impact"><strong>→ 值得关注：</strong>${inlineMd(item.impact)}</div>`;
  }

  // links
  if (item.links.length > 0) {
    html += `<div class="link-list">`;
    for (const link of item.links) {
      html += `<a href="${link.url}" target="_blank">📄 ${link.text}</a>`;
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function getCircleNum(n) {
  const nums = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  return nums[n] || `(${n})`;
}

/**
 * 生成总结和思考板块
 */
function sectionToRawHtml(block) {
  let html = '';
  const lines = block.split('\n');
  let inTable = false;
  let tableRows = [];
  let tableHeaders = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 跳过板块标题（已在外面处理）
    if (i === 0) continue;

    // 表格
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeaders = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
        continue;
      }
      if (trimmed.match(/^\|[\s:|-]+\|$/)) continue; // 分隔行
      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      tableRows.push(cells);
      continue;
    }

    if (inTable) {
      // 输出表格
      html += '<table><thead><tr>';
      for (const h of tableHeaders) html += `<th>${inlineMd(h)}</th>`;
      html += '</tr></thead><tbody>';
      for (const row of tableRows) {
        html += '<tr>';
        for (const cell of row) html += `<td>${inlineMd(cell)}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
      inTable = false;
      tableRows = [];
      tableHeaders = [];
    }

    // 标题
    if (trimmed.startsWith('### ')) {
      html += `<h3 class="sub-heading">${inlineMd(trimmed.slice(4))}</h3>`;
    } else if (trimmed.startsWith('#### ')) {
      html += `<h4>${inlineMd(trimmed.slice(5))}</h4>`;
    } else if (trimmed.startsWith('- ')) {
      html += `<ul><li>${inlineMd(trimmed.slice(2))}</li></ul>`;
    } else if (trimmed.startsWith('---')) {
      html += '<hr>';
    } else if (trimmed) {
      html += `<p>${inlineMd(trimmed)}</p>`;
    }
  }

  // 残留表格
  if (inTable && tableHeaders.length > 0) {
    html += '<table><thead><tr>';
    for (const h of tableHeaders) html += `<th>${inlineMd(h)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of tableRows) {
      html += '<tr>';
      for (const cell of row) html += `<td>${inlineMd(cell)}</td>`;
      html += '</tr>';
    }
    html += '</tbody></table>';
  }

  return html;
}

/**
 * 完整HTML模板
 */
function generateHtml(data, date) {
  const weekday = getWeekday(date);
  const domesticSections = data.sections.filter(s => s.type === 'domestic');
  const intlSections = data.sections.filter(s => s.type === 'international');
  const summarySections = data.sections.filter(s => s.type === 'summary');
  const thinkingSections = data.sections.filter(s => s.type === 'thinking');

  const domesticCount = domesticSections.reduce((a, s) => a + s.items.length, 0);
  const intlCount = intlSections.reduce((a, s) => a + s.items.length, 0);
  const totalCount = domesticCount + intlCount;

  // 提取核心判断作为一句话结论
  let coreConclusion = '';
  for (const s of summarySections) {
    const match = s.rawBlock.match(/\*\*核心判断[：:]\*\*\s*(.+)/);
    if (match) coreConclusion = match[1];
  }

  // 提取行动建议表格（从思考板块）
  let actionItems = [];
  for (const s of thinkingSections) {
    // 匹配"行动项"表格行：| 🔴紧急 | xxx | xxx | xxx |  或  | 🟡重要 | xxx | xxx | xxx |
    const tableLines = s.rawBlock.split('\n').filter(l => l.trim().startsWith('|'));
    let headerFound = false;
    for (const line of tableLines) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      if (cells.length < 3) continue;
      // 跳过表头和分隔行
      if (cells[0].includes('优先级') || cells[0].includes('级别') || cells[0].match(/^[\s:|-]+$/)) { headerFound = true; continue; }
      if (line.match(/^\|[\s:|-]+\|$/)) continue;
      // 有🔴或🟡标记的是行动项
      if (cells[0].includes('🔴') || cells[0].includes('🟡') || cells[0].includes('🟢')) {
        actionItems.push({
          priority: cells[0],
          action: cells[1] || '',
          event: cells.length > 2 ? cells[2] : '',
          deadline: cells.length > 3 ? cells[3] : ''
        });
      }
    }

    // 如果没找到表格，尝试提取"### 二、总结"部分的文字要点
    if (actionItems.length === 0) {
      const summaryMatch = s.rawBlock.match(/### 二、总结[：:]?\s*三件事([\s\S]*?)(?=---|\n## |\n#|$)/);
      if (summaryMatch) {
        const bullets = summaryMatch[1].match(/\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|/g);
        if (bullets) {
          for (const b of bullets) {
            const cells = b.split('|').filter(c => c.trim()).map(c => c.trim());
            if (cells.length >= 3 && (cells[0].includes('🔴') || cells[0].includes('🟡'))) {
              actionItems.push({ priority: cells[0], action: cells[1], event: cells[2], deadline: cells[3] || '' });
            }
          }
        }
      }
    }
  }

  // 提取"我们能做什么"的关键要点
  let actionHighlights = [];
  for (const s of thinkingSections) {
    const doMatches = s.rawBlock.matchAll(/\*\*我们能做什么[：:]\*\*([\s\S]*?)(?=####|\n### |\n## |$)/g);
    for (const m of doMatches) {
      const bullets = m[1].match(/- \*\*(.+?)\*\*/g);
      if (bullets) {
        for (const b of bullets) {
          const text = b.replace(/^- \*\*/, '').replace(/\*\*$/, '').replace(/[：:]$/, '');
          if (text.length > 5 && text.length < 80) {
            actionHighlights.push(text);
          }
        }
      }
    }
  }

  let bodyHtml = '';

  // ═══ 与腾讯未保的关系及行动建议（置顶高亮框） ═══
  if (actionItems.length > 0 || actionHighlights.length > 0) {
    bodyHtml += `
    <div class="action-box">
      <div class="action-box-title">💡 与腾讯未保的关系及行动建议</div>`;

    // 行动优先级表格
    if (actionItems.length > 0) {
      bodyHtml += `<table class="action-table">
        <thead><tr><th>优先级</th><th>行动项</th><th>对应事件</th><th>截止</th></tr></thead><tbody>`;
      for (const item of actionItems) {
        const rowClass = item.priority.includes('🔴') ? 'action-urgent' : 'action-important';
        bodyHtml += `<tr class="${rowClass}">
          <td>${inlineMd(item.priority)}</td>
          <td>${inlineMd(item.action)}</td>
          <td>${inlineMd(item.event)}</td>
          <td>${inlineMd(item.deadline)}</td>
        </tr>`;
      }
      bodyHtml += `</tbody></table>`;
    }

    // 关键行动要点标签
    if (actionHighlights.length > 0) {
      bodyHtml += `<div class="action-highlights">`;
      const shown = actionHighlights.slice(0, 6);
      for (const h of shown) {
        bodyHtml += `<span class="action-tag">→ ${inlineMd(h)}</span>`;
      }
      bodyHtml += `</div>`;
    }

    bodyHtml += `<div class="action-hint">详见底部「💡 思考」板块完整分析</div></div>`;
  }

  // ═══ 数据概览 ═══
  bodyHtml += `
    <div class="dashboard">
      <div class="dash-item">
        <div class="dash-num" style="color:#dc2626">${domesticCount}</div>
        <div class="dash-label">🇨🇳 国内动态</div>
      </div>
      <div class="dash-item">
        <div class="dash-num" style="color:#2563eb">${intlCount}</div>
        <div class="dash-label">🌍 国际动态</div>
      </div>
      <div class="dash-item">
        <div class="dash-num" style="color:#059669">${totalCount}</div>
        <div class="dash-label">📊 动态合计</div>
      </div>
    </div>`;

  // ═══ 国内动态 ═══
  if (domesticCount > 0) {
    bodyHtml += `<section class="section">`;
    bodyHtml += `<div class="section-title"><span class="section-icon" style="background:#dc2626">🇨🇳</span> 国内动态 (${domesticCount}条)</div>`;
    for (const sec of domesticSections) {
      for (let i = 0; i < sec.items.length; i++) {
        bodyHtml += itemToCard(sec.items[i], i);
      }
    }
    bodyHtml += `</section>`;
  }

  // ═══ 国际动态 ═══
  if (intlCount > 0) {
    bodyHtml += `<section class="section">`;
    bodyHtml += `<div class="section-title"><span class="section-icon" style="background:#2563eb">🌍</span> 国际动态 (${intlCount}条)</div>`;
    for (const sec of intlSections) {
      for (let i = 0; i < sec.items.length; i++) {
        bodyHtml += itemToCard(sec.items[i], i);
      }
    }
    bodyHtml += `</section>`;
  }

  // ═══ 总结与趋势研判 ═══
  if (summarySections.length > 0) {
    bodyHtml += `<section class="section">`;
    bodyHtml += `<div class="section-title"><span class="section-icon" style="background:#7c3aed">📈</span> 总结与趋势研判</div>`;
    for (const sec of summarySections) {
      bodyHtml += sectionToRawHtml(sec.rawBlock);
    }
    bodyHtml += `</section>`;
  }

  // ═══ 思考 ═══
  if (thinkingSections.length > 0) {
    bodyHtml += `<section class="section thinking-section">`;
    bodyHtml += `<div class="section-title"><span class="section-icon" style="background:#d97706">💡</span> 思考：与腾讯成长守护平台的关系及行动建议</div>`;
    for (const sec of thinkingSections) {
      bodyHtml += sectionToRawHtml(sec.rawBlock);
    }
    bodyHtml += `</section>`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>未成年人动态日报 · ${date}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap');
:root {
  --bg: #f0f4f8;
  --card-bg: #ffffff;
  --text-main: #1a2e3d;
  --text-sub: #4a6b7f;
  --text-muted: #8ba3b5;
  --blue: #1890ff;
  --blue-dark: #0d47a1;
  --teal: #36cfc9;
  --red: #dc2626;
  --green: #10b981;
  --amber: #d97706;
  --purple: #7c3aed;
  --border: #e2e8f0;
  --shadow: 0 1px 3px rgba(0,0,0,0.06);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--bg);
  color: var(--text-main);
  line-height: 1.7;
  margin: 0; padding: 0;
}
.container { max-width: 900px; margin: 0 auto; padding: 0 16px; }

/* ══ Header ══ */
.report-header {
  background: linear-gradient(135deg, #0d47a1 0%, #1890ff 50%, #36cfc9 100%);
  color: #fff;
  text-align: center;
  padding: 36px 20px 28px;
  position: relative;
}
.report-header::after {
  content: '';
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 4px;
  background: linear-gradient(90deg, #0d47a1, #1890ff, #36cfc9, #1890ff, #0d47a1);
}
.report-header h1 {
  font-size: 24px; font-weight: 700;
  margin-bottom: 6px; letter-spacing: .05em;
}
.report-header .subtitle {
  font-size: 14px; color: rgba(255,255,255,.7);
  margin-bottom: 12px;
}
.report-header .legend {
  font-size: 11px; color: rgba(255,255,255,.5);
}
.report-header .legend .tag-demo {
  display: inline-block;
  padding: 1px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 600; margin: 0 2px;
}

/* ══ Highlight box ══ */
.highlight-box {
  background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 24px 0;
}

/* ══ Action Box (行动建议速览) ══ */
.action-box {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fcd34d;
  border-left: 4px solid #f59e0b;
  border-radius: 12px;
  padding: 20px 24px;
  margin: 24px 0;
}
.action-box-title {
  color: #92400e; font-weight: 700; font-size: 16px;
  margin-bottom: 14px;
}
.action-table {
  width: 100%; border-collapse: collapse;
  margin: 0 0 12px; font-size: 13px;
  background: #fff; border-radius: 8px; overflow: hidden;
}
.action-table th {
  background: #b45309; color: #fff;
  font-weight: 600; padding: 8px 12px; text-align: left;
  font-size: 12px;
}
.action-table td {
  padding: 8px 12px; border-bottom: 1px solid #fde68a;
  color: #78350f; font-size: 13px;
}
.action-table tr.action-urgent td { background: #fef2f2; }
.action-table tr.action-important td { background: #fffbeb; }
.action-table tr:hover td { background: #fef9c3; }
.action-highlights {
  display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0;
}
.action-tag {
  display: inline-block; font-size: 12px;
  color: #92400e; background: rgba(255,255,255,.7);
  border: 1px solid #fcd34d;
  padding: 4px 12px; border-radius: 6px;
  line-height: 1.5;
}
.action-hint {
  font-size: 11px; color: #b45309; margin-top: 8px;
  opacity: .7;
}
.highlight-title {
  color: #166534; font-weight: 700; font-size: 16px;
  margin-bottom: 10px;
}
.highlight-content {
  color: #15803d; font-size: 14px; line-height: 1.8;
}

/* ══ Dashboard ══ */
.dashboard {
  display: flex; gap: 12px; margin: 20px 0 28px; flex-wrap: wrap;
}
.dash-item {
  flex: 1; min-width: 120px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px; text-align: center;
  box-shadow: var(--shadow);
}
.dash-num { font-size: 32px; font-weight: 700; line-height: 1.2; }
.dash-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* ══ Section ══ */
.section {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.section-title {
  font-size: 17px; font-weight: 700;
  margin-bottom: 20px;
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border);
}
.section-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  font-size: 14px; color: #fff; flex-shrink: 0;
}

/* ══ Card ══ */
.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 16px;
  background: #fff;
  transition: box-shadow .2s;
}
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
.card-header { margin-bottom: 8px; }
.card-title {
  font-weight: 700; font-size: 15px; margin: 0;
  color: #111827; line-height: 1.5;
  display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap;
}
.card-title-link {
  color: #111827; text-decoration: none;
  border-bottom: 1px dashed #91caff;
  transition: all .2s;
}
.card-title-link:hover {
  color: var(--blue); border-bottom-color: var(--blue);
  border-bottom-style: solid;
}
.card-num {
  color: var(--blue); font-weight: 700; flex-shrink: 0;
}
.tag-new {
  display: inline-block;
  font-size: 10px; padding: 2px 8px; border-radius: 4px;
  font-weight: 700; white-space: nowrap;
  vertical-align: middle; flex-shrink: 0;
}
.card-meta {
  font-size: 12px; color: var(--text-muted);
  display: flex; gap: 12px; flex-wrap: wrap;
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--border);
}
.tag-impact { font-weight: 700; }
.card-body { font-size: 14px; color: var(--text-sub); }
.card-body p { margin: 6px 0; }
.card-body ul { margin: 6px 0 6px 20px; }
.card-body li { margin: 4px 0; }
.card-body strong { color: var(--text-main); }
.card-impact {
  background: #fff7ed; color: #9a3412;
  padding: 12px 16px; border-radius: 8px;
  margin-top: 12px; font-size: 13px; line-height: 1.7;
  border-left: 3px solid var(--amber);
}
.link-list {
  margin-top: 12px; font-size: 12px;
  display: flex; gap: 12px; flex-wrap: wrap;
}
.link-list a {
  color: var(--blue); text-decoration: none;
  padding: 3px 10px; border-radius: 4px;
  border: 1px solid #e0e7ff;
  background: #f8faff;
  transition: all .15s;
}
.link-list a:hover { background: var(--blue); color: #fff; border-color: var(--blue); }

/* ══ 总结/思考板块 ══ */
.section table {
  width: 100%; border-collapse: collapse;
  margin: 16px 0; font-size: 13px;
}
.section th {
  background: linear-gradient(135deg, var(--blue-dark), var(--blue));
  color: #fff; font-weight: 600;
  padding: 10px 14px; text-align: left;
}
.section td {
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  color: var(--text-sub);
}
.section tr:hover td { background: #f8faff; }
.section h3.sub-heading {
  font-size: 14px; font-weight: 700;
  color: var(--text-main);
  margin: 18px 0 10px;
  padding-left: 12px;
  border-left: 3px solid var(--blue);
}
.section h4 {
  font-size: 13px; font-weight: 600;
  color: var(--text-sub); margin: 14px 0 8px;
}
.section p { font-size: 14px; color: var(--text-sub); margin: 6px 0; }
.section ul { font-size: 14px; margin: 6px 0 6px 20px; }
.section li { margin: 4px 0; color: var(--text-sub); }
.section a { color: var(--blue); text-decoration: none; }
.section a:hover { text-decoration: underline; }
.section hr { border: none; height: 1px; background: var(--border); margin: 20px 0; }

.thinking-section {
  border-top: 3px solid var(--amber);
}

/* ══ Footer ══ */
.report-footer {
  text-align: center; font-size: 12px;
  color: var(--text-muted);
  padding: 28px 16px;
  border-top: 1px solid var(--border);
  margin-top: 12px;
  background: #f8fafc;
}
.report-footer strong { color: var(--text-sub); }

/* ══ Responsive ══ */
@media (max-width: 600px) {
  .report-header h1 { font-size: 20px; }
  .container { padding: 0 10px; }
  .section { padding: 16px; }
  .card { padding: 14px; }
  .dash-item { min-width: 90px; padding: 12px; }
  .dash-num { font-size: 24px; }
}
</style>
</head>
<body>

<header class="report-header">
  <h1>🛡️ 未成年人网络保护 · 每日动态日报</h1>
  <div class="subtitle">${date} ${weekday} · 共${totalCount}条动态</div>
  <div class="legend">
    <span class="tag-demo" style="background:#fef2f2;color:#dc2626">🔴 重大</span>
    <span class="tag-demo" style="background:#fffbeb;color:#d97706">✦ 新增</span>
    <span class="tag-demo" style="background:#eff6ff;color:#2563eb">🔄 跟进</span>
    = 标签含义
  </div>
</header>

<div class="container">
<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:20px 0 0;">
  <span style="font-size:11px;color:#4a6b7f;border:1px solid #e2e8f0;padding:3px 12px;border-radius:20px;">🏢 大型互联网及游戏公司动态</span>
  <span style="font-size:11px;color:#4a6b7f;border:1px solid #e2e8f0;padding:3px 12px;border-radius:20px;">🇨🇳 国内未保监管动态</span>
  <span style="font-size:11px;color:#4a6b7f;border:1px solid #e2e8f0;padding:3px 12px;border-radius:20px;">🌍 国外监管及公司动态</span>
</div>
${bodyHtml}
</div>

<footer class="report-footer">
  <p><strong>🛡️ 未成年人网络保护 · 每日动态日报</strong> | ${date} ${weekday}</p>
  <p>覆盖：游戏 · 社交 · 直播 · 短视频 · 短剧 · 智能终端 · 网络消费 七大数字场景</p>
  <p style="margin-top:8px;color:#b0b8c1;">数据来源：公开网络信息 · 由 WorkBuddy 自动化驱动</p>
</footer>

</body>
</html>`;
}

// ═══ 主流程 ═══
const indexData = [];

for (const file of files) {
  const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) continue;
  const date = dateMatch[1];

  const md = fs.readFileSync(path.join(SRC_DIR, file), 'utf-8');
  const data = parseMd(md);
  const html = generateHtml(data, date);
  const outFile = `${date}.html`;

  fs.writeFileSync(path.join(OUT_DIR, outFile), html, 'utf-8');
  console.log(`  ✓ ${file} -> reports/${outFile}`);

  // 摘要
  const firstItem = data.sections.flatMap(s => s.items)[0];
  const summary = firstItem ? firstItem.title.substring(0, 80) : '';

  // 条数
  const domesticCount = data.sections.filter(s => s.type === 'domestic').reduce((a, s) => a + s.items.length, 0);
  const intlCount = data.sections.filter(s => s.type === 'international').reduce((a, s) => a + s.items.length, 0);

  indexData.push({
    date: date,
    file: outFile,
    summary: summary,
    count: domesticCount + intlCount
  });
}

indexData.sort((a, b) => b.date.localeCompare(a.date));

fs.writeFileSync(
  path.join(__dirname, 'reports-index.json'),
  JSON.stringify(indexData, null, 2),
  'utf-8'
);

console.log(`\n✓ Generated ${indexData.length} HTML reports`);
console.log(`✓ Written reports-index.json`);
