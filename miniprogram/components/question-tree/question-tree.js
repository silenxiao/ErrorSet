const { Q_STATUS } = require('../../utils/format');

Component({
  properties: {
    questions: { type: Array, value: [] },
    selectedId: { type: Number, value: null },
    canReview: { type: Boolean, value: false },
  },

  data: {
    items: [],
  },

  observers: {
    'questions,selectedId': function (questions, selectedId) {
      this.build(questions, selectedId);
    },
  },

  methods: {
    build(questions, selectedId) {
      const list = questions || [];
      const byId = new Map(list.map((q) => [q.id, q]));
      const childrenOf = (pid) => list.filter((q) => q.parentId === pid);
      const roots = list.filter((q) => q.parentId == null || !byId.has(q.parentId));

      const out = [];
      const walk = (q, depth) => {
        out.push({
          id: q.id,
          depth,
          no: q.questionNo,
          text: q.text,
          statusText: Q_STATUS[q.status] ? Q_STATUS[q.status].text : q.status,
          statusColor: Q_STATUS[q.status] ? Q_STATUS[q.status].color : '#999',
          suspicious: q.confidence != null && q.confidence < 0.7,
          manual: q.bboxSource === 'manual',
          illCount: (q.illustrations || []).length,
          canEdit: q.status === 'completed',
          selected: q.id === selectedId,
        });
        childrenOf(q.id).forEach((c) => walk(c, depth + 1));
      };
      roots.forEach((r) => walk(r, 0));
      this.setData({ items: out });
    },

    onSelect(e) {
      this.triggerEvent('select', { id: Number(e.currentTarget.dataset.id), source: 'list' });
    },

    onAddWrong(e) {
      const q = this.findQuestion(e.currentTarget.dataset.id);
      this.triggerEvent('addwrong', { question: q });
    },

    onReset(e) {
      this.triggerEvent('reset', { id: Number(e.currentTarget.dataset.id) });
    },

    findQuestion(id) {
      return (this.properties.questions || []).find((q) => q.id === id);
    },

    noop() {},
  },
});
