const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(bytes, statusCode = 200) {
  let api, uploaded, copied, removed;
  class ApiError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const wx = {
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getFileSystemManager: () => ({
      readFile: options => options.success({ data: Uint8Array.from(bytes).buffer }),
      copyFile: options => { copied = options; options.success(); },
      unlink: options => { removed = options.filePath; },
    }),
    uploadFile: options => { uploaded = options; options.success({ statusCode, data: statusCode === 200 ? '{"id":1}' : '{"detail":"上传失败"}' }); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/upload.js'), 'utf8'), {
    wx, getApp: () => ({ globalData: { backendBase: 'https://example.test' } }),
    require: () => ({ ApiError, getToken: () => 'token' }), module: { set exports(value) { api = value; } },
  });
  return { api, uploaded: () => uploaded, copied: () => copied, removed: () => removed };
}

test('JPEG 内容使用 jpg 后缀上传，试卷名称单独保留，完成后清理副本', async () => {
  const flow = setup([255, 216, 255, 224]);
  await flow.api.uploadExam('wxfile://tmp/canvas.png', { name: '原图.png' });
  assert.match(flow.uploaded().filePath, /\.jpg$/);
  assert.equal(flow.copied().srcPath, 'wxfile://tmp/canvas.png');
  assert.equal(flow.uploaded().formData.name, '原图.png');
  assert.equal(flow.removed(), flow.uploaded().filePath);
});

test('PNG 内容与扩展名相符时直接上传', async () => {
  const flow = setup([137, 80, 78, 71, 13, 10, 26, 10]);
  await flow.api.uploadExam('wxfile://tmp/image.png');
  assert.equal(flow.uploaded().filePath, 'wxfile://tmp/image.png');
  assert.equal(flow.copied(), undefined);
});

test('WebP 内容没有扩展名时使用 webp 后缀，失败后也清理副本', async () => {
  const flow = setup([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], 400);
  await assert.rejects(flow.api.uploadExam('wxfile://tmp/random'), /上传失败/);
  assert.match(flow.uploaded().filePath, /\.webp$/);
  assert.equal(flow.removed(), flow.uploaded().filePath);
});

test('非图片文件即使有图片后缀也不会发起上传', async () => {
  const flow = setup([60, 104, 116, 109, 108, 62]);
  await assert.rejects(flow.api.uploadExam('wxfile://tmp/fake.jpg'), /不支持的图片内容/);
  assert.equal(flow.uploaded(), undefined);
});
