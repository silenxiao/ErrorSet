import {
  LogoutOutlined,
  MessageOutlined,
  RightOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Button, Card, Modal, message } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { clearSession, getUsername } from "../../api/auth";
import SettingsModal from "../../components/SettingsModal";

/** 「我的」页面（与小程序端一致）：账号信息 + 模型管理入口 + 退出登录。 */
export default function MinePage() {
  const navigate = useNavigate();
  const username = getUsername() ?? "未登录";
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          borderRadius: 12,
          background: "linear-gradient(90deg, #10265c 0%, #1677ff 100%)",
          color: "#fff",
          boxShadow: "0 2px 8px rgba(16, 38, 92, 0.25)",
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
        <div
          onClick={() => setSettingsOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 16px",
            cursor: "pointer",
            borderBottom: "1px solid #f0f0f0",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9f9")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <SettingOutlined style={{ fontSize: 18, color: "#1677ff" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "#1f2329" }}>模型管理</div>
            <div style={{ color: "#999", fontSize: 12, marginTop: 2 }}>
              配置识别使用的 AI 模型
            </div>
          </div>
          <RightOutlined style={{ color: "#a9aeb8", fontSize: 12 }} />
        </div>
        <div
          onClick={() => navigate("/feedback")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 16px",
            cursor: "pointer",
            borderBottom: "1px solid #f0f0f0",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f9f9f9")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <MessageOutlined style={{ fontSize: 18, color: "#1677ff" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "#1f2329" }}>留言板</div>
            <div style={{ color: "#999", fontSize: 12, marginTop: 2 }}>
              有问题或建议向我们留言
            </div>
          </div>
          <RightOutlined style={{ color: "#a9aeb8", fontSize: 12 }} />
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
