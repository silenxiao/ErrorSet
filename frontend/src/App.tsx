import { SettingOutlined } from "@ant-design/icons";
import { Button, Layout, Menu } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import SettingsModal from "./components/SettingsModal";
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

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectedKey = location.pathname.startsWith("/wrong-questions")
    ? "wrong-questions"
    : "upload";

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
        }}
      >
        <div
          style={{ color: "#fff", fontSize: 18, whiteSpace: "nowrap" }}
        >
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
        <Button
          type="text"
          icon={<SettingOutlined />}
          style={{ color: "#fff", fontSize: 16 }}
          onClick={() => setSettingsOpen(true)}
        >
          模型管理
        </Button>
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
