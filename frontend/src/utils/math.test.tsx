import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderMathText } from "./math";

const render = (text: string) => renderToStaticMarkup(<>{renderMathText(text)}</>);

describe("题目公式显示", () => {
  it.each([
    String.raw`$\frac{1}{3}$`,
    String.raw`$$\frac{1}{3}$$`,
    String.raw`\(\frac{1}{3}\)`,
    String.raw`\[\frac{1}{3}\]`,
    String.raw`\frac{1}{3}`,
  ])("渲染公式 %s", (text) => {
    expect(render(text)).toContain('class="katex"');
    expect(render(text)).not.toContain("katex-error");
  });

  it("将题干的转义下划线显示为填空线，保留公式下标", () => {
    const html = render(String.raw`一个数的\(\frac{2}{7}\)是6，这个数是\_\_\_。$x_1$`);
    expect(html).toContain("这个数是___。");
    expect(html).not.toContain(String.raw`\_`);
    expect(html).toContain("x_1");
    expect(html).not.toContain("katex-error");
  });

  it("多行公式保留块级渲染", () => {
    expect(render("\\[a +\nb\\]")).toContain("katex-display");
  });

  it("题干中的 HTML 仍作为文本显示", () => {
    expect(render('<img src=x onerror="alert(1)">')).toContain("&lt;img");
  });
});
