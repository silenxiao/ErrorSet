import { LogoutOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Layout, Menu, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { clearSession, getToken, getUsername } from "./api/auth";
import SettingsModal from "./components/SettingsModal";
import LoginPage from "./pages/Login";
import QuestionBankPage from "./pages/QuestionBank";
import RecognitionPage from "./pages/Recognition";
import UploadPage from "./pages/Upload";

const { Header, Content } = Layout;

/** 路由变化时把页面滚回顶部（菜单跳转、"打开"进入识别页等） */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** 路由守卫：未登录一律跳登录页 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedKey = location.pathname.startsWith("/wrong-questions")
    ? "wrong-questions"
    : "upload";

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <ScrollToTop />
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "linear-gradient(90deg, #10265c 0%, #1677ff 100%)",
          boxShadow: "0 2px 8px rgba(16, 38, 92, 0.25)",
        }}
      >
        <div
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: 600,
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.18)",
              fontSize: 17,
            }}
          >
            📘
          </span>
          AI 试卷识别与错题库
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          style={{ flex: 1, minWidth: 0 }}
          selectedKeys={[selectedKey]}
          items={[
            { key: "upload", label: "上传试卷" },
            { key: "wrong-questions", label: "错题库" },
          ]}
          onClick={({ key }) =>
            navigate(key === "upload" ? "/" : `/${key}`)
          }
        />
        <span style={{ color: "rgba(255, 255, 255, 0.85)", whiteSpace: "nowrap" }}>
          {getUsername() ?? ""}
        </span>
        <Button
          type="text"
          icon={<SettingOutlined />}
          style={{ color: "#fff", fontSize: 15 }}
          onClick={() => setSettingsOpen(true)}
        >
          模型管理
        </Button>
        <Tooltip title="退出登录">
          <Button
            type="text"
            icon={<LogoutOutlined />}
            style={{ color: "#fff" }}
            onClick={handleLogout}
          />
        </Tooltip>
      </Header>
      <Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/exams/:examId" element={<RecognitionPage />} />
          <Route path="/wrong-questions" element={<QuestionBankPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Content>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
