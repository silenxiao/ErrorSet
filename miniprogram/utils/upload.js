// 文件上传封装：使用 wx.uploadFile 提交 multipart/form-data 到后端。
// 后端期望字段：file（文件）、name、include_illustrations、grade。

const { ApiError, getToken } = require('./request');

function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.backendBase) || 'http://127.0.0.1:8000';
}

function imageExtension(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) return 'png';
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
      bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'webp';
  return '';
}

function prepareImage(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({ filePath, success: result => {
      const ext = imageExtension(result.data);
      if (!ext) { reject(new ApiError(0, '不支持的图片内容，请选择 JPG、PNG 或 WebP 图片')); return; }
      const suffix = (filePath.match(/\.([a-z]+)$/i) || [])[1];
      if (suffix && (suffix.toLowerCase() === ext || ext === 'jpg' && suffix.toLowerCase() === 'jpeg')) {
        resolve({ path: filePath, cleanup() {} });
        return;
      }
      const path = `${wx.env.USER_DATA_PATH}/exam-upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      fs.copyFile({ srcPath: filePath, destPath: path,
        success: () => resolve({ path, cleanup: () => fs.unlink({ filePath: path, fail() {} }) }),
        fail: () => reject(new ApiError(0, '无法准备上传图片，请重试')),
      });
    }, fail: () => reject(new ApiError(0, '无法读取上传图片，请重新选择')) });
  });
}

async function uploadExam(filePath, opts = {}) {
  const image = await prepareImage(filePath);
  try {
    return await uploadPreparedImage(image.path, opts);
  } finally {
    image.cleanup();
  }
}

function uploadPreparedImage(filePath, opts) {
  return new Promise((resolve, reject) => {
    const header = {};
    const token = getToken();
    if (token) header.Authorization = `Bearer ${token}`;
    wx.uploadFile({
      url: getBase() + '/api/v1/exams',
      filePath,
      name: 'file',
      header,
      formData: {
        name: opts.name || '',
        include_illustrations: opts.includeIllustrations ? 'true' : 'false',
        grade: opts.grade || '一年级',
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            resolve({});
          }
        } else {
          let detail = `HTTP ${res.statusCode}`;
          try {
            const b = JSON.parse(res.data);
            if (b && b.detail) detail = String(b.detail);
          } catch (e) {
            // ignore
          }
          reject(new ApiError(res.statusCode, detail));
        }
      },
      fail(err) {
        reject(new ApiError(0, (err && err.errMsg) || '上传失败'));
      },
    });
  });
}

module.exports = { uploadExam };
