const { fitImage } = require('../../utils/imageSize');
const { normalizeBBox, applyDrag, bboxToStyle } = require('../../utils/bbox');

// 八向手柄：fx/fy 为相对所选框的百分比位置（0~100）
const HANDLES = [
  { mode: 'nw', fx: 0, fy: 0 },
  { mode: 'n', fx: 50, fy: 0 },
  { mode: 'ne', fx: 100, fy: 0 },
  { mode: 'e', fx: 100, fy: 50 },
  { mode: 'se', fx: 100, fy: 100 },
  { mode: 's', fx: 50, fy: 100 },
  { mode: 'sw', fx: 0, fy: 100 },
  { mode: 'w', fx: 0, fy: 50 },
];

Component({
  properties: {
    maxHeight: { type: Number, value: 0 },
    imageUrl: { type: String, value: '' },
    questions: { type: Array, value: [] },
    selectedId: { type: Number, value: null },
    // true 时隐藏题目框，只显示/编辑插图框
    onlyIllustrations: { type: Boolean, value: false },
    // false 时纯展示（点击仅选中，不出现手柄、不可拖动）；编辑在预览弹窗内进行
    editable: { type: Boolean, value: true },
  },

  data: {
    boxes: [],
    handles: HANDLES,
    imgLoaded: false,
    // 当前选中的插图 id（插图框独立于题目框编辑）
    selIllId: null,
  },

  observers: {
    'imageUrl,questions,selectedId,selIllId': function (imageUrl) {
      if (imageUrl !== this._lastImg) {
        this._lastImg = imageUrl;
        this.setData({ imgLoaded: false, paperStyle: '' });
      }
      this.build();
    },
  },

  pageLifetimes: { resize() { this.fitPaper(); } },

  lifetimes: {
    attached() {
      this.build();
    },
  },

  methods: {
    build() {
      // 拖拽进行中不打断本地预览
      if (this.drag) return;
      const questions = this.properties.questions || [];
      const sel = this.properties.selectedId;
      const selIll = this.data.selIllId;

      const boxes = questions.map((q) => {
        const b = normalizeBBox(q.bbox) || [0, 0, 0, 0];
        const illList = q.illustrations || [];
        // 选中题目但未点选具体插图时，自动选中其第一个插图，保证手柄可见可调
        let selIllEff = selIll;
        if (q.id === sel && illList.length && !illList.some((il) => il.id === selIll)) {
          selIllEff = illList[0].id;
        }
        const ills = illList.map((il) => {
          const ib = normalizeBBox(il.bbox) || [0, 0, 0, 0];
          return {
            id: il.id,
            type: il.type,
            bbox: ib,
            style: bboxToStyle(ib),
            selected: q.id === sel,
            illSelected: il.id === selIllEff,
          };
        });
        return {
          id: q.id,
          no: q.questionNo,
          bbox: b,
          style: bboxToStyle(b),
          selected: q.id === sel,
          suspicious: q.confidence != null && q.confidence < 0.7,
          illCount: ills.length,
          ills,
        };
      });
      this.setData({ boxes });
    },

    // 按插图 id 找到所属题目 id 与插图对象
    _findIll(iid) {
      for (const b of this.data.boxes) {
        const ill = (b.ills || []).find((il) => il.id === iid);
        if (ill) return { qid: b.id, ill };
      }
      return null;
    },

    onImgLoad(e) {
      this._imageSize = e.detail;
      this.fitPaper();
      this.setData({ imgLoaded: true });
    },

    fitPaper() {
      if (!this._imageSize) return;
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      this.createSelectorQuery().select('#available').boundingClientRect(rect => {
        if (!rect) return;
        const size = fitImage(this._imageSize.width, this._imageSize.height, rect.width, this.properties.maxHeight || win.windowHeight - 120);
        this.setData({ paperStyle: `width:${size.width}px;height:${size.height}px;` });
      }).exec();
    },

    onImgError() {
      this.setData({ imgLoaded: true });
    },

    onTapBox(e) {
      if (this._justDragged) {
        this._justDragged = false;
        return;
      }
      this.setData({ selIllId: null });
      this.triggerEvent('select', { id: Number(e.currentTarget.dataset.id) });
    },

    onTapIll(e) {
      if (this._justDragged) {
        this._justDragged = false;
        return;
      }
      this.setData({ selIllId: Number(e.currentTarget.dataset.iid) });
      this.triggerEvent('select', { id: Number(e.currentTarget.dataset.pid) });
    },

    onHandleStart(e) {
      if (!this.properties.editable) return;
      // 新手势开始即清除上一次拖拽的 tap 屏蔽标记，防止误吞下一次点选
      this._justDragged = false;
      const mode = e.currentTarget.dataset.mode;
      let qid = e.currentTarget.dataset.id;
      if (qid == null) qid = this.properties.selectedId;
      const box = this.data.boxes.find((b) => b.id === qid);
      if (!box) return;
      const t = e.touches[0];
      // 先同步挂起 drag（rect 异步补齐）：快速点按时查询回调晚于 touchend，
      // 若在回调里才建立 drag，残留的 drag 会永久阻塞 build()，导致点选无响应
      this.drag = { qid: Number(qid), mode, startBBox: box.bbox.slice(), sx: t.clientX, sy: t.clientY, rect: null };
      wx.createSelectorQuery()
        .in(this)
        .select('#editor')
        .boundingClientRect((rect) => {
          if (!rect || !this.drag || this.drag.qid !== Number(qid)) return;
          const sx = ((this.drag.sx - rect.left) / rect.width) * 1000;
          const sy = ((this.drag.sy - rect.top) / rect.height) * 1000;
          Object.assign(this.drag, { rect, sx, sy });
        })
        .exec();
    },

    onIllHandleStart(e) {
      if (!this.properties.editable) return;
      // 新手势开始即清除上一次拖拽的 tap 屏蔽标记，防止误吞下一次点选
      this._justDragged = false;
      const mode = e.currentTarget.dataset.mode;
      const iid = Number(e.currentTarget.dataset.iid);
      const found = this._findIll(iid);
      if (!found) return;
      // 按下插图即显示缩放手柄，不必先完成一次点击。
      this.setData({ selIllId: iid });
      this.build();
      const t = e.touches[0];
      // 同 onHandleStart：drag 必须同步建立，rect 异步补齐
      this.drag = {
        qid: found.qid,
        illId: iid,
        mode,
        startBBox: found.ill.bbox.slice(),
        sx: t.clientX,
        sy: t.clientY,
        rect: null,
      };
      wx.createSelectorQuery()
        .in(this)
        .select('#editor')
        .boundingClientRect((rect) => {
          if (!rect || !this.drag || this.drag.illId !== iid) return;
          const sx = ((this.drag.sx - rect.left) / rect.width) * 1000;
          const sy = ((this.drag.sy - rect.top) / rect.height) * 1000;
          Object.assign(this.drag, { rect, sx, sy });
        })
        .exec();
    },

    onTouchMove(e) {
      if (!this.drag || !this.drag.rect) return;
      const t = e.touches[0];
      const { rect, startBBox, sx, sy, mode, qid, illId } = this.drag;
      const cx = ((t.clientX - rect.left) / rect.width) * 1000;
      const cy = ((t.clientY - rect.top) / rect.height) * 1000;
      const next = applyDrag(startBBox, cx - sx, cy - sy, mode);
      if (illId != null) {
        const boxes = this.data.boxes.map((b) =>
          b.id === qid
            ? Object.assign({}, b, {
                ills: b.ills.map((il) =>
                  il.id === illId
                    ? Object.assign({}, il, { bbox: next, style: bboxToStyle(next), preview: true })
                    : il
                ),
              })
            : b
        );
        this.setData({ boxes });
        return;
      }
      const boxes = this.data.boxes.map((b) =>
        b.id === qid
          ? Object.assign({}, b, { bbox: next, style: bboxToStyle(next), preview: true })
          : b
      );
      this.setData({ boxes });
    },

    noop() {},

    onTouchCancel() {
      // 系统中断手势时恢复已保存的框，避免残留拖拽状态。
      this.drag = null;
      this._justDragged = false;
      this.build();
    },

    onTouchEnd() {
      if (!this.drag) return;
      // rect 未就绪说明是快速点按且查询回调还没回来：直接丢弃，避免 drag 残留阻塞后续重绘
      if (!this.drag.rect) {
        this.drag = null;
        return;
      }
      const { qid, startBBox, illId } = this.drag;
      const changed = this._dragChanged(startBBox);
      this.drag = null;
      this._justDragged = changed;
      if (illId != null) {
        this.setData({
          boxes: this.data.boxes.map((b) =>
            b.id === qid
              ? Object.assign({}, b, {
                  ills: b.ills.map((il) => Object.assign({}, il, { preview: false })),
                })
              : b
          ),
        });
        if (changed) {
          const found = this._findIll(illId);
          if (found) this.triggerEvent('updateillbbox', { id: illId, bbox: found.ill.bbox });
        }
        return;
      }
      const box = this.data.boxes.find((b) => b.id === qid);
      const finalB = box ? box.bbox : startBBox;
      this.setData({
        boxes: this.data.boxes.map((b) =>
          b.id === qid ? Object.assign({}, b, { preview: false }) : b
        ),
      });
      if (changed) {
        this.triggerEvent('updatebbox', { id: qid, bbox: finalB });
      }
    },

    _dragChanged(startBBox) {
      // 拖拽结束后从 boxes 里取当前框与起始框比较
      return !this._currentDragBox().every((v, i) => v === startBBox[i]);
    },

    _currentDragBox() {
      const { qid, illId } = this.drag || {};
      const box = this.data.boxes.find((b) => b.id === qid);
      if (!box) return [0, 0, 0, 0];
      if (illId != null) {
        const ill = (box.ills || []).find((il) => il.id === illId);
        return ill ? ill.bbox : [0, 0, 0, 0];
      }
      return box.bbox;
    },
  },
});
