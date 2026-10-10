import { DeleteOutlined, EditOutlined, PlusOutlined, SettingOutlined } from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Tag,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  ModelProfile,
  createModel,
  deleteModel,
  enableModel,
  listModels,
  testModel,
  updateModel,
} from "../../api/settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 模型表单值 */
interface ModelFormValues {
  name?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

const PROVIDER_OPTIONS = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "通义千问 Qwen" },
  { value: "zhipu", label: "智谱 GLM" },
  { value: "openai", label: "OpenAI" },
  { value: "amd", label: "AMD 开发者平台" },
  { value: "gemini", label: "Google Gemini" },
  { value: "custom", label: "自定义（OpenAI 兼容）" },
];

// 预设服务商的默认 API 地址与模型名（从列表选中时自动填充，可再手动修改）
const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-vl-max",
  },
  zhipu: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  amd: {
    baseUrl: "https://developer.amd.com.cn/radeon/api/v1",
    model: "Qwen3.8-27B",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
  },
  custom: { baseUrl: "", model: "" },
};

function providerLabel(provider: string) {
  return (
    PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? provider
  );
}

/** 模型管理（右上角齿轮）：维护模型列表，开关表示当前启用的模型，切换后下一次识别立即生效。 */
export default function SettingsModal({ open, onClose }: Props) {
  const [form] = Form.useForm();
  const [models, setModels] = useState<ModelProfile[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  // 正在测试连通性的模型 id：按钮转圈用
  const [testingId, setTestingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const list = await listModels();
    setModels(list);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh().catch((err) =>
      message.error(err instanceof Error ? err.message : "读取模型列表失败"),
    );
  }, [open, refresh]);

  const openAddForm = () => {
    setEditingId(null);
    setHasApiKey(false);
    form.resetFields();
    setFormOpen(true);
  };

  const openEditForm = (item: ModelProfile) => {
    setEditingId(item.id);
    setHasApiKey(item.hasApiKey);
    form.setFieldsValue({
      name: item.name,
      provider: item.provider,
      baseUrl: item.baseUrl,
      model: item.model,
      apiKey: "",
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    form.resetFields();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const values: ModelFormValues = await form.validateFields();
      const payload = {
        name: values.name ?? "",
        provider: values.provider ?? "",
        baseUrl: values.baseUrl ?? "",
        model: values.model ?? "",
        apiKey: values.apiKey ?? "",
      };
      if (editingId === null) {
        await createModel(payload);
      } else {
        await updateModel(editingId, payload);
      }
      message.success("已保存，下一次识别生效");
      closeForm();
      await refresh();
    } catch (err) {
      // 表单校验失败由 antd 在字段下方展示，不弹全局错误
      if (!(err && typeof err === "object" && "errorFields" in err)) {
        message.error(err instanceof Error ? err.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEnable = async (item: ModelProfile, checked: boolean) => {
    if (!checked) {
      // 独占启用语义：不允许直接关闭，只能开启另一个模型来切换
      message.info("请开启其他模型进行切换");
      return;
    }
    try {
      await enableModel(item.id);
      message.success(`已启用「${item.name || item.model}」，下一次识别生效`);
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDelete = async (item: ModelProfile) => {
    try {
      await deleteModel(item.id);
      message.success("已删除");
      await refresh();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const handleTest = async (item: ModelProfile) => {
    setTestingId(item.id);
    try {
      const result = await testModel(item.id);
      if (result.ok) {
        message.success(`「${item.name || item.model}」可用，延迟 ${result.latencyMs} ms`);
      } else {
        message.error(`「${item.name || item.model}」不可用：${result.error ?? "未知错误"}`);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "测试请求失败");
    } finally {
      setTestingId(null);
    }
  };

  // 选中服务商时自动填充 API 地址与模型名
  const handleProviderSelect = (value: string) => {
    const preset = PROVIDER_DEFAULTS[value];
    if (preset) {
      form.setFieldsValue({
        baseUrl: preset.baseUrl || "",
        model: preset.model || "",
      });
    }
  };

  const provider = Form.useWatch("provider", form);

  return (
    <Modal
      title={
        <Space size={8}>
          <SettingOutlined style={{ color: "var(--primary)" }} />
          模型管理
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openAddForm}
          disabled={formOpen}
        >
          添加模型
        </Button>
        <span style={{ color: "var(--text-3)", fontSize: 12 }}>
          开关表示当前启用的模型，切换后下一次识别生效
        </span>
      </div>

      {formOpen && (
        <div
          style={{
            border: "1px solid var(--divider)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
            background: "var(--bg)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {editingId === null ? "添加模型" : "编辑模型"}
          </div>
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="名称（可选，便于区分多个模型）">
              <Input placeholder="例如：我的 DeepSeek" allowClear />
            </Form.Item>
            <Form.Item
              name="provider"
              label="服务商（可选预设，也可输入自定义名称，自定义需填写 API 地址）"
              rules={[{ required: true, message: "请选择或输入服务商" }]}
            >
              <AutoComplete
                options={PROVIDER_OPTIONS}
                filterOption={(input, option) =>
                  String(option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                onSelect={handleProviderSelect}
              >
                <Input placeholder="点击选择预设，或输入自定义服务商名称" />
              </AutoComplete>
            </Form.Item>
            <Form.Item
              name="baseUrl"
              label="API 地址（Base URL，可选，默认用服务商官方地址）"
            >
              <Input
                placeholder={
                  PROVIDER_DEFAULTS[provider ?? ""]?.baseUrl ||
                  "https://api.example.com/v1"
                }
                allowClear
              />
            </Form.Item>
            <Form.Item
              name="model"
              label="模型名"
              rules={[{ required: true, message: "请填写模型名" }]}
            >
              <Input placeholder="例如：deepseek-chat" allowClear />
            </Form.Item>
            <Form.Item name="apiKey" label="API Key">
              <Input.Password
                placeholder={
                  hasApiKey ? "已保存（留空不修改）" : "请输入 API Key"
                }
                autoComplete="new-password"
              />
            </Form.Item>
            <Space style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button onClick={closeForm}>取消</Button>
              <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                保存
              </Button>
            </Space>
          </Form>
        </div>
      )}

      {models.length === 0 ? (
        <Empty description="暂无模型，点击「添加模型」开始配置" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {models.map((item) => (
            <div
              key={item.id}
              className={`model-card${item.enabled ? " model-card-active" : ""}`}
            >
              <Switch
                checked={item.enabled}
                onChange={(checked) => void handleEnable(item, checked)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>
                    {item.name || item.model}
                  </span>
                  {/* 供应商与名称相同（如自定义命名）时不再重复展示 */}
                  {providerLabel(item.provider) !== (item.name || item.model) && (
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                      {providerLabel(item.provider)}
                    </span>
                  )}
                  {item.scope === "system" ? (
                    <Tag color="blue">系统</Tag>
                  ) : (
                    <Tag>独享</Tag>
                  )}
                  {item.exclusive && <Tag>独享</Tag>}
                  {item.enabled && <Tag color="success">当前使用</Tag>}
                </div>
                <div
                  style={{
                    color: "var(--text-3)",
                    fontSize: 12,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.model}
                  {item.baseUrl ? ` · ${item.baseUrl}` : ""}
                  {item.hasApiKey ? " · API Key 已保存" : ""}
                </div>
              </div>
              <Button
                type="text"
                size="small"
                loading={testingId === item.id}
                onClick={() => void handleTest(item)}
              >
                测试
              </Button>
              {item.scope !== "system" && (
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => openEditForm(item)}
                />
              )}
              {item.scope !== "system" && (
                <Popconfirm
                  title="确定删除该模型吗？"
                  onConfirm={() => void handleDelete(item)}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
