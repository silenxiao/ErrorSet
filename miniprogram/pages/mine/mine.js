const api = require('../../utils/api');
const { GRADE_OPTIONS } = require('../../utils/format');

Page({
  data: {
    username: '',
    gradeOptions: GRADE_OPTIONS,
    grade: '',
    gradeIndex: 0,
    savingGrade: false,
  },

  onShow() {
    const username = wx.getStorageSync('errorset_username') || '未登录';
    this.setData({ username, avatarChar: username[0] || '?' });
    this.loadGrade();
  },

  loadGrade() {
    // 以服务端为准；失败时回落到本地缓存
    api
      .getMe()
      .then((user) => {
        const grade = user.grade || '一年级';
        wx.setStorageSync('errorset_grade', grade);
        this.setData({ grade, gradeIndex: Math.max(0, GRADE_OPTIONS.indexOf(grade)) });
      })
      .catch(() => {
        const cached = wx.getStorageSync('errorset_grade');
        if (cached) {
          this.setData({ grade: cached, gradeIndex: Math.max(0, GRADE_OPTIONS.indexOf(cached)) });
        }
      });
  },

  onGradeChange(e) {
    const grade = GRADE_OPTIONS[Number(e.detail.value)];
    this.setData({ grade, gradeIndex: Number(e.detail.value), savingGrade: true });
    api
      .updateGrade(grade)
      .then(() => {
        wx.setStorageSync('errorset_grade', grade);
        wx.showToast({ title: '年级已更新', icon: 'success' });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        this.loadGrade();
      })
      .then(() => this.setData({ savingGrade: false }));
  },

  openModels() {
    wx.navigateTo({ url: '/pages/models/models' });
  },

  openFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      confirmText: '退出',
      confirmColor: '#F53F3F',
      success: (res) => {
        if (res.confirm) api.logout();
      },
    });
  },
});
