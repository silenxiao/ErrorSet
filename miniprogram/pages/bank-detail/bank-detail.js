const api = require('../../utils/api');
const { illStyle } = require('../../utils/device');

Page({
  data: {
    detail: null,
    question: null,
    loadError: false,
    // 插图实际尺寸（key: q.插图id → 行内样式），按自然大小 1:1 显示
    illSizes: {},
  },

  // 插图加载完成：记录自然尺寸，超宽时等比缩小到卡片内
  onIllLoad(e) {
    const key = e.currentTarget.dataset.key;
    const { width, height } = e.detail;
    if (!key || !width || !height) return;
    this.setData({
      illSizes: Object.assign({}, this.data.illSizes, { [key]: illStyle(width, height) }),
    });
  },

  onLoad(options) {
    this.id = Number(options.id);
    this.load();
  },

  load() {
    api
      .getWrongQuestion(this.id)
      .then((w) => {
        // 优先用入库时裁剪的快照（静态 /files），旧记录回退到动态裁剪接口
        const snapshots = api.wrongIllustrationUrls(w);
        w.illustrations = snapshots.length
          ? snapshots.map((imgUrl, idx) => ({ id: `s${idx}`, imgUrl }))
          : (w.illustrations || []).map((ill) => ({
              ...ill,
              imgUrl: api.illustrationImageUrl(ill.id),
            }));
        this.setData({ detail: w, loadError: false });
        this.loadQuestion();
      })
      .catch(() => this.setData({ loadError: true }));
  },

  loadQuestion() {
    const qid = this.data.detail.questionId;
    api
      .getQuestion(qid)
      .then((q) => {
        q.illustrations = (q.illustrations || []).map((ill) => ({
          ...ill,
          imgUrl: api.illustrationImageUrl(ill.id),
        }));
        this.setData({ question: q });
      })
      .catch(() => {});
  },

  mark(e) {
    const result = e.currentTarget.dataset.result;
    api
      .recordWrongResult(this.data.detail.id, result)
      .then((up) => {
        const detail = Object.assign({}, this.data.detail, up);
        this.setData({ detail });
        wx.showToast({ title: result === 'correct' ? '做对 +1' : '做错 +1', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '记录失败', icon: 'none' }));
  },

  del() {
    wx.showModal({
      title: '删除错题',
      content: '确定删除该错题？',
      success: (r) => {
        if (!r.confirm) return;
        api
          .deleteWrongQuestion(this.data.detail.id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            wx.navigateBack();
          })
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },
});
