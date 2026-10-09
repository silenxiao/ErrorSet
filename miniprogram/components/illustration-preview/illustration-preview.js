Component({
  properties: { src: { type: String, value: '' } },
  data: { areaWidth: 300, areaHeight: 400, width: 120, height: 120, x: 90, y: 140, scale: 1, failed: false },
  observers: {
    src(src) {
      if (!src) return;
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const areaWidth = Math.floor(win.windowWidth * 0.9);
      const areaHeight = Math.max(120, Math.floor(win.windowHeight * 0.8) - 96);
      this.setData({ areaWidth, areaHeight, width: 120, height: 120, x: (areaWidth - 120) / 2, y: (areaHeight - 120) / 2, scale: 1, failed: false });
    },
  },
  methods: {
    onLoad(e) {
      const { width, height } = e.detail;
      if (!width || !height) return;
      const factor = Math.min(1, (this.data.areaWidth - 24) / width, (this.data.areaHeight - 24) / height);
      const w = width * factor, h = height * factor;
      this.setData({ width: w, height: h, x: (this.data.areaWidth - w) / 2, y: (this.data.areaHeight - h) / 2 });
    },
    onError() { this.setData({ failed: true }); },
    close() { this.triggerEvent('close'); },
    noop() {},
  },
});
