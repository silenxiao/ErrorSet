import {
  LogoutOutlined,
  MessageOutlined,
  ReadOutlined,
  RightOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Button, Card, Modal, Select, Space, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { clearSession, getMe, getUsername, updateGrade } from "../../api/auth";
import SettingsModal from "../../components/SettingsModal";
import { GRADE_OPTIONS } from "../../utils/grade";

/** 「我的」页面（与小程序端一致）：账号信息 + 年级修改 + 模型管理入口 + 退出登录。 */
export default function MinePage() {
  const navigate = useNavigate();
  const username = getUsername() ?? "未登录";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [grade, setGrade] = useState<string | undefined>(undefined);
  const [savingGrade, setSavingGrade] = useState(false);

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
          style={{ borderBottom: "none" }}
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
    </div>
  );
}
