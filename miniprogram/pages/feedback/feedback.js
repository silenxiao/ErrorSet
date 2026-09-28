const api = require('../../utils/api');
const { formatDate } = require('../../utils/format');

const MAX_LEN = 1000;

Page({
  data: {
    content: '',
    maxLen: MAX_LEN,
    saving: false,
    list: [],
  },

  onShow() {
    this.loadList();
  },

  loadList() {
    api
      .listMyFeedback()
      .then((list) => {
        (list || []).forEach((item) => {
          item.createdAtText = formatDate(item.createdAt);
        });
        this.setData({ list: list || [] });
      })
      .catch(() => {});
  },

  onContent(e) {
    this.setData({ content: e.detail.value });
  },

  save() {
    if (this.data.saving) return;
    const content = (this.data.content || '').trim();
    if (!content) {
      wx.showToast({ title: '请填写留言内容', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    api
      .createFeedback(content)
      .then(() => {
        wx.showToast({ title: '留言已提交', icon: 'success' });
        this.setData({ content: '' });
        this.loadList();
      })
      .catch((err) => wx.showToast({ title: err.message || '提交失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },
});
