import { BookOutlined } from "@ant-design/icons";
import { Layout, Spin } from "antd";
import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { getToken } from "./api/auth";

// 路由级代码分割：识别/错题库等重组件（KaTeX、marked）只进各自 chunk
const FeedbackPage = lazy(() => import("./pages/Feedback"));
const LoginPage = lazy(() => import("./pages/Login"));
const MinePage = lazy(() => import("./pages/Mine"));
const QuestionBankPage = lazy(() => import("./pages/QuestionBank"));
const RecognitionPage = lazy(() => import("./pages/Recognition"));
const UploadPage = lazy(() => import("./pages/Upload"));

const { Header, Content } = Layout;

const NAV_ITEMS = [
  { key: "upload", label: "上传试卷", path: "/" },
  { key: "wrong-questions", label: "错题库", path: "/wrong-questions" },
  { key: "mine", label: "我的", path: "/mine" },
];

/** 懒加载 chunk 加载期间的占位 */
function PageFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
      <Spin size="large" />
    </div>
  );
}

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
  const selectedKey = location.pathname.startsWith("/wrong-questions")
    ? "wrong-questions"
    : location.pathname.startsWith("/mine") ||
        location.pathname.startsWith("/feedback")
      ? "mine"
      : "upload";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <ScrollToTop />
      <Header
        className="app-header"
        style={{
          display: "flex",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "var(--primary-dark)",
          boxShadow: "0 2px 8px rgba(14, 66, 184, 0.25)",
        }}
      >
        <div
          className="app-brand"
          style={{
            color: "#fff",
            fontSize: 17,
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
              background: "rgba(255, 255, 255, 0.16)",
              fontSize: 16,
            }}
          >
            <BookOutlined />
          </span>
          <span className="app-brand-title">AI 试卷识别与错题库</span>
        </div>
        <nav className="nav-tabs">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-tab${selectedKey === item.key ? " nav-tab-active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </Header>
      <Content style={{ padding: 24 }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<UploadPage />} />
              <Route path="/exams/:examId" element={<RecognitionPage />} />
              <Route path="/wrong-questions" element={<QuestionBankPage />} />
              <Route path="/mine" element={<MinePage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
  );
}
