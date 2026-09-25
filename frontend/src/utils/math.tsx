import katex from "katex";
import { Fragment, type ReactNode } from "react";

/** 把题目文本中的 $...$ / $$...$$ 渲染为 KaTeX，其余原样输出。 */
export function renderMathText(text: string): ReactNode {
  const parts = autoWrapLatex(text).split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  return parts.map((part, index) => {
    if (part.startsWith("$$") && part.endsWith("$$") && part.length > 4) {
      return <MathSpan key={index} tex={part.slice(2, -2)} displayMode />;
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      return <MathSpan key={index} tex={part.slice(1, -1)} displayMode={false} />;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function MathSpan({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  try {
    const html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
    });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <span>{tex}</span>;
  }
}

/** 数学符号之外的字符：用于圈出裸 LaTeX 所在的连续片段 */
const MATHISH = /^[A-Za-z0-9+\-*/=(){}[\]^_.,<>|×÷°\t \\]$/;

function balancedBraces(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function isRenderableLatex(s: string): boolean {
  if (!/\\[a-zA-Z]+/.test(s) || !balancedBraces(s)) {
    return false;
  }
  try {
    katex.renderToString(s, { displayMode: false, throwOnError: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 把未加 $ 定界符的裸 LaTeX（如模型直接输出 \dfrac{3}{10}）自动包上 $...$。
 * 以 \command 为锚点向两侧扩展连续的数学字符片段，且必须整体能被
 * KaTeX 解析才包裹；已有定界符的公式先占位保护，不动原文。
 */
export function autoWrapLatex(text: string): string {
  const placeholders: string[] = [];
  const shielded = text.replace(
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
    (match) => {
      placeholders.push(match);
      return `\u0000${placeholders.length - 1}\u0000`;
    },
  );

  const command = /\\[a-zA-Z]/g;
  let out = "";
  let pos = 0;
  let match: RegExpExecArray | null;
  while ((match = command.exec(shielded)) !== null) {
    const anchor = match.index;
    // 向两侧扩展连续数学字符片段
    let start = anchor;
    while (start > 0 && MATHISH.test(shielded[start - 1] ?? "")) start -= 1;
    let end = anchor + match[0].length;
    while (end < shielded.length && MATHISH.test(shielded[end])) end += 1;
    const raw = shielded.slice(start, end);
    const lead = raw.slice(0, raw.length - raw.trimStart().length);
    const core = raw.trim();
    const tail = raw.slice(raw.trimEnd().length);
    if (isRenderableLatex(core)) {
      out += `${shielded.slice(pos, start)}${lead}$${core}$${tail}`;
      pos = end;
      command.lastIndex = end;
    }
    // 不可渲染时保留原文，从该命令之后继续找下一段
  }
  out += shielded.slice(pos);
  return out.replace(/\u0000(\d+)\u0000/g, (_, index) =>
    placeholders[Number(index)] ?? "",
  );
}
