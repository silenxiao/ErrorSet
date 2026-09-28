const api = require('../../utils/api');

Page({
  data: {
    username: '',
  },

  onShow() {
    const username = wx.getStorageSync('errorset_username') || '未登录';
    this.setData({ username, avatarChar: username[0] || '?' });
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
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) api.logout();
      },
    });
  },
});
