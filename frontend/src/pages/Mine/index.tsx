import {
  LockOutlined,
  LogoutOutlined,
  MessageOutlined,
  ReadOutlined,
  RightOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Button, Card, Form, Input, Modal, Select, Space, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  clearSession,
  getMe,
  getUsername,
  updateGrade,
  updatePassword,
} from "../../api/auth";
import SettingsModal from "../../components/SettingsModal";
import { GRADE_OPTIONS } from "../../utils/grade";

/** 「我的」页面（与小程序端一致）：账号信息 + 年级修改 + 模型管理入口 + 退出登录。 */
export default function MinePage() {
  const navigate = useNavigate();
  const username = getUsername() ?? "未登录";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [grade, setGrade] = useState<string | undefined>(undefined);
  const [savingGrade, setSavingGrade] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdForm] = Form.useForm();

  useEffect(() => {
    getMe()
      .then((user) => setGrade(user.grade))
      .catch(() => {});
  }, []);

  const handleGradeChange = async (value: string) => {
    setSavingGrade(true);
    try {
      const user = await updateGrade(value);
      setGrade(user.grade);
      message.success("年级已更新，首次上传试卷将默认使用该年级");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingGrade(false);
    }
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
      // 改密已撤销旧登录令牌，清理本地会话并重新登录
      clearSession();
      setPwdOpen(false);
      pwdForm.resetFields();
      message.success("密码已修改，请用新密码重新登录");
      navigate("/login", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "修改失败");
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogout = () => {
    Modal.confirm({
      title: "退出登录",
      content: "确定退出当前账号吗？",
      okText: "退出",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: () => {
        clearSession();
        navigate("/login", { replace: true });
        message.success("已退出登录");
      },
    });
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "36px 24px 24px",
          borderRadius: "var(--radius-card)",
          background: "linear-gradient(90deg, var(--primary-dark) 0%, var(--primary) 100%)",
          color: "#fff",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.25)",
            fontSize: 24,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {username[0] || "?"}
        </span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{username}</div>
          <div style={{ color: "rgba(255, 255, 255, 0.75)", marginTop: 2 }}>
            AI 错题本
          </div>
        </div>
      </div>

      <Card style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }}>
        <div className="menu-row-static">
          <ReadOutlined style={{ fontSize: 18, color: "var(--primary)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-1)" }}>年级</div>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
              首次上传试卷时默认使用该年级
            </div>
          </div>
          <Space>
            <Select
              value={grade}
              loading={savingGrade}
              placeholder="加载中…"
              options={GRADE_OPTIONS.map((value) => ({ value, label: value }))}
              onChange={(value) => void handleGradeChange(value)}
              style={{ width: 110 }}
            />
          </Space>
        </div>
        <div
          className="menu-row"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingOutlined style={{ fontSize: 18, color: "var(--primary)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-1)" }}>模型管理</div>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
              配置识别使用的 AI 模型
            </div>
          </div>
          <RightOutlined style={{ color: "var(--text-3)", fontSize: 12 }} />
        </div>
        <div
          className="menu-row"
          onClick={() => navigate("/feedback")}
        >
          <MessageOutlined style={{ fontSize: 18, color: "var(--primary)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-1)" }}>留言板</div>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
              有问题或建议向我们留言
            </div>
          </div>
          <RightOutlined style={{ color: "var(--text-3)", fontSize: 12 }} />
        </div>
        <div
          className="menu-row"
          style={{ borderBottom: "none" }}
          onClick={() => {
            pwdForm.resetFields();
            setPwdOpen(true);
          }}
        >
          <LockOutlined style={{ fontSize: 18, color: "var(--primary)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-1)" }}>修改密码</div>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>
              修改后需用新密码重新登录
            </div>
          </div>
          <RightOutlined style={{ color: "var(--text-3)", fontSize: 12 }} />
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Button
          danger
          block
          icon={<LogoutOutlined />}
          onClick={handleLogout}
        >
          退出登录
        </Button>
      </Card>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Modal
        title="修改密码"
        open={pwdOpen}
        onCancel={() => setPwdOpen(false)}
        onOk={() => void handleChangePassword()}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={savingPwd}
        destroyOnClose
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
    </div>
  );
}
