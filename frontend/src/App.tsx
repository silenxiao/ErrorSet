import { SettingOutlined } from "@ant-design/icons";
import { Button, Layout, Menu } from "antd";
import { useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import SettingsModal from "./components/SettingsModal";
import QuestionBankPage from "./pages/QuestionBank";
import RecognitionPage from "./pages/Recognition";
import UploadPage from "./pages/Upload";

const { Header, Content } = Layout;

export default function App() {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{ color: "#fff", fontSize: 18, whiteSpace: "nowrap" }}
        >
          AI 试卷识别与错题库
        </div>
        <Menu
          theme="dark"
          mode="horizontal"
          style={{ flex: 1, minWidth: 0 }}
          defaultSelectedKeys={["upload"]}
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
          设置
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
