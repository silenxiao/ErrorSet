const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/utils', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports;
}
const { examImageName, cropPixels } = load('examImage.ts');
const { fitImageSize } = load('imageSize.ts');
const { applyDrag } = require('../src/utils/bbox');

test('真实文件名保留；相机和无原名的相册图片使用日期时间', () => {
  const now = new Date(2026, 9, 9, 8, 4, 5);
  assert.equal(examImageName('数学试卷.png', false, now), '数学试卷.png');
  assert.equal(examImageName('随机名称.jpg', true, now), '2026-10-09 08:04:05');
  assert.equal(examImageName(null, false, now), '2026-10-09 08:04:05');
});

test('小图不放大，大图按可用宽度或高度等比缩小', () => {
  assert.equal(JSON.stringify(fitImageSize(100, 200, 300, 400)), '{"width":100,"height":200}');
  assert.equal(JSON.stringify(fitImageSize(600, 200, 300, 400)), '{"width":300,"height":100}');
  assert.equal(JSON.stringify(fitImageSize(100, 800, 300, 400)), '{"width":50,"height":400}');
});

test('移动和八向调整限制在原图内，裁剪按旋转后的原始像素导出', () => {
  for (const mode of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const box = applyDrag([200, 200, 800, 800], 100, 100, mode);
    assert.deepEqual(box, [mode.includes('w') ? 300 : 200, mode.includes('n') ? 300 : 200,
      mode.includes('e') ? 900 : 800, mode.includes('s') ? 900 : 800]);
  }
  assert.deepEqual(applyDrag([200, 200, 800, 800], 1000, -1000, 'move'), [400, 0, 1000, 600]);
  assert.equal(JSON.stringify(cropPixels([100, 200, 600, 800], 2000, 1000)), '{"originX":200,"originY":200,"width":1000,"height":600}');
});
