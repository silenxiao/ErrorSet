const api = require('../../utils/api');
const { illStyle } = require('../../utils/device');

Page({
  onPreviewIllustration(e) { this.setData({ illustrationPreviewUrl: e.currentTarget.dataset.url }); },
  closeIllustrationPreview() { this.setData({ illustrationPreviewUrl: '' }); },
  data: {
    illustrationPreviewUrl: '',
    detail: null,
    question: null,
    loadError: false,
    // 题目原文/插图：错题快照优先，快照为空的旧记录回退到实时题目
    origText: '',
    origIlls: [],
    // 原题已随试卷删除（getQuestion 404）
    questionMissing: false,
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
        // 插图优先用入库时裁剪的快照（静态 /files），旧记录回退到动态裁剪接口
        const snapshots = api.wrongIllustrationUrls(w);
        w.illustrations = snapshots.length
          ? snapshots.map((imgUrl, idx) => ({ id: `s${idx}`, imgUrl }))
          : (w.illustrations || []).map((ill) => ({
              ...ill,
              imgUrl: api.illustrationImageUrl(ill),
            }));
        this.setData({
          detail: w,
          loadError: false,
          // §28：原文快照优先，保证原题删除后错题仍完整可读
          origText: w.questionText || '',
          origIlls: w.illustrations,
        });
        // §28：入库快照齐全时原文与插图都已随详情带回，无需再拉实时题目；
        // 只有未保存原文快照的旧记录才需要回退
        if (w.questionText) {
          this.setData({ question: null, questionMissing: false });
        } else {
          this.loadQuestion();
        }
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
          imgUrl: api.illustrationImageUrl(ill),
        }));
        const patch = { question: q };
        // 快照为空的旧记录：原文/插图回退到实时题目
        if (!this.data.origText && q.text) patch.origText = q.text;
        if (this.data.origIlls.length === 0 && q.illustrations.length > 0) {
          patch.origIlls = q.illustrations;
        }
        this.setData(patch);
      })
      .catch(() => {
        // 原题行随试卷级联删除：不再阻塞展示，快照兜底
        this.setData({ questionMissing: true });
      });
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
