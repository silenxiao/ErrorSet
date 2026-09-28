const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');

const PAGE_SIZE = 10;

Page({
  data: {
    rows: [],
    visibleRows: [],
    totalAll: 0,
    subjectFilter: null,
    subjectTags: [],
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
    // 每次进入错题库都刷新，保证新增/修改的错题能及时显示
    this.reload(true);
  },

  reload(reset) {
    if (reset) this.setData({ rows: [], page: 1, hasMore: true, error: '' });
    if (this.data.loading) return;
    this.setData({ loading: true });
    api
      .listWrongQuestions()
      .then((list) => {
        const all = list || [];
        this.allRows = all;
        const pageRows = all
          .slice((this.data.page - 1) * PAGE_SIZE, this.data.page * PAGE_SIZE)
          .map((w) => ({
            ...w,
            subjectColor: w.subject ? '#1677ff' : '#999',
            // 优先用入库时裁剪的快照（静态 /files），旧记录回退到动态裁剪接口
            illustrations: api.wrongIllustrationUrls(w).length
              ? api.wrongIllustrationUrls(w).map((imgUrl, idx) => ({ id: `s${idx}`, imgUrl }))
              : (w.illustrations || []).map((ill) => ({
                  ...ill,
                  imgUrl: api.illustrationImageUrl(ill.id),
                })),
          }));
        const rows = this.data.rows.concat(pageRows);
        this.setData({
          rows,
          totalAll: all.length,
          loading: false,
          hasMore: this.data.page * PAGE_SIZE < all.length,
          error: rows.length ? '' : 'empty',
        });
        this.computeTags();
        this.applyFilter();
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

  // 科目筛选标签：固定科目顺序在前，其余（含"未设置"）按出现顺序排在后面
  computeTags() {
    const all = this.allRows || [];
    const counts = {};
    all.forEach((w) => {
      const key = w.subject || '未设置';
      counts[key] = (counts[key] || 0) + 1;
    });
    const fixed = SUBJECT_OPTIONS.filter((s) => counts[s]);
    const extra = Object.keys(counts).filter((k) => fixed.indexOf(k) < 0);
    this.setData({
      subjectTags: [...fixed, ...extra].map((name) => ({ name, count: counts[name] })),
    });
  },

  onFilterTap(e) {
    const name = e.currentTarget.dataset.name || null;
    // 再点一次已选科目回到"全部"
    this.setData({ subjectFilter: this.data.subjectFilter === name ? null : name });
    this.applyFilter();
  },

  applyFilter() {
    const f = this.data.subjectFilter;
    const rows = this.data.rows;
    const visibleRows = f == null ? rows : rows.filter((r) => (r.subject || '未设置') === f);
    this.setData({ visibleRows });
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

  sort(e) {
    const { id, position } = e.currentTarget.dataset;
    api
      .sortWrongQuestion(id, position)
      .then(() => {
        wx.showToast({ title: position === 'top' ? '已置顶' : '已置底', icon: 'success' });
        this.reload(true);
      })
      .catch((err) => wx.showToast({ title: err.message || '操作失败', icon: 'none' }));
  },

  mark(e) {
    const { id, result } = e.currentTarget.dataset;
    api
      .recordWrongResult(id, result)
      .then((up) => {
        const rows = this.data.rows.map((r) => (r.id === up.id ? Object.assign({}, r, up) : r));
        this.allRows = (this.allRows || []).map((r) => (r.id === up.id ? Object.assign({}, r, up) : r));
        this.setData({ rows });
        this.applyFilter();
        wx.showToast({ title: result === 'correct' ? '做对 +1' : '做错 +1', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '记录失败', icon: 'none' }));
  },

  editSubject(e) {
    const { id, subject } = e.currentTarget.dataset;
    this.setData({ editVisible: true, editId: id, editValue: subject || '' });
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
        this.allRows = (this.allRows || []).map((r) => (r.id === up.id ? Object.assign({}, r, up) : r));
        this.setData({ rows, editVisible: false });
        this.computeTags();
        this.applyFilter();
        wx.showToast({ title: '科目已更新', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || '保存失败', icon: 'none' }));
  },

  closeEdit() {
    this.setData({ editVisible: false });
  },

  noop() {},
});
