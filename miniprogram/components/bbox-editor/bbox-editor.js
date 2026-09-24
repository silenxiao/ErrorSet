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
    imageUrl: { type: String, value: '' },
    questions: { type: Array, value: [] },
    selectedId: { type: Number, value: null },
  },

  data: {
    boxes: [],
    handles: HANDLES,
    imgLoaded: false,
  },

  observers: {
    'imageUrl,questions,selectedId': function (imageUrl) {
      if (imageUrl !== this._lastImg) {
        this._lastImg = imageUrl;
        this.setData({ imgLoaded: false });
      }
      this.build();
    },
  },

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

      const boxes = questions.map((q) => {
        const b = normalizeBBox(q.bbox) || [0, 0, 0, 0];
        const ills = (q.illustrations || []).map((il) => ({
          id: il.id,
          type: il.type,
          style: bboxToStyle(normalizeBBox(il.bbox) || [0, 0, 0, 0]),
          selected: q.id === sel,
        }));
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

    onImgLoad() {
      this.setData({ imgLoaded: true });
    },

    onImgError() {
      this.setData({ imgLoaded: true });
    },

    onTapBox(e) {
      if (this._justDragged) {
        this._justDragged = false;
        return;
      }
      this.triggerEvent('select', { id: Number(e.currentTarget.dataset.id) });
    },

    onTapIll(e) {
      this.triggerEvent('select', { id: Number(e.currentTarget.dataset.pid) });
    },

    onHandleStart(e) {
      const mode = e.currentTarget.dataset.mode;
      let qid = e.currentTarget.dataset.id;
      if (qid == null) qid = this.properties.selectedId;
      const box = this.data.boxes.find((b) => b.id === qid);
      if (!box) return;
      const t = e.touches[0];
      wx.createSelectorQuery()
        .in(this)
        .select('#editor')
        .boundingClientRect((rect) => {
          if (!rect) return;
          const sx = ((t.clientX - rect.left) / rect.width) * 1000;
          const sy = ((t.clientY - rect.top) / rect.height) * 1000;
          this.drag = { qid: Number(qid), mode, rect, startBBox: box.bbox.slice(), sx, sy };
        })
        .exec();
    },

    onTouchMove(e) {
      if (!this.drag || !this.drag.rect) return;
      const t = e.touches[0];
      const { rect, startBBox, sx, sy, mode, qid } = this.drag;
      const cx = ((t.clientX - rect.left) / rect.width) * 1000;
      const cy = ((t.clientY - rect.top) / rect.height) * 1000;
      const next = applyDrag(startBBox, cx - sx, cy - sy, mode);
      const boxes = this.data.boxes.map((b) =>
        b.id === qid
          ? Object.assign({}, b, { bbox: next, style: bboxToStyle(next), preview: true })
          : b
      );
      this.setData({ boxes });
    },

    onTouchEnd() {
      if (!this.drag) return;
      const { qid, startBBox } = this.drag;
      const box = this.data.boxes.find((b) => b.id === qid);
      const finalB = box ? box.bbox : startBBox;
      const changed = !finalB.every((v, i) => v === startBBox[i]);
      this.drag = null;
      this._justDragged = changed;
      this.setData({
        boxes: this.data.boxes.map((b) =>
          b.id === qid ? Object.assign({}, b, { preview: false }) : b
        ),
      });
      if (changed) {
        this.triggerEvent('updatebbox', { id: qid, bbox: finalB });
      }
    },
  },
});
