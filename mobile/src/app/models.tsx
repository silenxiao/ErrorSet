// 模型管理：独占启用语义（开关切换），添加/编辑/删除。
// 对齐小程序 pages/models（服务商预设与 Web 端一致）。

import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  createModel,
  deleteModel,
  enableModel,
  listModels,
  testModel,
  updateModel,
  type ModelProfile,
  type ModelTestResult,
} from '@/api/settings';
import {
  Btn,
  Card,
  CenterMuted,
  ErrBox,
  Field,
  Input,
  Mask,
  Muted,
  OptionPicker,
  Screen,
  SubHeader,
  Tag,
  TextBtn,
  showToast,
  confirm,
  C,
} from '@/components/ui';

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

function providerLabel(value: string) {
  return PROVIDERS.find((p) => p.value === value)?.label || value;
}

interface FormState {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const EMPTY_FORM: FormState = { name: '', provider: '', baseUrl: '', model: '', apiKey: '' };

/** 测试结果行文案：可用显示延迟，不可用显示原因 */
function testResultText(r: ModelTestResult): string {
  if (r.ok) return `可用 · 延迟 ${r.latencyMs ?? '-'} ms`;
  return `不可用：${r.error || '未知错误'}`;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 正在测试的模型 id（null 表示空闲）
  const [testingId, setTestingId] = useState<number | null>(null);
  // 测试结果缓存：modelId -> 结果
  const [testResults, setTestResults] = useState<Record<number, ModelTestResult>>({});
  // 表单态
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingHasKey, setEditingHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setModels(await listModels());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const openAddForm = () => {
    setEditingId(null);
    setEditingHasKey(false);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEditForm = (item: ModelProfile) => {
    setEditingId(item.id);
    setEditingHasKey(item.hasApiKey);
    setForm({
      name: item.name || '',
      provider: item.provider || '',
      baseUrl: item.baseUrl || '',
      model: item.model || '',
      apiKey: '',
    });
    setFormOpen(true);
  };

  const pickProvider = (label: string) => {
    const preset = PROVIDERS.find((p) => p.label === label);
    if (!preset) return;
    // 选中预设时自动填充 API 地址与模型名，可再手动修改
    setForm((f) => ({ ...f, provider: preset.value, baseUrl: preset.baseUrl, model: preset.model }));
  };

  const save = async () => {
    if (!form.provider) {
      showToast('请选择服务商');
      return;
    }
    if (!form.model.trim()) {
      showToast('请填写模型名');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey,
      };
      if (editingId === null) {
        await createModel(payload);
      } else {
        await updateModel(editingId, payload);
      }
      showToast('已保存，下一次识别生效');
      setFormOpen(false);
      setEditingId(null);
      await refresh();
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onEnableChange = async (item: ModelProfile, value: boolean) => {
    if (!value) {
      // 独占启用语义：不允许直接关闭，只能开启另一个模型来切换
      showToast('请开启其他模型进行切换');
      refresh();
      return;
    }
    try {
      await enableModel(item.id);
      showToast(`已启用「${item.name || item.model}」`);
      await refresh();
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
      refresh();
    }
  };

  const runTest = async (item: ModelProfile) => {
    if (testingId !== null) return;
    setTestingId(item.id);
    try {
      const r = await testModel(item.id);
      setTestResults((prev) => ({ ...prev, [item.id]: r }));
      showToast(r.ok ? `可用 ${r.latencyMs} ms` : '不可用');
    } catch (e) {
      // 网络/鉴权失败：同样落成结果行，便于对照
      const r: ModelTestResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
      setTestResults((prev) => ({ ...prev, [item.id]: r }));
      Alert.alert('测试请求失败', r.error || '未知错误');
    } finally {
      setTestingId(null);
    }
  };

  const del = (item: ModelProfile) => {
    confirm('删除模型', '确定删除该模型吗？', async () => {
      try {
        await deleteModel(item.id);
        showToast('已删除');
        await refresh();
      } catch (e) {
        Alert.alert('删除失败', e instanceof Error ? e.message : String(e));
      }
    }, '删除');
  };

  return (
    <Screen>
      <SubHeader title="模型管理" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
          <View style={styles.toolbar}>
            <TouchableOpacity activeOpacity={0.7} disabled={formOpen} onPress={openAddForm} style={[styles.addBtn, formOpen && { opacity: 0.5 }]}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, marginLeft: 4 }}>添加模型</Text>
            </TouchableOpacity>
            <Muted style={{ flex: 1 }}>开关表示当前启用的模型，切换后下一次识别生效</Muted>
          </View>

          {error ? <ErrBox message={error} onRetry={refresh} /> : null}
          {loading ? <CenterMuted>加载中…</CenterMuted> : null}
          {!loading && !error && models.length === 0 ? (
            <Card>
              <View style={styles.emptyWrap}>
                <Feather name="inbox" size={30} color={C.text3} />
                <CenterMuted>暂无模型，点击「添加模型」开始配置</CenterMuted>
              </View>
            </Card>
          ) : null}

          {models.map((m) => (
            <Card key={m.id} style={[styles.modelCard, m.enabled && styles.modelEnabled]}>
              <View style={styles.modelRow}>
                <Switch value={m.enabled} onValueChange={(v) => onEnableChange(m, v)} trackColor={{ true: C.primary }} />
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.modelName} numberOfLines={1}>
                      {m.name || m.model}
                    </Text>
                    <Tag color={C.primary}>{providerLabel(m.provider)}</Tag>
                    {/* scope: system=系统模型（后台下发，只读），private=独享模型 */}
                    <Tag color={m.scope === 'system' ? C.primary : C.gray}>{m.scope === 'system' ? '系统' : '独享'}</Tag>
                    {m.exclusive ? <Tag color={C.gray}>独享</Tag> : null}
                    {m.enabled ? <Tag color={C.green}>当前使用</Tag> : null}
                  </View>
                  <Muted style={{ marginTop: 2 }} numberOfLines={1}>
                    {m.model}
                    {m.baseUrl ? ` · ${m.baseUrl}` : ''}
                    {m.hasApiKey ? ' · API Key 已保存' : ''}
                  </Muted>
                </View>
                <View>
                  {/* 测试对自有模型与已开放的系统模型都可用，故不随 scope 隐藏 */}
                  <TextBtn onPress={() => runTest(m)}>
                    {testingId === m.id ? '测试中…' : '测试'}
                  </TextBtn>
                  {m.scope !== 'system' ? (
                    <>
                      <TextBtn onPress={() => openEditForm(m)}>编辑</TextBtn>
                      <TextBtn danger onPress={() => del(m)}>
                        删除
                      </TextBtn>
                    </>
                  ) : null}
                </View>
              </View>
              {testResults[m.id] ? (
                <Text style={[styles.testResult, { color: testResults[m.id].ok ? C.green : C.danger }]}>
                  {testResultText(testResults[m.id])}
                </Text>
              ) : null}
            </Card>
          ))}

          {/* 添加/编辑表单 */}
          <Mask visible={formOpen} onClose={() => setFormOpen(false)}>
            <Text style={styles.formTitle}>{editingId === null ? '添加模型' : '编辑模型'}</Text>
            <ScrollView style={{ maxHeight: 460 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Field label="名称（可选，便于区分多个模型）">
                <Input value={form.name} placeholder="例如：我的 DeepSeek" onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
              </Field>

              <Field label="服务商">
                <OptionPicker
                  options={PROVIDERS.map((p) => p.label)}
                  value={form.provider ? providerLabel(form.provider) : ''}
                  onChange={pickProvider}
                  placeholder="点击选择预设"
                />
                <Muted style={{ marginTop: 4 }}>自定义服务商需填写 API 地址</Muted>
              </Field>

              <Field label="API 地址（Base URL，可选，默认用服务商官方地址）">
                <Input
                  value={form.baseUrl}
                  placeholder="https://api.example.com/v1"
                  autoCapitalize="none"
                  onChangeText={(v) => setForm((f) => ({ ...f, baseUrl: v }))}
                />
              </Field>

              <Field label="模型名">
                <Input
                  value={form.model}
                  placeholder="例如：deepseek-chat"
                  autoCapitalize="none"
                  onChangeText={(v) => setForm((f) => ({ ...f, model: v }))}
                />
              </Field>

              <Field label="API Key">
                <Input
                  value={form.apiKey}
                  secureTextEntry
                  placeholder={editingHasKey ? '已保存（留空不修改）' : '请输入 API Key'}
                  autoCapitalize="none"
                  onChangeText={(v) => setForm((f) => ({ ...f, apiKey: v }))}
                />
              </Field>
            </ScrollView>
            <View style={styles.formBtns}>
              <Btn kind="ghost" small onPress={() => setFormOpen(false)}>
                取消
              </Btn>
              <Btn small loading={saving} onPress={save}>
                保存
              </Btn>
            </View>
          </Mask>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modelCard: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testResult: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
  },
  modelEnabled: {
    borderColor: C.primary,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textStrong,
    maxWidth: 140,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textStrong,
    marginBottom: 12,
    textAlign: 'center',
  },
  formBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
});
