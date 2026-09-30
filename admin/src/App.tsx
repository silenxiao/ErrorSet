import { Spin } from "antd";
import { Button, Result } from "antd";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./components/AdminLayout";
import { clearSession, getToken, me } from "./api/auth";
import Login from "./pages/Login";

// 路由级代码分割：各管理页按需加载，登录页保持 eager 保证首屏
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Exams = lazy(() => import("./pages/Exams"));
const Feedbacks = lazy(() => import("./pages/Feedbacks"));
const Models = lazy(() => import("./pages/Models"));
const Users = lazy(() => import("./pages/Users"));
const WrongQuestions = lazy(() => import("./pages/WrongQuestions"));

type GuardState = "loading" | "ok" | "denied" | "anonymous";

/** 登录且具有管理员身份才放行；权限以 /auth/me 实时校验为准。 */
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GuardState>(() =>
    getToken() ? "loading" : "anonymous",
  );

  useEffect(() => {
    if (!getToken()) return;
    me().then(
      (user) => setState(user.isAdmin ? "ok" : "denied"),
      () => {
        clearSession();
        setState("anonymous");
      },
    );
  }, []);

  if (state === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }
  if (state === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  if (state === "denied") {
    return (
      <Result
        status="403"
        title="403"
        subTitle="该账号没有管理员权限"
        extra={
          <Button
            type="primary"
            onClick={() => {
              clearSession();
              window.location.assign("/login");
            }}
          >
            重新登录
          </Button>
        }
      />
    );
  }
  return children;
}

export default function App() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Spin size="large" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/models" element={<Models />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/wrong-questions" element={<WrongQuestions />} />
          <Route path="/feedbacks" element={<Feedbacks />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
