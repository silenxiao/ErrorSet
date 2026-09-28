// AI 分析文本解析辅助（与前端 utils/analysis.ts 保持一致）。

// 关键词前缀（"答案是/答案为/故选 X"等），后接答案内容直到行尾/句末标点。
const KEYWORD_SOURCES = ['(?:最终)?答案(?:是|为|应选|选|：|:)', '故选\\s*'];
const VALUE_CLASS = '[^\\n。；;]+';

function keywordMatches(text) {
  const matches = [];
  for (const source of KEYWORD_SOURCES) {
    const pattern = new RegExp(`${source}\\s*(${VALUE_CLASS})`, 'g');
    for (const match of text.matchAll(pattern)) {
      if (match[1].trim()) matches.push({ index: match.index || 0, value: match[1] });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

function hasKeyword(line) {
  return KEYWORD_SOURCES.some((source) => new RegExp(source).test(line));
}

function lastMathToken(line) {
  // 分式等结构化写法优先于裸数字（裸数字会命中 \frac{3}{10} 里的 10）
  const patternGroups = [
    [/\\[dt]?frac\{[^{}]*\}\{[^{}]*\}/g],
    [/\d+(?:\.\d+)?(?:\/\d+)?/g],
  ];
  for (const patterns of patternGroups) {
    let best = null;
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        if (best === null || match.index > best.index) best = match;
      }
    }
    if (best) return best[0];
  }
  return '';
}

// 从单个结论行提取答案：优先取 $...$ 公式段（段内有等号时取最后一个等号后
// 的结果），其次取行内最后一个等号之后的内容，最后取行内最后一个分式/数值。
function extractFromLine(line) {
  if (line.includes('$')) {
    const segments = line.split('$');
    const inside = [];
    for (let i = 1; i < segments.length; i += 2) inside.push(segments[i]);
    for (let i = inside.length - 1; i >= 0; i--) {
      const seg = inside[i].trim();
      if (!seg || /[\u4e00-\u9fff]/.test(seg)) continue;
      const eq = Math.max(seg.lastIndexOf('='), seg.lastIndexOf('＝'));
      const value = eq >= 0 && eq < seg.length - 1 ? seg.slice(eq + 1) : seg;
      if (value.trim()) return `$${value.trim()}$`;
    }
  }
  const eq = Math.max(line.lastIndexOf('='), line.lastIndexOf('＝'));
  if (eq >= 0 && eq < line.length - 1) {
    return line.slice(eq + 1);
  }
  return lastMathToken(line);
}

function cleanAnswer(value) {
  return String(value)
    .replace(/^[：:，,、\s]*(?:即|为|是)?[：:]?\s*/, '')
    .replace(/[。，,、\s。]+$/, '')
    .trim();
}

/**
 * 从 AI 分析文本中提取最终答案结论。
 * 用于"正确答案"与"AI分析"不一致时，以分析结论为准：
 * 1) 取最后一个含"答案是/为/选 X""故选 X"的句子；
 * 2) 末尾几行若没有关键词（如"阴影面积 = 0.3 = $\frac{3}{10}$"这种
 *    算式结论，模型自我纠正后不再写"答案"二字），以末行算式结果为准，
 *    且末行结论晚于关键词结论时覆盖关键词结论。
 * 提取不到时返回空串，调用方回退到"正确答案"段的原文。
 */
function extractAnswerFromAnalysis(analysis) {
  const text = String(analysis || '');
  const matches = keywordMatches(text);
  const lastMatch = matches.length ? matches[matches.length - 1] : null;

  const lines = [...text.matchAll(/[^\r\n]+/g)].filter((m) => m[0].trim());
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 3; i--) {
    const line = lines[i];
    if (hasKeyword(line[0])) break;
    const candidate = extractFromLine(line[0].trim());
    if (candidate) {
      if (!lastMatch || line.index > lastMatch.index) return cleanAnswer(candidate);
      break;
    }
  }
  return lastMatch ? cleanAnswer(lastMatch.value) : '';
}

module.exports = { extractAnswerFromAnalysis };
