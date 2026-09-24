// 错题渲染组件：把 Markdown 文本渲染为内联样式 HTML，交给 <rich-text> 显示。
// 解析逻辑见 utils/markdown.js（独立工具模块，便于复用与单测）。
const { mdHtml, esc } = require('../../utils/markdown');

Component({
  properties: {
    content: {
      type: String,
      value: '',
      observer(val) {
        this.setData({ html: this.build(val) });
      },
    },
  },
  data: {
    html: '',
  },
  lifetimes: {
    attached() {
      if (!this.data.html && this.data.content) {
        this.setData({ html: this.build(this.data.content) });
      }
    },
  },
  methods: {
    build(md) {
      try {
        return mdHtml(md);
      } catch (e) {
        return esc(String(md || ''));
      }
    },
  },
});
