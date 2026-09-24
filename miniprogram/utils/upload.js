// 文件上传封装：使用 wx.uploadFile 提交 multipart/form-data 到后端。
// 后端期望字段：file（文件）、name、include_illustrations、grade。

const { ApiError } = require('./request');

function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.backendBase) || 'http://127.0.0.1:8000';
}

function uploadExam(filePath, opts = {}) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: getBase() + '/api/v1/exams',
      filePath,
      name: 'file',
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
