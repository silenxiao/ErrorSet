const { BACKEND_BASE } = require('./config');

App({
  globalData: {
    // 后端服务基础地址，来自 config.js
    backendBase: BACKEND_BASE,
  },
  onLaunch() {
    // 小程序启动逻辑（如需登录态可在此初始化）
  },
});
