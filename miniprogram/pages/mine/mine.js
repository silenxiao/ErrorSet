const api = require('../../utils/api');
const { GRADE_OPTIONS } = require('../../utils/format');

Page({
  data: {
    username: '',
    gradeOptions: GRADE_OPTIONS,
    grade: '',
    gradeIndex: 0,
    savingGrade: false,
    // 修改密码弹窗
    pwdOpen: false,
    pwdSaving: false,
    pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
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

  // ===== 修改密码 =====
  /** 弹窗内层的 catchtap 占位：仅用于阻止点击冒泡到遮罩，不做任何事 */
  noop() {},

  openPwdDialog() {
    this.setData({
      pwdOpen: true,
      pwdSaving: false,
      pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
    });
  },

  closePwdDialog() {
    if (this.data.pwdSaving) return;
    this.setData({ pwdOpen: false });
  },

  onPwdInput(e) {
    this.setData({ [`pwdForm.${e.currentTarget.dataset.field}`]: e.detail.value });
  },

  submitPwd() {
    if (this.data.pwdSaving) return;
    const { oldPassword, newPassword, confirmPassword } = this.data.pwdForm;
    if (!oldPassword) {
      wx.showToast({ title: '请输入原密码', icon: 'none' });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      wx.showToast({ title: '新密码至少 6 位', icon: 'none' });
      return;
    }
    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
      return;
    }
    this.setData({ pwdSaving: true });
    api
      .updatePassword(oldPassword, newPassword, confirmPassword)
      .then(() => {
        this.setData({ pwdSaving: false, pwdOpen: false });
        wx.showModal({
          title: '密码已修改',
          content: '请使用新密码重新登录',
          showCancel: false,
          confirmText: '去登录',
          success: () => api.logout(),
        });
      })
      .catch((err) => {
        this.setData({ pwdSaving: false });
        wx.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
      });
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
