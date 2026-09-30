import {
  BookOutlined,
  DashboardOutlined,
  FileImageOutlined,
  LockOutlined,
  LogoutOutlined,
  MessageOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Form, Input, Layout, Menu, Modal, Space, Typography, message } from "antd";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { clearSession, getCurrentUser, updatePassword } from "../../api/auth";

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: "概览" },
  { key: "/users", icon: <TeamOutlined />, label: "用户" },
  { key: "/models", icon: <ThunderboltOutlined />, label: "模型设置" },
  { key: "/exams", icon: <FileImageOutlined />, label: "试卷" },
  { key: "/wrong-questions", icon: <BookOutlined />, label: "错题" },
  { key: "/feedbacks", icon: <MessageOutlined />, label: "留言" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const selectedKey = `/${location.pathname.split("/")[1] ?? ""}`;
  const [pwdOpen, setPwdOpen] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdForm] = Form.useForm();

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  const handleChangePassword = async () => {
    let values: { oldPassword: string; newPassword: string; confirmPassword: string };
    try {
      values = await pwdForm.validateFields();
    } catch {
      return; // 表单校验失败，antd 已在字段上提示
    }
    setSavingPwd(true);
    try {
      await updatePassword(values.oldPassword, values.newPassword, values.confirmPassword);
      // 旧 token 仍然有效，但改密后要求重新登录更符合用户预期
      clearSession();
      setPwdOpen(false);
      pwdForm.resetFields();
      message.success("密码已修改，请用新密码重新登录");
      navigate("/login", { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "修改失败");
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="dark" width={200}>
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          错题库管理后台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            borderBottom: "1px solid #eef0f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            height: 56,
            lineHeight: "56px",
          }}
        >
          <Typography.Text type="secondary">系统管理</Typography.Text>
          <Space>
            <Typography.Text>{user?.username}</Typography.Text>
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => {
                pwdForm.resetFields();
                setPwdOpen(true);
              }}
            >
              修改密码
            </Button>
            <Button
              size="small"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>

      <Modal
        title="修改密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => void handleChangePassword()}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={savingPwd}
        destroyOnClose
        width={420}
      >
        <Form form={pwdForm} layout="vertical" requiredMark={false}>
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: "请输入原密码" }]}
          >
            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              { min: 6, message: "新密码至少 6 位" },
              { max: 128, message: "新密码不能超过 128 个字符" },
            ]}
          >
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue("newPassword") === value
                    ? Promise.resolve()
                    : Promise.reject(new Error("两次输入的新密码不一致")),
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
