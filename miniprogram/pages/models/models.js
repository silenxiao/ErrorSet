const api = require('../../utils/api');

// 预设服务商默认 API 地址与模型名，与 Web 端 SettingsModal 保持一致
const PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { value: 'qwen', label: '通义千问 Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max' },
  { value: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { value: 'amd', label: 'AMD 开发者平台', baseUrl: 'https://developer.amd.com.cn/radeon/api/v1', model: 'Qwen3.8-27B' },
  { value: 'gemini', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
  { value: 'custom', label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
];

function providerLabel(value) {
  const hit = PROVIDERS.find((p) => p.value === value);
  return hit ? hit.label : value;
}

function providerIndex(value) {
  return PROVIDERS.findIndex((p) => p.value === value);
}

// 测试结果行文案：可用显示延迟，不可用显示原因
function testResultText(item) {
  if (!item) return '';
  if (item.ok) return `可用 · 延迟 ${item.latencyMs} ms`;
  return `不可用：${item.error || '未知错误'}`;
}

Page({
  data: {
    loading: false,
    error: '',
    models: [],
    // 正在测试的模型 id（null 表示空闲）
    testingId: null,
    // 测试结果缓存：{ [modelId]: { ok, latencyMs, error, text } }
    testResults: {},
    // 表单态：formOpen=显示表单，editingId=null 表示新增
    formOpen: false,
    editingId: null,
    editingHasKey: false,
    saving: false,
    providerOptions: PROVIDERS.map((p) => p.label),
    form: { name: '', providerIndex: -1, provider: '', providerText: '', baseUrl: '', model: '', apiKey: '' },
  },

  onShow() {
    this.refresh();
  },

  async refresh() {
    this.setData({ loading: true, error: '' });
    try {
      const models = await api.listModels();
      this.setData({
        models: (models || []).map((m) => ({
          ...m,
          providerText: providerLabel(m.provider),
          // scope: system=系统模型（后台下发，只读），private=独享模型
          scopeText: m.scope === 'system' ? '系统' : '独享',
          isSystem: m.scope === 'system',
        })),
      });
    } catch (err) {
      this.setData({ error: (err && err.message) || '读取模型列表失败' });
    } finally {
      this.setData({ loading: false });
    }
  },

  openAddForm() {
    this.setData({
      formOpen: true,
      editingId: null,
      editingHasKey: false,
      form: { name: '', providerIndex: -1, provider: '', providerText: '', baseUrl: '', model: '', apiKey: '' },
    });
  },

  openEditForm(e) {
    const item = this.data.models.find((m) => m.id === e.currentTarget.dataset.id);
    if (!item) return;
    this.setData({
      formOpen: true,
      editingId: item.id,
      editingHasKey: !!item.hasApiKey,
      form: {
        name: item.name || '',
        providerIndex: providerIndex(item.provider),
        provider: item.provider || '',
        providerText: providerLabel(item.provider),
        baseUrl: item.baseUrl || '',
        model: item.model || '',
        apiKey: '',
      },
    });
  },

  closeForm() {
    this.setData({ formOpen: false, editingId: null });
  },

  onFormInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onProviderChange(e) {
    const index = Number(e.detail.value);
    const preset = PROVIDERS[index];
    if (!preset) return;
    // 选中预设时自动填充 API 地址与模型名，可再手动修改
    this.setData({
      'form.providerIndex': index,
      'form.provider': preset.value,
      'form.providerText': preset.label,
      'form.baseUrl': preset.baseUrl,
      'form.model': preset.model,
    });
  },

  async save() {
    const { editingId, form } = this.data;
    if (!form.provider) {
      wx.showToast({ title: '请选择服务商', icon: 'none' });
      return;
    }
    if (!form.model || !form.model.trim()) {
      wx.showToast({ title: '请填写模型名', icon: 'none' });
      return;
    }
    const payload = {
      name: form.name.trim(),
      provider: form.provider,
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      apiKey: form.apiKey,
    };
    this.setData({ saving: true });
    try {
      if (editingId === null) {
        await api.createModel(payload);
      } else {
        await api.updateModel(editingId, payload);
      }
      wx.showToast({ title: '已保存，下一次识别生效', icon: 'none' });
      this.closeForm();
      await this.refresh();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async onEnableChange(e) {
    const id = e.currentTarget.dataset.id;
    if (!e.detail.value) {
      // 独占启用语义：不允许直接关闭，只能开启另一个模型来切换
      wx.showToast({ title: '请开启其他模型进行切换', icon: 'none' });
      this.refresh();
      return;
    }
    try {
      const item = this.data.models.find((m) => m.id === id);
      await api.enableModel(id);
      wx.showToast({ title: `已启用「${(item && item.name) || (item && item.model) || ''}」`, icon: 'none' });
      await this.refresh();
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      this.refresh();
    }
  },

  async testModel(e) {
    // dataset 传来的值在部分基础库下是字符串，显式转数字，
    // 保证与 testingId / testResults 的键类型一致
    const id = Number(e.currentTarget.dataset.id);
    if (this.data.testingId !== null) return;
    this.setData({ testingId: id });
    try {
      const res = (await api.testModel(id)) || {};
      const patch = { [`testResults.${id}`]: { ...res, text: testResultText(res) } };
      this.setData(patch);
      // 持久结果行已给出延迟/原因，toast 只做强提示
      wx.showToast({ title: res.ok ? `可用 ${res.latencyMs} ms` : '不可用', icon: 'none' });
    } catch (err) {
      // 网络/鉴权失败：同样落成结果行，便于对照
      const res = { ok: false, error: (err && err.message) || '测试请求失败' };
      this.setData({ [`testResults.${id}`]: { ...res, text: testResultText(res) } });
      wx.showToast({ title: res.error, icon: 'none' });
    } finally {
      this.setData({ testingId: null });
    }
  },

  deleteModel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除模型',
      content: '确定删除该模型吗？',
      confirmText: '删除',
      confirmColor: '#F53F3F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteModel(id);
          wx.showToast({ title: '已删除', icon: 'none' });
          await this.refresh();
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      },
    });
  },
});
