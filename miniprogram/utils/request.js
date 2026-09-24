// 极简 wx.request 封装：非 2xx 抛 ApiError（detail 优先）。

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.backendBase) || 'http://127.0.0.1:8000';
}

function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = path.startsWith('http') ? path : getBase() + path;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: options.data,
      header: { 'Content-Type': 'application/json' },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode === 204 ? undefined : res.data);
        } else {
          let detail = `HTTP ${res.statusCode}`;
          try {
            const body = res.data;
            if (body && Array.isArray(body.detail)) {
              detail = body.detail
                .map((i) => (i && i.msg ? i.msg : JSON.stringify(i)))
                .join('; ');
            } else if (body && body.detail) {
              detail = String(body.detail);
            }
          } catch (e) {
            // 非 JSON 错误体，保留默认信息
          }
          reject(new ApiError(res.statusCode, detail));
        }
      },
      fail(err) {
        reject(new ApiError(0, (err && err.errMsg) || '网络错误'));
      },
    });
  });
}

module.exports = { request, ApiError };
