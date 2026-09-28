const api = require('../../utils/api');

Page({
  data: {
    detail: null,
    question: null,
    loadError: false,
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
