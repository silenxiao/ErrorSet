import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";

import { clearSession, login } from "../../api/auth";

interface LoginForm {
  username: string;
  password: string;
}

export default function Login() {
  const navigate = useNavigate();
  const [form] = Form.useForm<LoginForm>();

  const onFinish = async (values: LoginForm) => {
    try {
      const user = await login(values.username.trim(), values.password);
      if (!user.isAdmin) {
        clearSession();
        message.error("该账号没有管理员权限");
        return;
      }
      message.success("登录成功");
      navigate("/", { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #10265c 0%, #1677ff 100%)",
      }}
    >
      <Card style={{ width: 360, borderRadius: 12 }}>
        <Typography.Title level={4} style={{ textAlign: "center", marginBottom: 4 }}>
          错题库管理后台
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: "center", marginBottom: 24 }}
        >
          仅管理员账号可登录
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="username"
            rules={[{ required: true, message: "请输入用户名" }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large">
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
