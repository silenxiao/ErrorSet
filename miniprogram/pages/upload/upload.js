const api = require('../../utils/api');
const { fitImage } = require('../../utils/imageSize');
const { EXAM_STATUS, GRADE_OPTIONS, formatDate } = require('../../utils/format');

// 未到终态的状态：存在时列表需要轮询同步
const ACTIVE_STATUSES = ['uploaded', 'global_processing', 'local_queued', 'local_processing'];
const POLL_INTERVAL = 3000;

Page({
  data: {
    exams: [],
    loading: false,
    error: '',
    backendBase: '',
    gradeOptions: GRADE_OPTIONS,
    // 默认年级：上次手动选择 > 注册时选择的年级 > 六年级（三端统一规范默认）
    gradeIndex: Math.max(
      0,
      GRADE_OPTIONS.indexOf(
        wx.getStorageSync('lastExamGrade') || wx.getStorageSync('errorset_grade') || '六年级'
      )
    ),
    previewImage: '',
    previewStyle: '',
    editorSrc: '',
    name: '',
    includeIllustrations: false,
    uploading: false,
    editing: false,
    models: [],
    modelName: '',
  },

  onShow() {
    this.setData({ backendBase: api.getBase ? api.getBase() : 'http://127.0.0.1:8000' });
    // 未登录时不发请求，等 app.onLaunch 跳转登录页
    if (!api.isLoggedIn()) return;
    this.loadExams();
    this.loadModels();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  // 下拉刷新：重新拉取试卷列表后收起刷新动画
  onPullDownRefresh() {
    if (api.isLoggedIn()) this.loadExams(true);
    setTimeout(() => wx.stopPullDownRefresh(), 600);
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
        // 模型列表加载失败不阻塞上传主流程
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

  chooseImage() {
    if (this.data.uploading || this.data.editing) return;
    this.setData({ editing: true });
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照', '从聊天选择图片'],
      success: res => this.chooseImageSource(['album', 'camera', 'message'][res.tapIndex]),
      fail: () => this.setData({ editing: false }),
    });
  },

  imageName(file, source, date = new Date()) {
    // 临时路径的 basename 是微信生成的随机标识，不能作为真实图片名。
    if (source !== 'camera' && file.name && file.name.trim()) return file.name.trim();
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  },

  chooseImageSource(source) {
    if (!source) { this.setData({ editing: false }); return; }
    const options = {
      count: 1,
      success: (res) => {
        const f = res.tempFiles[0];
        if (!f) { this.setData({ editing: false }); return; }
        const name = this._nameEdited && this.data.name.trim() ? this.data.name : this.imageName(f, source);
        this.editSelectedImage(f.tempFilePath || f.path, name);
      },
      fail: (err) => {
        this.setData({ editing: false });
        if (!/cancel/i.test(err.errMsg || '')) wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
    };
    if (source === 'message') {
      wx.chooseMessageFile({ ...options, type: 'image' });
    } else {
      wx.chooseMedia({ ...options, mediaType: ['image'], sourceType: [source], sizeType: ['original'] });
    }
  },

  editSelectedImage(src, name) {
    this._editName = name;
    this.setData({ editing: true, editorSrc: src });
  },

  cancelImageEdit() {
    this.setData({ editing: false, editorSrc: '' });
  },

  confirmImageEdit(e) {
    const filePath = e.detail.tempFilePath;
    if (!filePath) return;
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: info => {
        if (info.size > 10 * 1024 * 1024) {
          this.cancelImageEdit();
          wx.showToast({ title: '编辑后图片超过10MB', icon: 'none' });
          return;
        }
        this._originalImage = this.data.editorSrc;
        this.setData({ previewImage: filePath, name: this._editName, previewStyle: '', editing: false, editorSrc: '' });
      },
      fail: () => { this.cancelImageEdit(); wx.showToast({ title: '无法读取编辑结果', icon: 'none' }); },
    });
  },

  onPreviewLoad(e) {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    wx.createSelectorQuery().select('.preview').boundingClientRect(rect => {
      if (!rect) return;
      const size = fitImage(e.detail.width, e.detail.height, rect.width, win.windowHeight - 120);
      this.setData({ previewStyle: `width:${size.width}px;height:${size.height}px;` });
    }).exec();
  },

  reeditImage() {
    if (this.data.previewImage && !this.data.uploading && !this.data.editing) {
      this.editSelectedImage(this._originalImage || this.data.previewImage, this.data.name);
    }
  },

  clearImage() {
    if (this.data.uploading || this.data.editing) return;
    this.setData({ previewImage: '' });
  },

  onName(e) {
    this._nameEdited = !!e.detail.value.trim();
    this.setData({ name: e.detail.value });
  },

  onGrade(e) {
    const gradeIndex = Number(e.detail.value);
    this.setData({ gradeIndex });
    wx.setStorageSync('lastExamGrade', GRADE_OPTIONS[gradeIndex]);
  },

  onInclude(e) {
    this.setData({ includeIllustrations: e.detail.value });
  },

  upload() {
    if (this.data.editing || this.data.uploading) return;
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
        this._nameEdited = false;
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
