const api = require('../../utils/api');
const { GRADE_OPTIONS } = require('../../utils/format');

Page({
  data: {
    mode: 'login', // login | register
    loading: false,
    gradeOptions: GRADE_OPTIONS,
    gradeIndex: 0,
  },

  switchMode() {
    this.setData({
      mode: this.data.mode === 'login' ? 'register' : 'login',
      confirmPassword: '',
    });
  },

  onGrade(e) {
    this.setData({ gradeIndex: Number(e.detail.value) });
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onConfirmInput(e) {
    this.setData({ confirmPassword: e.detail.value });
  },

  async submit() {
    const { mode, username, password, confirmPassword, gradeOptions, gradeIndex } = this.data;
    if (!username || !username.trim()) {
      wx.showToast({ title: '请输入用户名', icon: 'none' });
      return;
    }
    if (!password || password.length < 6) {
      wx.showToast({ title: '密码至少 6 位', icon: 'none' });
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const data =
        mode === 'login'
          ? await api.login(username.trim(), password)
          : await api.register(username.trim(), password, gradeOptions[gradeIndex]);
      api.saveSession(data);
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.switchTab({ url: '/pages/upload/upload' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '请求失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
