const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');

Page({
  data: {
    detail: null,
    question: null,
    loadError: false,
    subjectOptions: SUBJECT_OPTIONS,
    editVisible: false,
    editValue: '',
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

  editSubject() {
    this.setData({ editVisible: true, editValue: this.data.detail.subject || '' });
  },

  onSubjectPick(e) {
    this.setData({ editValue: SUBJECT_OPTIONS[e.detail.value] });
  },

  onEditValue(e) {
    this.setData({ editValue: e.detail.value });
  },

  saveSubject() {
    api
      .updateWrongQuestion(this.data.detail.id, { subject: this.data.editValue })
      .then((up) => {
        const detail = Object.assign({}, this.data.detail, up);
        this.setData({ detail, editVisible: false });
        wx.showToast({ title: '科目已更新', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },

  closeEdit() {
    this.setData({ editVisible: false });
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

  noop() {},
});
