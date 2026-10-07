const api = require('../../utils/api');
const { SUBJECT_OPTIONS } = require('../../utils/format');
// 裸 LaTeX（\dfrac{3}{10} 这类没包 $ 的公式源码）渲染前自动补 $...$
const { ensureMath } = require('../../utils/markdown');

// correctAnswer 的所有写入点都要同步刷新 correctAnswerView（预览渲染用），
// 原始 correctAnswer 保留给编辑框与保存
function withAnswerView(patch) {
  if (patch.correctAnswer !== undefined) {
    patch.correctAnswerView = ensureMath(patch.correctAnswer);
  }
  return patch;
}

// AI 分析结果归一化。新接口返回结构化 JSON（subject/answer/analysis/knowledgePoints），
// 旧接口返回「科目：… 正确答案：… AI分析：…」纯文本，两种都要能读，
// 否则后端一旦升级就整页报错（与 RN 端 normalizeAnalysis 保持一致）。
function normalizeAnalysis(res) {
  if (res && typeof res === 'object') {
    return {
      correct: typeof res.answer === 'string' ? res.answer : '',
      analysis: typeof res.analysis === 'string' ? res.analysis : '',
      subject: typeof res.subject === 'string' ? res.subject : '',
    };
  }

  const text = typeof res === 'string' ? res : '';
  if (text.trim().startsWith('{')) {
    try {
      return normalizeAnalysis(JSON.parse(text));
    } catch (e) {
      // 不是 JSON，按旧纯文本格式继续解析
    }
  }

  const subjectMatch = text.match(/^(?:科目|学科)：\s*(语文|数学|英语|物理|化学|生物|历史|政治|地理)/m);
  const ansMarker = /^(?:正确答案|答案)：?\s*/m.exec(text);
  const anaMarker = /^(?:AI分析|分析|解析|解题过程)：?\s*/m.exec(text);
  // 「正确答案」「AI分析」两段的先后顺序不稳定，谁在后谁是前一段的结束
  const stripSubject = (s) => s.replace(/^(?:科目|学科)：.*\r?\n/gm, '').trim();
  let correct = '';
  let analysis = '';
  if (ansMarker) {
    const end = anaMarker && anaMarker.index > ansMarker.index ? anaMarker.index : text.length;
    correct = stripSubject(text.slice(ansMarker.index + ansMarker[0].length, end));
  } else if (!anaMarker) {
    correct = stripSubject(text);
  }
  if (anaMarker) {
    const end = ansMarker && ansMarker.index > anaMarker.index ? anaMarker.index : text.length;
    analysis = stripSubject(text.slice(anaMarker.index + anaMarker[0].length, end));
  }
  return { correct, analysis, subject: subjectMatch ? subjectMatch[1] : '' };
}

Page({
  data: {
    questionId: null,
    subjectOptions: SUBJECT_OPTIONS,
    subjectIndex: 0,
    questionNo: '',
    correctAnswer: '',
    correctAnswerView: '',
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
        // 该题分析过但还没入库时，回显最近一次 AI 分析结果（后端持久化）
        const last = q.lastAnalysis;
        if (last && (last.answer || last.analysis)) {
          patch.correctAnswer = last.answer || '';
          patch.analysis = last.analysis || '';
          if (last.subject && SUBJECT_OPTIONS.indexOf(last.subject) >= 0) {
            patch.subjectIndex = SUBJECT_OPTIONS.indexOf(last.subject);
          }
        }
        this.setData(withAnswerView(patch));
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
    this.setData(withAnswerView({ correctAnswer: e.detail.value }));
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
        const parsed = normalizeAnalysis(res);
        const patch = withAnswerView({ correctAnswer: parsed.correct, analysis: parsed.analysis });
        if (parsed.subject) {
          const i = SUBJECT_OPTIONS.indexOf(parsed.subject);
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

  // overwrite 只认布尔 true：bindtap 会把事件对象当首参传入，不能按真值判断
  save(overwrite) {
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
        knowledgePoints: [],
        note: this.data.note,
        overwrite: overwrite === true,
      })
      .then(() => {
        wx.showToast({ title: '已加入错题库', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => {
        if (err && err.status === 409) {
          // 已在错题库：询问是否以本次填写的内容覆盖旧错题
          wx.showModal({
            title: '该题已加入错题库',
            content: '是否以最新的解答覆盖以前的错题？',
            confirmText: '覆盖',
            success: (r) => {
              if (r.confirm) this.save(true);
            },
          });
        } else {
          wx.showToast({ title: err.message || '加入失败', icon: 'none' });
        }
      })
      .then(() => this.setData({ saving: false }));
  },
});
