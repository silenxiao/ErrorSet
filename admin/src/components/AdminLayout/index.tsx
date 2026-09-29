import {
  BookOutlined,
  DashboardOutlined,
  FileImageOutlined,
  LogoutOutlined,
  MessageOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Layout, Menu, Space, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { clearSession, getCurrentUser } from "../../api/auth";

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: "/", icon: <DashboardOutlined />, label: "概览" },
  { key: "/users", icon: <TeamOutlined />, label: "用户" },
  { key: "/models", icon: <ThunderboltOutlined />, label: "模型设置" },
  { key: "/exams", icon: <FileImageOutlined />, label: "试卷" },
  { key: "/wrong-questions", icon: <BookOutlined />, label: "错题" },
  { key: "/feedbacks", icon: <MessageOutlined />, label: "留言" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getCurrentUser();
  const selectedKey = `/${location.pathname.split("/")[1] ?? ""}`;

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="dark" width={200}>
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: 1,
          }}
        >
          错题库管理后台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            borderBottom: "1px solid #eef0f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            height: 56,
            lineHeight: "56px",
          }}
        >
          <Typography.Text type="secondary">系统管理</Typography.Text>
          <Space>
            <Typography.Text>{user?.username}</Typography.Text>
            <Button
              size="small"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
            >
              退出登录
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
