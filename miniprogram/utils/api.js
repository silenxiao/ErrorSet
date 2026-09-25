// 全部后端接口封装。返回字段已转换为 camelCase（与后端 CamelModel 一致）。
// 图片类字段（exam.imageUrl / wrong.image / illustration 图片）为 /files/... 路径，
// 通过 absUrl 拼接后端 base 得到可访问的完整 URL。

const { request } = require('./request');
const { uploadExam } = require('./upload');

function getBase() {
  const app = getApp();
  return (app && app.globalData && app.globalData.backendBase) || 'http://127.0.0.1:8000';
}

function absUrl(p) {
  if (!p) return p;
  if (p.startsWith('http')) return p;
  return getBase() + p;
}

const api = {
  uploadExam,

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

  illustrationImageUrl: (id) => absUrl(`/api/v1/illustrations/${id}/image`),
};

module.exports = api;
