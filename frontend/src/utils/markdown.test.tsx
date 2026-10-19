import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMarkdown, renderQuestionText } from "./markdown";

const table = "| 项目 | 数值 |\n| :--- | ---: |\n| **甲** | $x_1$ |\n| 乙 | 2 |";

describe.each([
  ["答案和分析", renderMarkdown],
  ["题目正文和预览", renderQuestionText],
] as const)("%s的表格", (_name, renderer) => {
  it("渲染表头、数据行、列对齐及单元格中的格式和公式", () => {
    const html = renderToStaticMarkup(<>{renderer(table)}</>);
    expect(html).toContain("<table>");
    expect(html).toContain('<th style="text-align:right">数值</th>');
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain("<strong>甲</strong>");
    expect(html).toContain('class="katex"');
    expect(html).not.toContain("katex-error");
  });
});

describe("题干表格与原文混排", () => {
  it("保留表格前后的换行、填空线和数学公式", () => {
    const html = renderToStaticMarkup(<>{renderQuestionText(
      `求值：$x_1$\n填空：\\_\\_\\_\n\n${table}\n\n第二问\n请作答`,
    )}</>);
    expect(html).toContain("填空：___\n\n");
    expect(html).toContain("第二问\n请作答");
    expect(html.indexOf("填空")).toBeLessThan(html.indexOf("<table>"));
    expect(html.indexOf("</table>")).toBeLessThan(html.indexOf("第二问"));
  });

  it("不把普通题干中的编号、填空线或 HTML 解析为 Markdown", () => {
    const text = '1. 填空___\n2. <img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(<>{renderQuestionText(text)}</>);
    expect(html).toContain("1. 填空___\n2. &lt;img");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("<img");
  });

  it("代码块里的表格示例保留原文", () => {
    const html = renderToStaticMarkup(<>{renderQuestionText(`\`\`\`\n${table}\n\`\`\``)}</>);
    expect(html).not.toContain("<table>");
    expect(html).toContain("| 项目 | 数值 |");
  });
});
