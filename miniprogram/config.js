// 后端服务基础地址。
//
// 与网页版前端 vite 代理指向的 8000 端口一致（FastAPI 默认 http://127.0.0.1:8000）。
//
// 联调方式：
// 1) 微信开发者工具中，在「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」，
//    即可用 http://127.0.0.1:8000 在模拟器中联调本机后端。
// 2) 真机预览 / 发布时，需将此处改为可通过 HTTPS 访问的域名，并在小程序后台配置 request 合法域名。
//
// 注意：若后端部署在其他机器，请改为该机器的局域网 IP，例如 http://192.168.1.100:8000。
//const BACKEND_BASE = 'http://106.55.168.134';
//const BACKEND_BASE = 'https://cuoti-ai.cn';
const BACKEND_BASE = "http://192.168.0.20:8000";

module.exports = { BACKEND_BASE };
