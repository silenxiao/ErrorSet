import { Form, Input, Modal, Select, message } from "antd";
import { useEffect, useState } from "react";

import {
  getProviderSettings,
  updateProviderSettings,
} from "../../api/settings";

interface Props {
  open: boolean;
  onClose: () => void;
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

const BASE_URL_PLACEHOLDER: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  openai: "https://api.openai.com/v1",
  amd: "https://developer.amd.com.cn/radeon/api/v1",
  custom: "https://your-api.example.com/v1",
};

/** 识别服务商设置（右上角齿轮）：保存后下一次识别立即生效。 */
export default function SettingsModal({ open, onClose }: Props) {
  const [form] = Form.useForm();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getProviderSettings()
      .then((cfg) => {
        setHasApiKey(cfg.hasApiKey);
        form.setFieldsValue({
          provider: cfg.provider || undefined,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        });
      })
      .catch((err) =>
        message.error(err instanceof Error ? err.message : "读取设置失败"),
      );
  }, [open, form]);

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await updateProviderSettings({
        provider: values.provider,
        baseUrl: values.baseUrl ?? "",
        model: values.model ?? "",
        apiKey: values.apiKey ?? "",
      });
      message.success("设置已保存，下一次识别生效");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const provider = Form.useWatch("provider", form);

  return (
    <Modal
      title="⚙ 设置"
      open={open}
      onOk={() => void handleSave()}
      onCancel={onClose}
      okText="保存"
      confirmLoading={saving}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="provider"
          label="服务商"
          rules={[{ required: true, message: "请选择服务商" }]}
        >
          <Select options={PROVIDER_OPTIONS} placeholder="选择服务商" />
        </Form.Item>
        <Form.Item
          name="baseUrl"
          label="API 地址（Base URL，可选，默认用服务商官方地址）"
        >
          <Input
            placeholder={
              BASE_URL_PLACEHOLDER[provider ?? ""] ?? "https://api.example.com/v1"
            }
            allowClear
          />
        </Form.Item>
        <Form.Item
          name="model"
          label="模型名"
          rules={[{ required: true, message: "请填写模型名" }]}
        >
          <Input placeholder="例如：deepseek-flash" allowClear />
        </Form.Item>
        <Form.Item name="apiKey" label="API Key">
          <Input.Password
            placeholder={hasApiKey ? "已保存（留空不修改）" : "请输入 API Key"}
            autoComplete="new-password"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
