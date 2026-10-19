const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

for (const [name, renderer] of [
  ['微信小程序', require('../miniprogram/utils/markdown')],
  ['mobile', require('../mobile/src/utils/markdown')],
]) {
  const { mdHtml } = renderer;
  describe(`${name} Markdown 表格`, () => {
    it('渲染表头、数据和三种列对齐', () => {
      const html = mdHtml('| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| 甲 | 乙 | 丙 |');
      assert.equal((html.match(/<th /g) || []).length, 3);
      assert.equal((html.match(/<td /g) || []).length, 3);
      for (const alignment of ['left', 'center', 'right']) {
        assert.ok(html.includes(`text-align:${alignment};`));
      }
      assert.ok(html.includes('min-width:264px'));
    });

    it('支持省略首尾竖线，表格可紧接普通段落', () => {
      const html = mdHtml('请读表\n项目 | 数值\n--- | ---\n甲 | 1\n\n请作答');
      assert.ok(html.indexOf('请读表') < html.indexOf('<table '));
      assert.ok(html.indexOf('</table>') < html.indexOf('请作答'));
      assert.equal((html.match(/<td /g) || []).length, 2);
    });

    it('单元格支持格式、公式、代码与转义竖线', () => {
      const html = mdHtml('| 格式 | 数值 |\n| --- | --- |\n| **甲**及`a\\|b` | $\\frac{1}{2}$ |\n| 甲\\|乙 | \\_\\_\\_ |');
      assert.ok(html.includes('<strong'));
      assert.ok(html.includes('a|b</code>'));
      assert.ok(html.includes('甲|乙'));
      assert.ok(html.includes('___'));
      assert.ok(!html.includes('\\frac'));
      assert.equal((html.match(/<td /g) || []).length, 4);
    });

    it('缺列补空，额外列忽略，支持空表及 CRLF 换行', () => {
      const html = mdHtml('| 甲 | 乙 |\r\n| --- | --- |\r\n| 1 |\r\n| 2 | 3 | 4 |');
      assert.equal((html.match(/<td /g) || []).length, 4);
      assert.ok(!html.includes('>4</td>'));
      assert.ok(mdHtml('| 甲 |\n| --- |').includes('<tbody></tbody>'));
    });

    it('无效分隔行及代码块中的表格保持原样', () => {
      for (const text of [
        '| 甲 | 乙 |\n| --- |\n| 1 | 2 |',
        '| 甲 | 乙 |\n| abc | --- |\n| 1 | 2 |',
        '```\n| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n```',
      ]) {
        assert.ok(!mdHtml(text).includes('<table '));
      }
    });

    it('转义单元格 HTML，表格后续普通文本正常显示', () => {
      const html = mdHtml('| 项目 |\n| --- |\n| <img src=x> |\n下一段\n第二行');
      assert.ok(html.includes('&lt;img src=x&gt;'));
      assert.ok(html.includes('下一段<br/>第二行'));
    });

    it('保留原有公式、填空线、换行与编号', () => {
      const html = mdHtml('3. 求值：$x_1$\n4. 填空：\\_\\_\\_\n\n第一行\n第二行');
      assert.ok(html.includes('>3.</span>'));
      assert.ok(html.includes('>4.</span>'));
      assert.ok(html.includes('填空：___'));
      assert.ok(html.includes('第一行<br/>第二行'));
      assert.ok(!html.includes('$x_1$'));
    });
  });
}

it('小程序正确答案预处理不会将含下标的英文表格整体包成公式', () => {
  const { mdHtml, ensureMath } = require('../miniprogram/utils/markdown');
  const text = '| variable | value |\n| --- | --- |\n| x_1 | 2 |';
  assert.equal(ensureMath(text), text);
  assert.ok(mdHtml(ensureMath(text)).includes('<table '));
  assert.equal(ensureMath('x_1'), '$x_1$');
});
