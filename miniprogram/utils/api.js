// 全部后端接口封装。返回字段已转换为 camelCase（与后端 CamelModel 一致）。
// 图片类字段（exam.imageUrl / wrong.image / illustration 图片）为 /files/... 路径，
// 通过 absUrl 拼接后端 base 得到可访问的完整 URL。

const { request } = require('./request');
const { uploadExam } = require('./upload');

function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.backendBase) || 'http://127.0.0.1:8000';
}

function login(username, password) {
  return request('/api/v1/auth/login', { method: 'POST', data: { username, password } });
}

function register(username, password, grade) {
  return request('/api/v1/auth/register', { method: 'POST', data: { username, password, grade } });
}

// 登录/注册成功后统一保存登录态
function saveSession(data) {
  if (data && data.token) {
    wx.setStorageSync('errorset_token', data.token);
    wx.setStorageSync('errorset_username', data.user ? data.user.username : '');
    wx.setStorageSync('errorset_grade', data.user ? data.user.grade || '一年级' : '一年级');
  }
}

function logout() {
  wx.removeStorageSync('errorset_token');
  wx.removeStorageSync('errorset_username');
  wx.removeStorageSync('errorset_grade');
  wx.reLaunch({ url: '/pages/login/login' });
}

function absUrl(p) {
  if (!p) return p;
  if (p.startsWith('http')) return p;
  return getBase() + p;
}

const api = {
  uploadExam,

  // 账号登录
  login: login,
  register: register,

  // 当前用户信息与年级修改（「我的」页）
  getMe: () => request('/api/v1/auth/me'),
  updateGrade: (grade) =>
    request('/api/v1/auth/me', { method: 'PUT', data: { grade } }),
  saveSession: saveSession,
  logout: logout,

  // 暴露当前后端 base，便于页面展示连接信息 / 排查
  getBase: getBase,

  listExams: () => request('/api/v1/exams'),

  getExam: (id) =>
    request(`/api/v1/exams/${id}`).then((ex) => {
      if (ex && ex.imageUrl) ex.imageUrl = absUrl(ex.imageUrl);
      if (ex && ex.questions) ex.questions.forEach((q) => {
        if (q.aiBbox == null) q.aiBbox = q.bbox;
      });
      return ex;
    }),

  confirmExam: (id) => request(`/api/v1/exams/${id}/confirm`, { method: 'POST' }),

  reRecognizeExam: (id, opts) =>
    request(`/api/v1/exams/${id}/re-recognize`, { method: 'POST', data: opts || {} }),

  deleteExam: (id) => request(`/api/v1/exams/${id}`, { method: 'DELETE' }),

  getQuestion: (id) => request(`/api/v1/questions/${id}`),

  updateQuestion: (qid, fields) =>
    request(`/api/v1/questions/${qid}`, { method: 'PATCH', data: fields }),

  updateBbox: (qid, bbox) =>
    request(`/api/v1/questions/${qid}/bbox`, { method: 'PATCH', data: { bbox } }),

  resetBbox: (qid) =>
    request(`/api/v1/questions/${qid}/bbox/reset`, { method: 'POST' }),

  addWrongQuestion: (payload) =>
    request('/api/v1/wrong-questions', { method: 'POST', data: payload }),

  listWrongQuestions: () =>
    request('/api/v1/wrong-questions').then((list) =>
      (list || []).map((w) => {
        if (w.image) w.image = absUrl(w.image);
        return w;
      })
    ),

  getWrongQuestion: (id) =>
    request(`/api/v1/wrong-questions/${id}`).then((w) => {
      if (w && w.image) w.image = absUrl(w.image);
      return w;
    }),

  updateWrongQuestion: (id, fields) =>
    request(`/api/v1/wrong-questions/${id}`, { method: 'PATCH', data: fields }),

  recordWrongResult: (id, result) =>
    request(`/api/v1/wrong-questions/${id}/result`, { method: 'POST', data: { result } }),

  deleteWrongQuestion: (id) =>
    request(`/api/v1/wrong-questions/${id}`, { method: 'DELETE' }),

  sortWrongQuestion: (id, position) =>
    request(`/api/v1/wrong-questions/${id}/sort`, { method: 'POST', data: { position } }),

  analyzeQuestion: (qid) => request(`/api/v1/questions/${qid}/analyze`),

  // 模型管理（API Key 不回传，仅告知是否已保存 hasApiKey）
  listModels: () => request('/api/v1/settings/models'),

  createModel: (payload) =>
    request('/api/v1/settings/models', { method: 'POST', data: payload }),

  updateModel: (id, payload) =>
    request(`/api/v1/settings/models/${id}`, { method: 'PUT', data: payload }),

  enableModel: (id) =>
    request(`/api/v1/settings/models/${id}/enable`, { method: 'PUT', data: {} }),

  // 连通性测试：返回 { ok, latencyMs, error }（自有模型或已开放的系统模型可测）
  testModel: (id) =>
    request(`/api/v1/settings/models/${id}/test`, { method: 'POST' }),

  deleteModel: (id) =>
    request(`/api/v1/settings/models/${id}`, { method: 'DELETE' }),

  // 留言板
  createFeedback: (content) =>
    request('/api/v1/feedback', { method: 'POST', data: { content } }),

  listMyFeedback: () => request('/api/v1/feedback/mine'),

  // <image> 标签带不上 Authorization 头，用 ?token= 回退
  illustrationImageUrl: (id) => {
    const token = wx.getStorageSync('errorset_token');
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return absUrl(`/api/v1/illustrations/${id}/image${query}`);
  },

  // 入库时裁剪的插图快照（/files 静态地址，无需鉴权），优先于动态裁剪
  wrongIllustrationUrls: (w) => {
    const urls = (w && w.illustrationImages) || [];
    return urls.map(absUrl);
  },
};

module.exports = api;
