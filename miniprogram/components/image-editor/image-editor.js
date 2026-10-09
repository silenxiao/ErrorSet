const { applyDrag, bboxToStyle } = require('../../utils/bbox');
const { fitImage } = require('../../utils/imageSize');
const handles = [
  { mode: 'nw', x: 0, y: 0 }, { mode: 'n', x: 50, y: 0 }, { mode: 'ne', x: 100, y: 0 },
  { mode: 'e', x: 100, y: 50 }, { mode: 'se', x: 100, y: 100 }, { mode: 's', x: 50, y: 100 },
  { mode: 'sw', x: 0, y: 100 }, { mode: 'w', x: 0, y: 50 },
];
Component({
  properties: { src: { type: String, value: '' } },
  data: { handles, ready: false, busy: false, angle: 0, boxStyle: '', width: 0, height: 0 },
  observers: {
    src(src) {
      this._generation = (this._generation || 0) + 1;
      this.drag = null;
      this.setData({ ready: false, busy: false });
      if (!src) return;
      const generation = this._generation;
      wx.getImageInfo({ src, success: info => {
        if (generation !== this._generation) return;
        this.original = info;
        this.setData({ angle: 0 });
        this.layout();
      }, fail: () => {
        if (generation !== this._generation) return;
        wx.showToast({ title: '图片加载失败', icon: 'none' });
        this.triggerEvent('cancel');
      } });
    },
  },
  methods: {
    layout() {
      this.drag = null;
      const info = this.original;
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const rotated = this.data.angle % 180 !== 0;
      this.outputWidth = rotated ? info.height : info.width;
      this.outputHeight = rotated ? info.width : info.height;
      const size = fitImage(this.outputWidth, this.outputHeight, win.windowWidth - 64, Math.max(80, win.windowHeight - 280));
      this.box = [0, 0, 1000, 1000];
      this.setData({ ...size, ready: true, boxStyle: bboxToStyle(this.box),
        imageWidth: rotated ? size.height : size.width, imageHeight: rotated ? size.width : size.height });
    },
    start(e) {
      if (!this.data.ready || this.data.busy) return;
      const touch = e.touches[0];
      this.drag = { mode: e.currentTarget.dataset.mode, box: this.box.slice(), x: touch.clientX, y: touch.clientY };
    },
    move(e) {
      if (!this.drag) return;
      const t = e.touches[0], d = this.drag;
      this.box = applyDrag(d.box, (t.clientX - d.x) * 1000 / this.data.width,
        (t.clientY - d.y) * 1000 / this.data.height, d.mode);
      this.setData({ boxStyle: bboxToStyle(this.box) });
    },
    end() { this.drag = null; },
    cancelDrag() {
      if (this.drag) { this.box = this.drag.box; this.setData({ boxStyle: bboxToStyle(this.box) }); }
      this.drag = null;
    },
    rotate() { if (!this.data.ready || this.data.busy) return; this.setData({ angle: (this.data.angle + 90) % 360 }); this.layout(); },
    restore() { if (!this.data.ready || this.data.busy) return; this.setData({ angle: 0 }); this.layout(); },
    cancel() { if (!this.data.busy) this.triggerEvent('cancel'); },
    noop() {},
    confirm() {
      if (!this.data.ready || this.data.busy) return;
      this.drag = null;
      // 未修改时保留原文件，避免不必要的重编码和大图画布分配。
      if (this.data.angle === 0 && this.box.every((v, i) => v === [0, 0, 1000, 1000][i])) {
        this.triggerEvent('confirm', { tempFilePath: this.original.path || this.properties.src });
        return;
      }
      this.setData({ busy: true });
      const generation = this._generation;
      this.createSelectorQuery().select('#export').fields({ node: true }).exec(async result => {
        try {
          const canvas = result && result[0] && result[0].node;
          if (!canvas) throw new Error('未获取到导出画布');
          const [x1, y1, x2, y2] = this.box;
          const left = Math.round(x1 * this.outputWidth / 1000), top = Math.round(y1 * this.outputHeight / 1000);
          canvas.width = Math.max(1, Math.round(x2 * this.outputWidth / 1000) - left);
          canvas.height = Math.max(1, Math.round(y2 * this.outputHeight / 1000) - top);
          const img = canvas.createImage();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = err => reject(new Error(`无法加载原图：${err && err.errMsg || '图片解码失败'}`));
            img.src = this.original.path || this.properties.src;
          });
          if (generation !== this._generation) return;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.translate(this.outputWidth / 2 - left, this.outputHeight / 2 - top);
          ctx.rotate(this.data.angle * Math.PI / 180);
          ctx.drawImage(img, -this.original.width / 2, -this.original.height / 2, this.original.width, this.original.height);
          // 等待画布提交绘制；明确尺寸，避免默认按设备像素比再次放大。
          if (typeof canvas.requestAnimationFrame === 'function') {
            await new Promise(resolve => canvas.requestAnimationFrame(resolve));
          }
          if (generation !== this._generation) return;
          wx.canvasToTempFilePath({ canvas, x: 0, y: 0,
            width: canvas.width, height: canvas.height,
            destWidth: canvas.width, destHeight: canvas.height,
            fileType: 'jpg', quality: 1,
            success: res => { if (generation === this._generation) this.triggerEvent('confirm', { tempFilePath: res.tempFilePath }); },
            fail: err => this.exportFailed(generation, err),
            complete: () => { if (generation === this._generation) this.setData({ busy: false }); },
          }, this);
        } catch (err) { this.exportFailed(generation, err); }
      });
    },
    exportFailed(generation, err) {
      if (generation !== this._generation) return;
      this.setData({ busy: false });
      const reason = err && (err.errMsg || err.message) || '未知画布错误';
      console.error('[image-editor] 图片导出失败', reason);
      wx.showModal({ title: '图片编辑失败', content: `图片导出失败：${reason}`, showCancel: false });
    },
  },
});
