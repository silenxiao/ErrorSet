const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');

const PAGE_SIZE = 10;

Page({
  data: {
    rows: [],
    loading: false,
    error: '',
    backendBase: '',
    page: 1,
    hasMore: true,
    subjectOptions: SUBJECT_OPTIONS,
    editVisible: false,
    editId: null,
    editValue: '',
  },

  onShow() {
    this.setData({ backendBase: api.getBase ? api.getBase() : 'http://127.0.0.1:8000' });
    if (!this.data.rows.length) this.reload(true);
  },

  reload(reset) {
    if (reset) this.setData({ rows: [], page: 1, hasMore: true, error: '' });
    if (this.data.loading) return;
    this.setData({ loading: true });
    api
      .listWrongQuestions()
      .then((list) => {
        const all = list || [];
        const pageRows = all
          .slice((this.data.page - 1) * PAGE_SIZE, this.data.page * PAGE_SIZE)
          .map((w) => ({
            ...w,
            subjectColor: w.subject ? '#1677ff' : '#999',
            illustrations: (w.illustrations || []).map((ill) => ({
              ...ill,
              imgUrl: api.illustrationImageUrl(ill.id),
            })),
          }));
        const rows = this.data.rows.concat(pageRows);
        this.setData({
          rows,
          loading: false,
          hasMore: this.data.page * PAGE_SIZE < all.length,
          error: rows.length ? '' : 'empty',
        });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
        this.setData({ loading: false, error: err.message || '加载失败' });
      });
  },

  retry() {
    this.reload(true);
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.reload(false);
    }
  },

  onReachBottom() {
    this.loadMore();
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/bank-detail/bank-detail?id=${id}` });
  },

  del(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除错题',
      content: '确定删除该错题？',
      success: (r) => {
        if (!r.confirm) return;
        api
          .deleteWrongQuestion(id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'success' });
            this.reload(true);
          })
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }));
      },
    });
  },

  mark(e) {
    const { id, result } = e.currentTarget.dataset;
    api
      .recordWrongResult(id, result)
      .then((up) => {
        const rows = this.data.rows.map((r) => (r.id === up.id ? Object.assign({}, r, up) : r));
        this.setData({ rows });
        wx.showToast({ title: result === 'correct' ? '做对 +1' : '做错 +1', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '记录失败', icon: 'none' }));
  },

  editSubject(e) {
    const { id, subject } = e.currentTarget.dataset;
    this.setData({ editVisible: true, editId: id, editValue: subject || '' });
  },

  onEditValue(e) {
    this.setData({ editValue: e.detail.value });
  },

  onSubjectPick(e) {
    this.setData({ editValue: SUBJECT_OPTIONS[e.detail.value] });
  },

  saveSubject() {
    const id = this.data.editId;
    api
      .updateWrongQuestion(id, { subject: this.data.editValue })
      .then((up) => {
        const rows = this.data.rows.map((r) => (r.id === up.id ? Object.assign({}, r, up) : r));
        this.setData({ rows, editVisible: false });
        wx.showToast({ title: '科目已更新', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },

  closeEdit() {
    this.setData({ editVisible: false });
  },

  noop() {},
});
