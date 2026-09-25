const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');
const { extractAnswerFromAnalysis } = require('../../utils/analysis');

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
    // 正确答案默认以 Markdown 渲染预览，点框内铅笔图标切换为编辑
    editCorrect: false,
  },

  onLoad(options) {
    const qid = Number(options.questionId);
    const subject = decodeURIComponent(options.subject || '');
    const idx = Math.max(0, SUBJECT_OPTIONS.indexOf(subject));
    this.setData({ questionId: qid, subjectIndex: idx });

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
        // "正确答案"以 AI 分析推导出的最终结论为准（两者不一致时用分析结论）
        const extracted = extractAnswerFromAnalysis(analysis);
        const patch = { correctAnswer: extracted || correct, analysis };
        if (subjectMatch) {
          const i = SUBJECT_OPTIONS.indexOf(subjectMatch[1]);
          if (i >= 0) patch.subjectIndex = i;
        }
        // 分析完成后回到 Markdown 预览态
        patch.editCorrect = false;
        this.setData(patch);
        if (extracted && extracted !== correct.trim()) {
          wx.showToast({ title: '已按 AI 分析的结论显示正确答案', icon: 'none' });
        } else {
          wx.showToast({ title: 'AI 分析完成', icon: 'success' });
        }
      })
      .catch((err) => wx.showToast({ title: err.message || 'AI 分析失败', icon: 'none' }))
      .then(() => this.setData({ analyzing: false }));
  },

  cancel() {
    wx.navigateBack();
  },

  save() {
    if (this.data.saving) return;
    if (!this.data.correctAnswer && !this.data.analysis) {
      wx.showToast({ title: '请先填写正确答案或进行 AI 分析', icon: 'none' });
      return;
    }
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
