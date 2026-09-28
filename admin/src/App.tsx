import { Spin } from "antd";
import { Button, Result } from "antd";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./components/AdminLayout";
import { clearSession, getToken, me } from "./api/auth";
import Dashboard from "./pages/Dashboard";
import Exams from "./pages/Exams";
import Feedbacks from "./pages/Feedbacks";
import Login from "./pages/Login";
import Users from "./pages/Users";
import WrongQuestions from "./pages/WrongQuestions";

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
        <Route path="/exams" element={<Exams />} />
        <Route path="/wrong-questions" element={<WrongQuestions />} />
        <Route path="/feedbacks" element={<Feedbacks />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
