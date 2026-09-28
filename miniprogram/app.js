const { BACKEND_BASE } = require('./config');
const { isPad } = require('./utils/device');

App({
  globalData: {
    // 后端服务基础地址，来自 config.js
    backendBase: BACKEND_BASE,
    // 是否运行在 Pad（iPad/安卓平板）等大屏设备上；样式适配由 wxss 的 @media 完成，
    // 页面逻辑需要区分设备时读取此字段
    isPad: false,
  },
  onLaunch() {
    this.globalData.isPad = isPad();
    // 未登录则直接进入登录页（登录后回到首页）
    if (!wx.getStorageSync('errorset_token')) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },
});
