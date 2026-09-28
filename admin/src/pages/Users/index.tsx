import { KeyOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  message,
} from "antd";

import { deleteUser, listUsers, updateUser } from "../../api/admin";
import type { AdminUserRow } from "../../api/admin";
import { getCurrentUser } from "../../api/auth";
import { formatDate } from "../../utils/format";

export default function Users() {
  const currentUser = getCurrentUser();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [form] = Form.useForm<{ password: string }>();

  const load = useCallback(() => {
    setLoading(true);
    listUsers()
      .then(setRows)
      .catch((e) => message.error(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleAdmin = async (row: AdminUserRow, isAdmin: boolean) => {
    try {
      await updateUser(row.id, { isAdmin });
      message.success(isAdmin ? "已设为管理员" : "已撤销管理员");
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    try {
      const { password } = await form.validateFields();
      await updateUser(resetTarget.id, { password });
      message.success(`已重置 ${resetTarget.username} 的密码`);
      setResetTarget(null);
      form.resetFields();
    } catch {
      // 校验失败或请求失败：validateFields 抛错时无需提示（表单已标红）
    }
  };

  const handleDelete = async (row: AdminUserRow) => {
    try {
      await deleteUser(row.id);
      message.success(`已删除用户 ${row.username} 及其全部数据`);
      load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <div>
      <Table<AdminUserRow>
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "ID", dataIndex: "id", width: 70 },
          { title: "用户名", dataIndex: "username" },
          {
            title: "管理员",
            dataIndex: "isAdmin",
            width: 100,
            render: (value: boolean, row) => (
              <Switch
                checked={value}
                disabled={row.id === currentUser?.id}
                onChange={(checked) => toggleAdmin(row, checked)}
              />
            ),
          },
          { title: "试卷数", dataIndex: "examCount", width: 90 },
          { title: "错题数", dataIndex: "wrongQuestionCount", width: 90 },
          {
            title: "注册时间",
            dataIndex: "createdAt",
            width: 190,
            render: formatDate,
          },
          {
            title: "操作",
            key: "actions",
            width: 200,
            render: (_, row) => (
              <Space>
                <Button
                  size="small"
                  icon={<KeyOutlined />}
                  onClick={() => setResetTarget(row)}
                >
                  重置密码
                </Button>
                <Popconfirm
                  title="删除用户"
                  description="将同时删除其全部试卷、错题与图片，不可恢复。"
                  okText="删除"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDelete(row)}
                  disabled={row.id === currentUser?.id}
                >
                  <Button
                    size="small"
                    danger
                    disabled={row.id === currentUser?.id}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={`重置密码：${resetTarget?.username ?? ""}`}
        open={resetTarget !== null}
        onOk={handleResetPassword}
        onCancel={() => {
          setResetTarget(null);
          form.resetFields();
        }}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
