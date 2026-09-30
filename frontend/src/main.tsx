import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";

import "@fontsource-variable/inter";
import "katex/dist/katex.min.css";
import "./index.css";

/** 三端统一设计令牌（规范）：教育蓝 #165DFF、低饱和、圆角 8、克制动画 */
const theme = {
  token: {
    colorPrimary: "#165DFF",
    colorInfo: "#165DFF",
    colorSuccess: "#00B42A",
    colorError: "#F53F3F",
    colorWarning: "#FF7D00",
    colorText: "#1D2129",
    colorTextSecondary: "#4E5969",
    colorTextTertiary: "#86909C",
    colorBorder: "#E5E6EB",
    colorBorderSecondary: "#E5E6EB",
    colorBgLayout: "#F7F8FA",
    colorBgContainer: "#FFFFFF",
    borderRadius: 8,
    lineHeight: 1.6,
    fontFamily:
      '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  },
  components: {
    Button: {
      // 规范：次要按钮白底蓝边；扁平无投影
      defaultColor: "#165DFF",
      defaultBorderColor: "#165DFF",
      defaultBg: "#FFFFFF",
      defaultShadow: "none",
      primaryShadow: "none",
    },
    Card: {
      bodyPadding: 16,
    },
    Table: {
      headerBg: "#F7F8FA",
      headerColor: "#4E5969",
      headerSplitColor: "transparent",
    },
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={theme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
