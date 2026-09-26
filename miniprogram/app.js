const { BACKEND_BASE } = require('./config');

App({
  globalData: {
    // 后端服务基础地址，来自 config.js
    backendBase: BACKEND_BASE,
  },
  onLaunch() {
    // 未登录则直接进入登录页（登录后回到首页）
    if (!wx.getStorageSync('errorset_token')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },
});
