// 轻量 Markdown -> HTML 字符串解析器（供 <rich-text> 渲染）。
// 支持：标题、段落、有序/无序列表、引用、代码块、分隔线、
// 加粗(**)、斜体(*)、行内代码(`)、链接、数学式($...$ / $$...$$)。
// 数学式经 utils/latex.js 渲染为真实排版的 HTML（分数/上下标/根号/符号）。
// 注意：rich-text 字符串模式仅支持标准 HTML + 内联 style（使用 px，不要写 rpx）。

const { latexToHtml } = require('./latex');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 裸 LaTeX 自动补 $...$ 定界符（仅用于渲染预览，不改原始数据）。
// AI 返回的"正确答案"常是 \dfrac{3}{10} 这类没包 $ 的公式源码，
// md-render 只认 $...$，这里在渲染前补上：
// - 已含 $ 定位符的不动
// - 没有公式特征（LaTeX 命令、^、_）的纯文本不动
// - 含中文的混合文本不整体包裹，避免被数学排版误伤
function ensureMath(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s || s.indexOf('$') !== -1) return s;
  if (!/\\[a-zA-Z]+|[\^_]/.test(s)) return s;
  if (/[\u4e00-\u9fff]/.test(s)) return s;
  return '$' + s + '$';
}

// 行内：处理 **粗体** *斜体* `代码` $公式$ [链接](url)
function inlineHtml(text) {
  const s = String(text);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '`') {
      const m = /^`([^`]+)`/.exec(s.slice(i));
      if (m) {
        out += '<code style="background:#f2f3f5;padding:1px 5px;border-radius:4px;font-family:monospace;font-size:0.9em;color:#c0341d;">' + esc(m[1]) + '</code>';
        i += m[0].length;
        continue;
      }
    } else if (ch === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
      const closing = s[i + 1] === '(' ? '\\)' : '\\]';
      const end = s.indexOf(closing, i + 2);
      if (end !== -1) {
        out += latexToHtml(s.slice(i + 2, end));
        i = end + 2;
        continue;
      }
    } else if (ch === '\\' && s[i + 1] === '_') {
      out += '_';
      i += 2;
      continue;
    } else if (ch === '$' && s[i + 1] === '$') {
      const m = /^\$\$([^$]+)\$\$/.exec(s.slice(i));
      if (m) { out += latexToHtml(m[1]); i += m[0].length; continue; }
    } else if (ch === '$') {
      const m = /^\$([^$\n]+)\$/.exec(s.slice(i));
      if (m) { out += latexToHtml(m[1]); i += m[0].length; continue; }
    } else if (ch === '*' && s[i + 1] === '*') {
      const m = /^\*\*([\s\S]+?)\*\*/.exec(s.slice(i));
      if (m) { out += '<strong style="font-weight:700;">' + inlineHtml(m[1]) + '</strong>'; i += m[0].length; continue; }
    } else if (ch === '*') {
      const m = /^\*([\s\S]+?)\*/.exec(s.slice(i));
      if (m) { out += '<em style="font-style:italic;">' + inlineHtml(m[1]) + '</em>'; i += m[0].length; continue; }
    } else if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^)]*)\)/.exec(s.slice(i));
      if (m) { out += '<a style="color:#165DFF;" href="' + esc(m[2]) + '">' + inlineHtml(m[1]) + '</a>'; i += m[0].length; continue; }
    }
    if (ch === '\n') { out += '<br/>'; i++; continue; }
    out += esc(ch);
    i++;
  }
  return out;
}

function isBlockStart(l) {
  return (
    /^(#{1,6})\s/.test(l) ||
    /^```/.test(l) ||
    /^>\s?/.test(l) ||
    /^[-*+]\s+/.test(l) ||
    /^\d+\.\s+/.test(l) ||
    /^(\*{3,}|_{3,}|-{3,})\s*$/.test(l)
  );
}

function mdHtml(md) {
  // 数学块中的换行不能被后面的 Markdown 列表规则（如 "+ 2"）拆开。
  // 先保护代码片段，仅合并公式内部的换行，不改保存的原始文本。
  const src = String(md == null ? '' : md).replace(/\r\n?/g, '\n').replace(
    /(```[\s\S]*?```|`[^`\n]*`)|(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
    (match, code) => code ? match : match.replace(/\n/g, ' ')
  );
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 围栏代码块
    const fence = line.match(/^```\s*(\w*)\s*$/);
    if (fence) {
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++;
      out.push('<div style="background:#f6f8fa;padding:10px 12px;border-radius:8px;font-family:monospace;font-size:13px;color:#24292e;white-space:pre;overflow:auto;margin:6px 0;">' + esc(codeLines.join('\n')) + '</div>');
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = { 1: '22px', 2: '20px', 3: '18px', 4: '16px', 5: '15px', 6: '14px' };
      out.push('<div style="font-weight:700;font-size:' + (sizes[level] || '15px') + ';line-height:1.4;margin:12px 0 6px;color:#1f2329;">' + inlineHtml(h[2].trim()) + '</div>');
      i++;
      continue;
    }

    // 分隔线
    if (/^(\*{3,}|_{3,}|-{3,})\s*$/.test(line)) {
      out.push('<div style="height:1px;background:#e5e6eb;margin:10px 0;"></div>');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      const ql = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { ql.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<div style="border-left:4px solid #d0d7de;padding:4px 12px;color:#57606a;background:#f6f8fa;margin:6px 0;font-size:14px;line-height:1.7;">' + inlineHtml(ql.join('\n')) + '</div>');
      continue;
    }

    // 无序列表
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*+]\s+/, '')); i++; }
      out.push('<div style="margin:6px 0;">' + items.map((t) => '<div style="margin:3px 0;line-height:1.7;font-size:14px;"><span style="color:#0b53c9;margin-right:6px;">•</span>' + inlineHtml(t) + '</div>').join('') + '</div>');
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<div style="margin:6px 0;">' + items.map((t, idx) => '<div style="margin:3px 0;line-height:1.7;font-size:14px;"><span style="color:#0b53c9;margin-right:6px;">' + (idx + 1) + '.</span>' + inlineHtml(t) + '</div>').join('') + '</div>');
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    // 段落
    const pl = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) { pl.push(lines[i]); i++; }
    if (pl.length) out.push('<div style="margin:6px 0;font-size:14px;line-height:1.9;overflow-wrap:anywhere;color:#1f2329;">' + inlineHtml(pl.join('\n')) + '</div>');
  }
  return out.join('');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mdHtml, inlineHtml, esc, ensureMath };
}
