const test = require('node:test');
const assert = require('node:assert/strict');
const { fitImage } = require('../utils/imageSize');
let definition;
global.Component = value => { definition = value; };
require('../components/image-editor/image-editor');
delete global.Component;

function editor() {
  global.wx = { getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800 }) };
  const instance = { ...definition.methods, data: { ...definition.data }, original: { width: 100, height: 200, path: 'raw.jpg' },
    setData(value) { Object.assign(this.data, value); } };
  instance.layout();
  return instance;
}

test('小图保持原始尺寸，宽图和长图仅等比缩小', () => {
  assert.deepEqual(fitImage(100, 200, 300, 400), { width: 100, height: 200 });
  assert.deepEqual(fitImage(600, 200, 300, 400), { width: 300, height: 100 });
  assert.deepEqual(fitImage(100, 800, 300, 400), { width: 50, height: 400 });
});

test('八向手柄改变对应边，移动框体保持尺寸并限制边界', () => {
  for (const mode of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const page = editor();
    page.box = [200, 200, 800, 800];
    page.start({ currentTarget: { dataset: { mode } }, touches: [{ clientX: 0, clientY: 0 }] });
    page.move({ touches: [{ clientX: 10, clientY: 20 }] });
    assert.deepEqual(page.box, [mode.includes('w') ? 300 : 200, mode.includes('n') ? 300 : 200,
      mode.includes('e') ? 900 : 800, mode.includes('s') ? 900 : 800]);
  }
  const page = editor();
  page.box = [200, 200, 800, 800];
  page.start({ currentTarget: { dataset: { mode: 'move' } }, touches: [{ clientX: 0, clientY: 0 }] });
  page.move({ touches: [{ clientX: 200, clientY: -200 }] });
  assert.deepEqual(page.box, [400, 0, 1000, 600]);
  page.cancelDrag();
  assert.deepEqual(page.box, [200, 200, 800, 800]);
});

test('旋转交换原图宽高，恢复原图清除旋转和裁剪', () => {
  const page = editor();
  page.rotate();
  assert.equal(page.data.angle, 90);
  assert.equal(page.outputWidth, 200);
  assert.equal(page.outputHeight, 100);
  page.box = [100, 100, 500, 500];
  page.restore();
  assert.equal(page.data.angle, 0);
  assert.deepEqual(page.box, [0, 0, 1000, 1000]);
  assert.equal(page.outputWidth, 100);
});

test('导出按旋转后的原始像素裁剪，不使用屏幕缩小尺寸', async () => {
  const page = editor();
  page.original = { width: 1000, height: 2000, path: 'raw.jpg' };
  page.rotate();
  page.box = [100, 200, 600, 800];
  const calls = [];
  const ctx = { fillRect() {}, translate: (...args) => calls.push(args), rotate: angle => calls.push(angle), drawImage: (...args) => calls.push(args.slice(1)) };
  const canvas = { getContext: () => ctx, createImage() {
    return { set src(value) { queueMicrotask(() => this.onload()); } };
  } };
  page.createSelectorQuery = () => ({ select() { return this; }, fields() { return this; }, exec(callback) { callback([{ node: canvas }]); } });
  page.triggerEvent = (name, detail) => calls.push([name, detail.tempFilePath]);
  global.wx.canvasToTempFilePath = options => {
    assert.equal(options.width, 1000);
    assert.equal(options.height, 600);
    assert.equal(options.destWidth, 1000);
    assert.equal(options.destHeight, 600);
    options.success({ tempFilePath: 'crop.jpg' }); options.complete();
  };
  page.confirm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canvas.width, 1000);
  assert.equal(canvas.height, 600);
  assert.deepEqual(calls, [[800, 300], Math.PI / 2, [-500, -1000, 1000, 2000], ['confirm', 'crop.jpg']]);
  assert.equal(page.data.busy, false);
});

test('未经裁剪和旋转的图片直接确认原文件，不创建画布', () => {
  const page = editor();
  const events = [];
  page.triggerEvent = (name, value) => events.push([name, value.tempFilePath]);
  page.createSelectorQuery = () => { throw new Error('不应创建画布'); };
  page.confirm();
  assert.deepEqual(events, [['confirm', 'raw.jpg']]);
  assert.equal(page.data.busy, false);
});

test('画布节点缺失时解除等待并显示具体错误', async () => {
  const page = editor();
  page.rotate();
  page.createSelectorQuery = () => ({ select() { return this; }, fields() { return this; }, exec(callback) { callback([null]); } });
  let message;
  global.wx.showModal = options => { message = options.content; };
  page.confirm();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.data.busy, false);
  assert.match(message, /未获取到导出画布/);
});
