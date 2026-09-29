import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Card, Form, Input, Select, message, Typography } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login, register } from "../../api/auth";
import { GRADE_OPTIONS } from "../../utils/grade";

/** 登录/注册双模式页：成功后写入 token 并进入主页。 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: {
    username: string;
    password: string;
    grade?: string;
  }) => {
    setLoading(true);
    try {
      const user =
        mode === "login"
          ? await login(values.username, values.password)
          : await register(values.username, values.password, values.grade ?? GRADE_OPTIONS[0]);
      message.success(`欢迎，${user.username}`);
      navigate("/", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    form.resetFields(["password", "confirm", "grade"]);
    setMode(mode === "login" ? "register" : "login");
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
      <Card style={{ width: 360, boxShadow: "0 8px 24px rgba(16, 38, 92, 0.35)" }}>
        <Typography.Title level={4} style={{ textAlign: "center", marginBottom: 4 }}>
          📘 AI 试卷识别与错题库
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: "center" }}>
          {mode === "login" ? "登录后查看你的错题库" : "注册一个新账号"}
        </Typography.Paragraph>
        <Form form={form} onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: "请输入用户名" },
              { max: 64, message: "用户名不超过 64 个字符" },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 6, message: "密码至少 6 位" },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          {mode === "register" && (
            <>
              <Form.Item
                name="confirm"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "请再次输入密码" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("password") === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error("两次输入的密码不一致"));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
              </Form.Item>
              <Form.Item
                name="grade"
                initialValue={GRADE_OPTIONS[0]}
                rules={[{ required: true, message: "请选择年级" }]}
              >
                <Select
                  placeholder="孩子所在年级"
                  options={GRADE_OPTIONS.map((value) => ({ value, label: value }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              {mode === "login" ? "登录" : "注册"}
            </Button>
          </Form.Item>
        </Form>
        <Button type="link" block onClick={switchMode}>
          {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
        </Button>
      </Card>
    </div>
  );
}
