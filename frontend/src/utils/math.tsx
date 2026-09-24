import katex from "katex";
import { Fragment, type ReactNode } from "react";

/** 把题目文本中的 $...$ / $$...$$ 渲染为 KaTeX，其余原样输出。 */
export function renderMathText(text: string): ReactNode {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
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
