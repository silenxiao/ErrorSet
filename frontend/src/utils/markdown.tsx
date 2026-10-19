import katex from "katex";
import { Fragment, type ReactNode } from "react";
import { marked, type Token, type Tokens } from "marked";

import { autoWrapLatex, renderMathText } from "./math";
import "./markdown.css";

/** 区分块级 token 与行内 token：tight 列表的 item.tokens 直接是行内 token。 */
function isBlockToken(token: Token): boolean {
  switch (token.type) {
    case "paragraph":
    case "heading":
    case "list":
    case "table":
    case "blockquote":
    case "code":
    case "hr":
    case "space":
    case "def":
      return true;
    case "html":
      return token.block;
    default:
      return false;
  }
}

/** Render a safe Markdown subset (GFM + KaTeX math) used by answers. */
export function renderMarkdown(text: string): ReactNode {
  const tokens = marked.lexer(text, { gfm: true, breaks: true });
  return renderBlocks(tokens);
}

/** 题干只解析表格，保留其余原文的换行、填空线和公式语义。 */
export function renderQuestionText(text: string): ReactNode {
  const tokens = marked.lexer(text, { gfm: true });
  const blocks: ReactNode[] = [];
  let plainText = "";
  const flushText = () => {
    if (!plainText) return;
    blocks.push(<div key={blocks.length} style={{ whiteSpace: "pre-wrap" }}>{renderMathText(plainText)}</div>);
    plainText = "";
  };
  for (const token of tokens) {
    if (token.type === "table") {
      flushText();
      blocks.push(renderBlock(token, blocks.length));
    } else {
      plainText += token.raw;
    }
  }
  flushText();
  return <div className="answer-markdown-preview question-markdown-preview">{blocks}</div>;
}

function renderBlocks(tokens: Token[] | undefined): ReactNode {
  return (tokens ?? []).map((token, index) =>
    isBlockToken(token) ? renderBlock(token, index) : renderInline([token]),
  );
}

function renderBlock(token: Token, key: number): ReactNode {
  if (token.type === "paragraph") return <p key={key}>{renderInline(token.tokens ?? [])}</p>;
  if (token.type === "heading") {
    const children = renderInline(token.tokens ?? []);
    if (token.depth === 1) return <h1 key={key}>{children}</h1>;
    if (token.depth === 2) return <h2 key={key}>{children}</h2>;
    if (token.depth === 3) return <h3 key={key}>{children}</h3>;
    return <h4 key={key}>{children}</h4>;
  }
  if (token.type === "list") {
    const items = token.items as Tokens.ListItem[];
    const List = token.ordered ? "ol" : "ul";
    return (
      <List key={key} start={token.ordered && token.start !== 1 ? token.start : undefined}>
        {items.map((item, index) => (
          <li key={index}>
            {renderBlocks(item.tokens)}
          </li>
        ))}
      </List>
    );
  }
  if (token.type === "table") {
    const table = token as Tokens.Table;
    return (
      <table key={key}>
        <thead>
          <tr>
            {table.header.map((cell, index) => (
              <th key={index} style={{ textAlign: cell.align ?? "left" }}>
                {renderInline(cell.tokens ?? [])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={{ textAlign: cell.align ?? "left" }}>
                  {renderInline(cell.tokens ?? [])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (token.type === "blockquote") {
    return <blockquote key={key}>{renderBlocks(token.tokens)}</blockquote>;
  }
  if (token.type === "code") return <pre key={key}><code>{token.text}</code></pre>;
  if (token.type === "hr") return <hr key={key} />;
  if (token.type === "space") return <Fragment key={key} />;
  if (token.type === "html") return null; // 不渲染原始 HTML，保证安全
  if (token.type === "def") return null;
  return <p key={key}>{"text" in token ? token.text : ""}</p>;
}

function renderInline(tokens: Token[]): ReactNode {
  return tokens.map((token, index) => {
    if (token.type === "text") {
      const nested = (token as Tokens.Text).tokens;
      return nested ? <Fragment key={index}>{renderInline(nested)}</Fragment> : <Fragment key={index}>{renderMath(token.text)}</Fragment>;
    }
    if (token.type === "strong") return <strong key={index}>{renderInline(token.tokens ?? [])}</strong>;
    if (token.type === "em") return <em key={index}>{renderInline(token.tokens ?? [])}</em>;
    if (token.type === "del") return <del key={index}>{renderInline(token.tokens ?? [])}</del>;
    if (token.type === "codespan") return <code key={index}>{token.text}</code>;
    if (token.type === "br") return <br key={index} />;
    if (token.type === "link") return <a key={index} href={safeHref(token.href)} target="_blank" rel="noreferrer">{renderInline(token.tokens ?? [])}</a>;
    if (token.type === "image") return <span key={index}>{token.text}</span>;
    if (token.type === "checkbox") {
      return <input key={index} type="checkbox" disabled readOnly checked={token.checked} />;
    }
    if (token.type === "escape") return <Fragment key={index}>{token.text}</Fragment>;
    if (token.type === "html") return <Fragment key={index}>{token.text}</Fragment>;
    return <Fragment key={index}>{"text" in token ? renderMath(token.text) : ""}</Fragment>;
  });
}

function safeHref(href: string): string {
  try {
    const url = new URL(href, window.location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function renderMath(text: string): ReactNode {
  const chunks = autoWrapLatex(text).split(
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g,
  );
  return chunks.map((chunk, index) => {
    let tex: string | null = null;
    let displayMode = false;
    if (chunk.startsWith("$$") && chunk.endsWith("$$") && chunk.length > 4) {
      tex = chunk.slice(2, -2); displayMode = true;
    } else if (chunk.startsWith("\\[") && chunk.endsWith("\\]")) {
      tex = chunk.slice(2, -2); displayMode = true;
    } else if (chunk.startsWith("\\(") && chunk.endsWith("\\)")) {
      tex = chunk.slice(2, -2);
    } else if (chunk.startsWith("$") && chunk.endsWith("$") && chunk.length > 2) {
      tex = chunk.slice(1, -1);
    }
    if (tex === null) return <Fragment key={index}>{chunk}</Fragment>;
    try {
      const html = katex.renderToString(tex, { displayMode, throwOnError: false, output: "html" });
      return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
    } catch {
      return <Fragment key={index}>{chunk}</Fragment>;
    }
  });
}
