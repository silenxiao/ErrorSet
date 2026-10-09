const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMath, latexToHtml } = require('../src/utils/latex');
const { mdHtml } = require('../src/utils/markdown');

test('分子分母各自包裹为一行，上标保留在分子内部', () => {
  const html = latexToHtml(String.raw`\frac{1^2+2^2}{1\times2}`);
  assert.match(html, /white-space:nowrap;/);
  assert.match(html, /padding:1px 3px;white-space:nowrap;">.*<sup .*>.*<\/sup>.*\+.*<sup .*>.*<\/sup>.*<\/span><span style="display:block;text-align:center;border-top:/);
  assert.match(html, /×/);
  assert.equal((html.match(/flex-direction:column/g) || []).length, 1);
});

test('嵌套分数保持完整分子并逐级缩小，cdots 显示省略号', () => {
  const html = latexToHtml(String.raw`1\frac{1}{2}-\frac{15\frac{1}{4}\times1\frac{3}{5}+1.6}{16.25\div\frac{5}{8}}+\cdots`);
  assert.match(html, /⋯/);
  assert.ok(!html.includes('cdots'));
  assert.equal((html.match(/font-size:0.85em/g) || []).length, 5);
  assert.equal(parseMath(String.raw`\cdots`)[0].v, '⋯');
});

test('空行分隔的题目保持原有编号，公式不会被解释成列表', () => {
  const html = mdHtml(String.raw`四、计算题
1. $\frac{1^2+2^2}{1\times2}+\cdots$

2. $1\frac{1}{2}-\frac{15\frac{1}{4}\times1\frac{3}{5}+1.6}{16.25\div\frac{5}{8}}$`);
  assert.equal((html.match(/margin-right:6px;">1\./g) || []).length, 1);
  assert.equal((html.match(/margin-right:6px;">2\./g) || []).length, 1);
  assert.match(html, /⋯/);
});
