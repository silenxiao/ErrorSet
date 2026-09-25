const api = require('../../utils/api');
const { EXAM_STATUS, formatDate } = require('../../utils/format');

const POLLING = ['uploaded', 'global_processing', 'local_processing'];
const POLL_INTERVAL = 1500;

Page({
  data: {
    id: null,
    exam: null,
    error: null,
    selectedId: null,
    saving: false,
    rerecogVisible: false,
    rerecogInclude: true,
    rerecogExtra: '',
    editQuestion: null,
    editText: '',
    editIlls: [],
  },

  onLoad(options) {
    const id = Number(options.id);
    this.setData({ id });
    this.refresh();
  },

  onUnload() {
    this.stopPolling();
  },

  refresh() {
    if (this.data.id == null) return;
    api
      .getExam(this.data.id)
      .then((ex) => {
        const s = EXAM_STATUS[ex.status] || { text: ex.status, color: '#999' };
        this.setData({
          exam: ex,
          error: null,
          statusColor: s.color,
          statusText: s.text,
          dateText: formatDate(ex.createdAt),
          questionCount: (ex.questions || []).length,
        });
        if (POLLING.includes(ex.status)) this.startPolling();
        else this.stopPolling();
      })
      .catch((err) => {
        this.setData({ error: err.message || '加载失败' });
        this.stopPolling();
      });
  },

  startPolling() {
    if (this.data.polling) return;
    this.setData({ polling: true });
    this.timer = setInterval(() => this.refresh(), POLL_INTERVAL);
  },

  stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setData({ polling: false });
  },

  _updateQuestion(id, patch) {
    const exam = Object.assign({}, this.data.exam);
    exam.questions = exam.questions.map((q) => (q.id === id ? Object.assign({}, q, patch) : q));
    this.setData({ exam });
  },

  onSelect(e) {
    const id = e.detail.id;
    this.setData({ selectedId: id });
    // 二次识别完成后，在题目列表单击题目打开编辑弹窗（图片框选点选不触发）
    if (e.detail.source === 'list') {
      const qs = (this.data.exam && this.data.exam.questions) || [];
      const q = qs.find((item) => item.id === id);
      if (q && q.status === 'completed') this.openEdit(q);
    }
  },

  openEdit(q) {
    this.setData({
      editQuestion: q,
      editText: q.text || '',
      editIlls: (q.illustrations || []).map((ill) => ({
        id: ill.id,
        url: api.illustrationImageUrl(ill.id),
      })),
    });
  },

  closeEdit() {
    this.setData({ editQuestion: null });
  },

  onEditInput(e) {
    this.setData({ editText: e.detail.value });
  },

  saveEdit() {
    if (this.data.saving || !this.data.editQuestion) return;
    const id = this.data.editQuestion.id;
    const text = (this.data.editText || '').trim();
    if (!text) {
      wx.showToast({ title: '题目文本不能为空', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    api
      .updateQuestion(id, { text })
      .then((q) => {
        this._updateQuestion(id, { text: q.text });
        this.setData({ editQuestion: null });
        wx.showToast({ title: '题目已更新', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },

  onUpdateBbox(e) {
    const { id, bbox } = e.detail;
    this.setData({ saving: true });
    api
      .updateBbox(id, bbox)
      .then((q) => {
        this._updateQuestion(id, { bbox: q.bbox, bboxSource: q.bboxSource });
        wx.showToast({ title: '已保存', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },

  onReset(e) {
    const id = e.detail.id;
    api
      .resetBbox(id)
      .then((q) => {
        this._updateQuestion(id, { bbox: q.bbox, bboxSource: q.bboxSource });
        wx.showToast({ title: '插图位置已重置', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
  },

  onAddWrong(e) {
    const q = e.detail.question;
    if (!q) return;
    wx.navigateTo({
      url: `/pages/add-wrong/add-wrong?questionId=${q.id}&subject=${encodeURIComponent(q.subject || '')}`,
    });
  },

  confirm() {
    this.setData({ saving: true });
    api
      .confirmExam(this.data.id)
      .then(() => {
        wx.showToast({ title: '已确认，开始二次识别', icon: 'success' });
        this.refresh();
      })
      .catch((err) => wx.showToast({ title: err.message || '确认失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },

  openRerecog() {
    const ex = this.data.exam;
    this.setData({
      rerecogVisible: true,
      rerecogInclude: ex.includeIllustrations,
      rerecogExtra: ex.extraPrompt || '',
    });
  },

  closeRerecog() {
    this.setData({ rerecogVisible: false });
  },

  onRerecogInclude(e) {
    this.setData({ rerecogInclude: e.detail.value });
  },

  onRerecogExtra(e) {
    this.setData({ rerecogExtra: e.detail.value });
  },

  doRerecog() {
    const id = this.data.id;
    this.setData({ rerecogVisible: false, saving: true });
    api
      .reRecognizeExam(id, {
        includeIllustrations: this.data.rerecogInclude,
        extraPrompt: this.data.rerecogExtra,
      })
      .then(() => {
        wx.showToast({ title: '已重新开始识别', icon: 'success' });
        this.refresh();
      })
      .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },

  formatDate,

  noop() {},
});
