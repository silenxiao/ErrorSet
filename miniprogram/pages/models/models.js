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

Page({
  data: {
    loading: false,
    error: '',
    models: [],
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

  deleteModel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除模型',
      content: '确定删除该模型吗？',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
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
