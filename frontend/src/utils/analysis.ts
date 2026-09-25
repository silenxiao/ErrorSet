/** AI 分析文本解析辅助 */

/**
 * 从 AI 分析文本中提取最终答案结论。
 * 用于"正确答案"与"AI分析"不一致时，以分析结论为准：
 * 取最后一个含"答案是/为/选 X""故选 X"的句子（结论通常在末尾）。
 * 提取不到时返回空串，调用方回退到"正确答案"段的原文。
 */
export function extractAnswerFromAnalysis(analysis: string): string {
  const matches: string[] = [];
  const patterns = [
    /(?:最终)?答案(?:是|为|应选|选|：|:)\s*([^\n。；;]+)/g,
    /故选\s*([^\n。；;]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of analysis.matchAll(pattern)) {
      const value = match[1].trim();
      if (value) {
        matches.push(value);
      }
    }
  }
  return (matches[matches.length - 1] ?? "").replace(/[。，,、\s]+$/, "").trim();
}
