const api = require('../../utils/api');
const { EXAM_STATUS, GRADE_OPTIONS, formatDate } = require('../../utils/format');

// 未到终态的状态：存在时列表需要轮询同步
const ACTIVE_STATUSES = ['uploaded', 'global_processing', 'local_processing'];
const POLL_INTERVAL = 3000;

Page({
  data: {
    exams: [],
    loading: false,
    error: '',
    backendBase: '',
    gradeOptions: GRADE_OPTIONS,
    gradeIndex: 0,
    previewImage: '',
    name: '',
    includeIllustrations: false,
    uploading: false,
  },

  onShow() {
    this.setData({ backendBase: api.getBase ? api.getBase() : 'http://127.0.0.1:8000' });
    this.loadExams();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  loadExams(silent) {
    this.setData({ loading: !silent, error: '' });
    api
      .listExams()
      .then((list) => {
        const exams = (list || []).map((e) => ({
          ...e,
          statusText: EXAM_STATUS[e.status] ? EXAM_STATUS[e.status].text : e.status,
          statusColor: EXAM_STATUS[e.status] ? EXAM_STATUS[e.status].color : '#999',
          createdAtText: formatDate(e.createdAt),
        }));
        this.setData({ exams, loading: false, error: exams.length ? '' : 'empty' });
        this.syncPolling();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        this.setData({ loading: false, error: err.message || '加载失败' });
      });
  },

  // 有试卷处于识别流程中时轮询同步状态，全部到终态后停止
  syncPolling() {
    const active = (this.data.exams || []).some(
      (e) => ACTIVE_STATUSES.indexOf(e.status) !== -1
    );
    if (active) this.startPolling();
    else this.stopPolling();
  },

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.loadExams(true), POLL_INTERVAL);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  retry() {
    this.loadExams();
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const f = res.tempFiles[0];
        const name = this.data.name || (f.tempFilePath.split('/').pop() || '');
        this.setData({ previewImage: f.tempFilePath, name });
      },
    });
  },

  clearImage() {
    this.setData({ previewImage: '' });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onGrade(e) {
    this.setData({ gradeIndex: e.detail.value });
  },

  onInclude(e) {
    this.setData({ includeIllustrations: e.detail.value });
  },

  upload() {
    if (!this.data.previewImage) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ uploading: true });
    api
      .uploadExam(this.data.previewImage, {
        name: this.data.name,
        includeIllustrations: this.data.includeIllustrations,
        grade: this.data.gradeOptions[this.data.gradeIndex],
      })
      .then((ex) => {
        wx.showToast({ title: '上传成功，开始识别', icon: 'success' });
        this.setData({ previewImage: '', name: '', uploading: false });
        wx.navigateTo({ url: `/pages/recognition/recognition?id=${ex.id}` });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '上传失败', icon: 'none' });
        this.setData({ uploading: false });
      });
  },

  openExam(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/recognition/recognition?id=${id}` });
  },

  delExam(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除试卷',
      content: '确定删除该试卷及其识别结果？',
      success: (r) => {
        if (!r.confirm) return;
        api
          .deleteExam(id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadExams();
          })
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },
});
