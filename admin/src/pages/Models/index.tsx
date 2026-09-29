import { PlusOutlined } from "@ant-design/icons";
import {
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from "antd";
import { useCallback, useEffect, useState } from "react";

import {
  AdminModelRow,
  AdminUserRow,
  createModel,
  deleteModel,
  listSystemModels,
  listUserModels,
  listUsers,
  testModel,
  updateModel,
} from "../../api/admin";

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
  return PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? provider;
}

interface ModelFormValues {
  name?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  enabled?: boolean;
}

/** 表单弹窗：新建（系统/独享）与编辑共用；编辑时 api_key 留空表示保持不变。 */
function ModelFormModal(props: {
  open: boolean;
  scope: "system" | "user";
  userId: number | null;
  editing: AdminModelRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { open, scope, userId, editing, onClose, onSaved } = props;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        provider: editing.provider,
        baseUrl: editing.baseUrl,
        model: editing.model,
        apiKey: "",
        enabled: editing.enabled,
      });
    } else {
      form.resetFields();
    }
  }, [open, editing, form]);

  const handleSave = async () => {
    const values: ModelFormValues = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        name: values.name ?? "",
        provider: values.provider ?? "",
        baseUrl: values.baseUrl ?? "",
        model: values.model ?? "",
        apiKey: values.apiKey ?? "",
      };
      if (editing) {
        await updateModel(editing.id, {
          ...payload,
          enabled: scope === "system" ? (values.enabled ?? editing.enabled) : undefined,
        });
        message.success("已保存");
      } else {
        await createModel({
          scope,
          userId: scope === "user" ? (userId ?? undefined) : undefined,
          ...payload,
          enabled: scope === "system" ? (values.enabled ?? false) : false,
        });
        message.success(scope === "system" ? "系统模型已创建" : "已分配给该用户");
      }
      onSaved();
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const provider = Form.useWatch("provider", form);
  const handleProviderSelect = (value: string) => {
    const preset = PROVIDER_DEFAULTS[value];
    if (preset) {
      form.setFieldsValue({
        baseUrl: preset.baseUrl || "",
        model: preset.model || "",
      });
    }
  };

  return (
    <Modal
      title={
        editing
          ? "编辑模型"
          : scope === "system"
            ? "新增系统模型"
            : "为用户新增模型"
      }
      open={open}
      onCancel={onClose}
      onOk={() => void handleSave()}
      confirmLoading={saving}
      okText="保存"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="名称（可选，便于区分多个模型）">
          <Input placeholder="例如：DeepSeek 视觉" allowClear />
        </Form.Item>
        <Form.Item
          name="provider"
          label="服务商（可选预设，也可输入自定义名称）"
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
        <Form.Item name="baseUrl" label="API 地址（Base URL，可选）">
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
            placeholder={editing ? "已保存（留空不修改）" : "请输入 API Key"}
            autoComplete="new-password"
          />
        </Form.Item>
        {scope === "system" && (
          <Form.Item
            name="enabled"
            label="对所有用户开放"
            valuePropName="checked"
            extra="开启后所有用户的模型列表都会出现该模型，可自行启用"
          >
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export default function Models() {
  const [tab, setTab] = useState("system");
  const [systemRows, setSystemRows] = useState<AdminModelRow[]>([]);
  const [userRows, setUserRows] = useState<AdminModelRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminModelRow | null>(null);
  // 正在测试连通性的模型 id：按钮转圈用
  const [testingId, setTestingId] = useState<number | null>(null);

  const loadSystem = useCallback(async () => {
    setLoading(true);
    try {
      setSystemRows(await listSystemModels());
    } catch (err) {
      message.error(err instanceof Error ? err.message : "读取系统模型失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserModels = useCallback(async (uid: number) => {
    setLoading(true);
    try {
      setUserRows(await listUserModels(uid));
    } catch (err) {
      message.error(err instanceof Error ? err.message : "读取用户模型失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => message.error("读取用户列表失败"));
  }, []);

  useEffect(() => {
    if (tab === "system") void loadSystem();
  }, [tab, loadSystem]);

  useEffect(() => {
    if (tab === "user" && userId !== null) void loadUserModels(userId);
  }, [tab, userId, loadUserModels]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row: AdminModelRow) => {
    setEditing(row);
    setFormOpen(true);
  };

  const handleToggleSystem = async (row: AdminModelRow, checked: boolean) => {
    try {
      await updateModel(row.id, {
        name: row.name,
        provider: row.provider,
        baseUrl: row.baseUrl,
        model: row.model,
        apiKey: "",
        enabled: checked,
      });
      message.success(checked ? "已对所有用户开放" : "已关闭，用户不可再使用");
      await loadSystem();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "操作失败");
    }
  };

  const handleDelete = async (row: AdminModelRow) => {
    try {
      await deleteModel(row.id);
      message.success("已删除");
      if (row.isSystem) {
        await loadSystem();
      } else if (userId !== null) {
        await loadUserModels(userId);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "删除失败");
    }
  };

  const baseColumns = [
    { title: "名称", dataIndex: "name", render: (v: string, row: AdminModelRow) => v || row.model },
    { title: "服务商", dataIndex: "provider", render: (v: string) => <Tag>{providerLabel(v)}</Tag> },
    { title: "模型名", dataIndex: "model" },
    { title: "Base URL", dataIndex: "baseUrl", ellipsis: true },
    {
      title: "API Key",
      dataIndex: "hasApiKey",
      width: 90,
      render: (v: boolean) => (v ? <Tag color="green">已保存</Tag> : <Tag>未设置</Tag>),
    },
  ];

  const handleTest = async (row: AdminModelRow) => {
    setTestingId(row.id);
    try {
      const result = await testModel(row.id);
      if (result.ok) {
        message.success(
          `「${row.name || row.model}」可用，延迟 ${result.latencyMs} ms`,
        );
      } else {
        message.error(
          `「${row.name || row.model}」不可用：${result.error ?? "未知错误"}`,
        );
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "测试请求失败");
    } finally {
      setTestingId(null);
    }
  };

  const actionColumn = {
    title: "操作",
    width: 170,
    render: (_: unknown, row: AdminModelRow) => (
      <Space>
        <Button
          type="link"
          size="small"
          loading={testingId === row.id}
          onClick={() => void handleTest(row)}
        >
          测试
        </Button>
        <Button type="link" size="small" onClick={() => openEdit(row)}>
          编辑
        </Button>
        <Popconfirm
          title="确定删除该模型吗？"
          description="选中它的用户会回落到自己启用的其他模型"
          onConfirm={() => void handleDelete(row)}
        >
          <Button type="link" size="small" danger>
            删除
          </Button>
        </Popconfirm>
      </Space>
    ),
  };

  const systemTab = (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          新增系统模型
        </Button>
      </div>
      <Table<AdminModelRow>
        rowKey="id"
        loading={loading}
        dataSource={systemRows}
        pagination={false}
        columns={[
          ...baseColumns,
          {
            title: "对所有用户开放",
            dataIndex: "enabled",
            width: 130,
            render: (v: boolean, row: AdminModelRow) => (
              <Switch
                checked={v}
                onChange={(checked) => void handleToggleSystem(row, checked)}
              />
            ),
          },
          actionColumn,
        ]}
      />
    </div>
  );

  const userTab = (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder="选择用户"
          value={userId}
          onChange={(v) => setUserId(v)}
          options={users.map((u) => ({ value: u.id, label: u.username }))}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={userId === null}
          onClick={openAdd}
        >
          为该用户新增模型
        </Button>
      </Space>
      {userId === null ? (
        <Table<AdminModelRow> rowKey="id" loading={loading} dataSource={[]} columns={baseColumns} pagination={false} />
      ) : (
        <Table<AdminModelRow>
          rowKey="id"
          loading={loading}
          dataSource={userRows}
          pagination={false}
          columns={[...baseColumns, actionColumn]}
          locale={{ emptyText: "该用户暂无后台分配的模型（用户自己添加的不会在这里显示）" }}
        />
      )}
    </div>
  );

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>模型设置</h2>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: "system", label: "系统模型", children: systemTab },
          { key: "user", label: "用户模型", children: userTab },
        ]}
      />
      <ModelFormModal
        open={formOpen}
        scope={tab === "system" ? "system" : "user"}
        userId={userId}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          if (tab === "system") void loadSystem();
          else if (userId !== null) void loadUserModels(userId);
        }}
      />
    </div>
  );
}
