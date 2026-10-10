const api = require('../../utils/api');
const { EXAM_STATUS, formatDate } = require('../../utils/format');
const { illStyle } = require('../../utils/device');

const POLLING = ['uploaded', 'global_processing', 'local_queued', 'local_processing'];
const POLL_INTERVAL = 1500;

Page({
  onPreviewIllustration(e) { this.setData({ illustrationPreviewUrl: e.currentTarget.dataset.url }); },
  closeIllustrationPreview() { this.setData({ illustrationPreviewUrl: '' }); },
  data: {
    illustrationPreviewUrl: '',
    id: null,
    exam: null,
    error: null,
    selectedId: null,
    saving: false,
    questionCount: 0,
    illCount: 0,
    // 插图预览与调整浮层（页面内只读，浮层内可编辑）
    illPreviewVisible: false,
    rerecogVisible: false,
    rerecogInclude: true,
    rerecogExtra: '',
    models: [],
    modelName: '',
    editQuestion: null,
    editText: '',
    editIlls: [],
    // 编辑弹窗插图实际尺寸（key: e.插图id → 行内样式），按自然大小 1:1 显示
    illSizes: {},
  },

  // 插图加载完成：记录自然尺寸，超宽时等比缩小到弹窗内
  onIllLoad(e) {
    const key = e.currentTarget.dataset.key;
    const { width, height } = e.detail;
    if (!key || !width || !height) return;
    this.setData({
      illSizes: Object.assign({}, this.data.illSizes, { [key]: illStyle(width, height) }),
    });
  },

  onLoad(options) {
    const id = Number(options.id);
    this.setData({ id });
    this.refresh();
    this.loadModels();
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
          illCount: (ex.questions || []).reduce(
            (n, q) => n + (q.illustrations || []).length,
            0
          ),
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

  // 插图预览浮层：页面内插图框只读，浮层内才可拖动/缩放
  openIllPreview() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ illPreviewVisible: true, previewMaxHeight: Math.max(80, win.windowHeight * 0.8 - 160) });
  },

  closeIllPreview() {
    this.setData({ illPreviewVisible: false });
  },

  onSelect(e) {
    const id = e.detail.id;
    this.setData({ selectedId: id });
    // 识别完成后，在题目列表单击题目打开编辑弹窗（图片框选点选不触发）
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
        url: api.illustrationImageUrl(ill),
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

  // 插图框拖拽结束：保存插图自己的 bbox（区别于题目 bbox）
  onUpdateIllBbox(e) {
    const { id, bbox } = e.detail;
    this.setData({ saving: true });
    api
      .updateIllustrationBbox(id, bbox)
      .then((ill) => {
        const exam = Object.assign({}, this.data.exam);
        exam.questions = exam.questions.map((q) =>
          Object.assign({}, q, {
            illustrations: (q.illustrations || []).map((x) => (x.id === id ? ill : x)),
          })
        );
        this.setData({ exam });
        //wx.showToast({ title: '插图位置已保存', icon: 'success' });
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

  loadModels() {
    api
      .listModels()
      .then((list) => {
        const models = list || [];
        const enabled = models.find((m) => m.enabled);
        this.setData({
          models,
          modelName: enabled ? enabled.name || enabled.model : '',
        });
      })
      .catch(() => {
        // 模型列表加载失败不阻塞主流程
      });
  },

  chooseModel() {
    const models = this.data.models;
    if (!models.length) {
      wx.showModal({
        title: '还没有模型配置',
        content: '先去「模型管理」添加一个识别模型？',
        confirmText: '去添加',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/models/models' });
        },
      });
      return;
    }
    wx.showActionSheet({
      itemList: models.map((m) => (m.enabled ? '✓ ' : '') + (m.name || m.model)),
      success: (r) => {
        const picked = models[r.tapIndex];
        if (!picked || picked.enabled) return;
        api
          .enableModel(picked.id)
          .then(() => {
            wx.showToast({ title: '已切换识别模型', icon: 'success' });
            this.loadModels();
          })
          .catch((err) =>
            wx.showToast({ title: err.message || '切换失败', icon: 'none' })
          );
      },
    });
  },

  openRerecog() {
    const ex = this.data.exam;
    this.setData({
      rerecogVisible: true,
      rerecogInclude: ex.includeIllustrations,
      rerecogExtra: (ex.extraPrompt || '').slice(0, 800),
    });
    this.loadModels();
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

  noop() { },
});
