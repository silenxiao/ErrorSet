const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');

Page({
  data: {
    questionId: null,
    subjectOptions: SUBJECT_OPTIONS,
    subjectIndex: 0,
    questionNo: '',
    correctAnswer: '',
    analysis: '',
    note: '',
    analyzing: false,
    saving: false,
    models: [],
    modelName: '',
    // 正确答案默认以 Markdown 渲染预览，点框内铅笔图标切换为编辑
    editCorrect: false,
  },

  onLoad(options) {
    const qid = Number(options.questionId);
    const subject = decodeURIComponent(options.subject || '');
    const idx = Math.max(0, SUBJECT_OPTIONS.indexOf(subject));
    this.setData({ questionId: qid, subjectIndex: idx });

    this.loadModels();

    // 读取题号与科目默认值（不再展示题目原文）
    api
      .getQuestion(qid)
      .then((q) => {
        if (!q) return;
        const patch = { questionNo: q.questionNo || '' };
        if (q.subject) patch.subjectIndex = Math.max(0, SUBJECT_OPTIONS.indexOf(q.subject));
        this.setData(patch);
        wx.setNavigationBarTitle({ title: `加入错题库：第 ${q.questionNo || ''} 题` });
      })
      .catch(() => {});
  },

  loadModels() {
    api
      .listModels()
      .then((list) => {
        const models = list || [];
        const enabled = models.find((m) => m.enabled);
        this.setData({
          models,
          modelName: enabled ? enabled.name || enabled.model : '',
        });
      })
      .catch(() => {
        // 模型列表加载失败不阻塞主流程
      });
  },

  chooseModel() {
    const models = this.data.models;
    if (!models.length) {
      wx.showModal({
        title: '还没有模型配置',
        content: '先去「模型管理」添加一个识别模型？',
        confirmText: '去添加',
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: '/pages/models/models' });
        },
      });
      return;
    }
    wx.showActionSheet({
      itemList: models.map((m) => (m.enabled ? '✓ ' : '') + (m.name || m.model)),
      success: (r) => {
        const picked = models[r.tapIndex];
        if (!picked || picked.enabled) return;
        api
          .enableModel(picked.id)
          .then(() => {
            wx.showToast({ title: '已切换识别模型', icon: 'success' });
            this.loadModels();
          })
          .catch((err) =>
            wx.showToast({ title: err.message || '切换失败', icon: 'none' })
          );
      },
    });
  },

  onSubject(e) {
    this.setData({ subjectIndex: e.detail.value });
  },

  toggleCorrect() {
    this.setData({ editCorrect: !this.data.editCorrect });
  },

  onCorrect(e) {
    this.setData({ correctAnswer: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  aiAnalyze() {
    if (this.data.analyzing) return;
    this.setData({ analyzing: true });
    api
      .analyzeQuestion(this.data.questionId)
      .then((res) => {
        const subjectMatch = res.match(/^(?:科目|学科)：\s*(语文|数学|英语|物理|化学|生物|历史|政治|地理)/m);
        const ansMarker = /^(?:正确答案|答案)：?\s*/m.exec(res);
        const anaMarker = /^(?:AI分析|分析|解析|解题过程)：?\s*/m.exec(res);
        const stripSubject = (s) => s.replace(/^(?:科目|学科)：.*\r?\n/gm, '').trim();
        let correct = '';
        let analysis = '';
        if (ansMarker) {
          const end = anaMarker ? anaMarker.index : res.length;
          correct = stripSubject(res.slice(ansMarker.index + ansMarker[0].length, end));
        } else {
          correct = stripSubject(res);
        }
        if (anaMarker) {
          analysis = stripSubject(res.slice(anaMarker.index + anaMarker[0].length));
        }
        const patch = { correctAnswer: correct, analysis };
        if (subjectMatch) {
          const i = SUBJECT_OPTIONS.indexOf(subjectMatch[1]);
          if (i >= 0) patch.subjectIndex = i;
        }
        // 分析完成后回到 Markdown 预览态
        patch.editCorrect = false;
        this.setData(patch);
        wx.showToast({ title: 'AI 分析完成', icon: 'success' });
      })
      .catch((err) => wx.showToast({ title: err.message || 'AI 分析失败', icon: 'none' }))
      .then(() => this.setData({ analyzing: false }));
  },

  cancel() {
    wx.navigateBack();
  },

  save() {
    if (this.data.saving) return;
    const subject = SUBJECT_OPTIONS[this.data.subjectIndex];
    this.setData({ saving: true });
    api
      .addWrongQuestion({
        questionId: this.data.questionId,
        answer: '',
        correctAnswer: this.data.correctAnswer,
        subject,
        analysis: this.data.analysis,
        wrongReason: '',
        knowledgePoints: [],
        note: this.data.note,
      })
      .then(() => {
        wx.showToast({ title: '已加入错题库', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => wx.showToast({ title: err.message || '加入失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }));
  },
});
