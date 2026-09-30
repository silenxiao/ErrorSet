// 设备判断工具：识别当前是否运行在 Pad（iPad / 安卓平板等大屏设备）上。
// 样式层的大屏适配由 wxss 中的 @media 查询完成；此处的判定供页面逻辑
// 需要区分设备时使用（通过 getApp().globalData.isPad 读取）。

function getDeviceInfo() {
  if (wx.getDeviceInfo) {
    return wx.getDeviceInfo();
  }
  // 低版本基础库兜底
  return wx.getSystemInfoSync();
}

function getWindowInfo() {
  if (wx.getWindowInfo) {
    return wx.getWindowInfo();
  }
  return wx.getSystemInfoSync();
}

function isPad() {
  try {
    const info = getDeviceInfo();
    const model = String(info.model || '').toLowerCase();
    // iPad 机型（开发者工具选择 iPad 模拟时 model 同样带 iPad）
    if (model.indexOf('ipad') !== -1 || model.indexOf('pad') !== -1) {
      return true;
    }
    // iOS 上非 iPhone 的其它设备
    if (info.platform === 'ios' && model.indexOf('iphone') === -1 && model !== '') {
      return true;
    }
    // 安卓平板等：屏幕短边 ≥ 600px 且长宽比不极端（排除手机/折叠屏展开态）
    const win = getWindowInfo();
    const w = win.windowWidth || 0;
    const h = win.windowHeight || 0;
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);
    if (minSide >= 600 && maxSide / minSide < 1.7) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

module.exports = { isPad };

/**
 * 插图按实际尺寸显示的行内样式：默认 1:1 使用自然宽高（px），
 * 超出卡片可用宽度时才等比缩小（大屏下卡片限宽 720px，内部约 640px）。
 * 配合 <image bindload> 的 e.detail.width/height 使用。
 */
function illStyle(width, height) {
  try {
    const win = getWindowInfo();
    const maxW = Math.min((win.windowWidth || 375) - 56, 640);
    const scale = width > maxW ? maxW / width : 1;
    const w = Math.round(width * scale * 100) / 100;
    const h = Math.round(height * scale * 100) / 100;
    return `width:${w}px;height:${h}px;`;
  } catch (e) {
    return '';
  }
}

module.exports = { isPad, illStyle };
