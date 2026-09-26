// 极简 wx.request 封装：非 2xx 抛 ApiError（detail 优先）。
// 自动注入登录 token；401 时清除登录态并跳转登录页。

const TOKEN_KEY = 'errorset_token';

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

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

// 登录/注册接口的 401/422 是正常业务反馈，不触发强制跳转
function isAuthPath(path) {
  return path.startsWith('/api/v1/auth/login') || path.startsWith('/api/v1/auth/register');
}

function redirectToLogin() {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync('errorset_username');
  wx.reLaunch({ url: '/pages/login/login' });
}

function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const url = path.startsWith('http') ? path : getBase() + path;
  const header = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) header.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data: options.data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode === 204 ? undefined : res.data);
        } else {
          if (res.statusCode === 401 && !isAuthPath(path)) {
            redirectToLogin();
          }
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

module.exports = { request, ApiError, TOKEN_KEY, getToken, redirectToLogin };
