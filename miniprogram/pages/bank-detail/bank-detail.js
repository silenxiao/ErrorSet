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
        w.illustrations = (w.illustrations || []).map((ill) => ({
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
