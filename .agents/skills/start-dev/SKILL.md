---
name: start-dev
description: 启动 ErrorSet 本地开发三件套：backend（FastAPI :8000）、frontend（Web 前端 :5173）、admin（管理后台 :5174）。只要用户提到启动/跑起本地服务、dev server、起后端/前端/管理后台，或说"把服务跑起来"，就用这个技能——即使没有说全三个服务的名字。
---

# 启动本地开发服务

在仓库根目录 `/Users/xiaohui/Documents/Hanry/ErrorSet` 下，用后台任务依次启动三个服务。

## 启动顺序与命令

先启动 backend（两个前端都把 `/api` 代理到 8000 端口），再用三个并行的后台 Bash 启动：

1. **backend**（后台）：
   ```bash
   cd /Users/xiaohui/Documents/Hanry/ErrorSet/backend && .venv/bin/uvicorn app.main:app --reload
   ```
   识别 worker 随应用内置启动，不需要单独起进程。

2. **frontend**（后台）：
   ```bash
   cd /Users/xiaohui/Documents/Hanry/ErrorSet/frontend && npm run dev
   ```

3. **admin**（后台）：
   ```bash
   cd /Users/xiaohui/Documents/Hanry/ErrorSet/admin && npm run dev
   ```

所有命令必须用 Bash 的 `run_in_background: true`，不要阻塞等待。依赖（.venv、node_modules）已装好，不要重复安装。

## 启动后验证

- 等几秒后 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs` 应返回 200；5173/5174 用同样方式探测首页。
- 汇报三个地址：后端 http://127.0.0.1:8000 （API 文档 /docs）、Web 前端 http://localhost:5173 、管理后台 http://localhost:5174 。
- 某个服务启动失败时，读它的后台输出定位原因（常见：8000 端口被旧进程占用，`lsof -ti:8000 | xargs kill` 后重启）。

## 注意事项

- 后端代码改动后 uvicorn 的 `--reload` 会自动重载；若发现改动未生效（新路由 404），手动重启 backend 后台任务。
- 用户只要求启动其中一个服务时，只启动那一个，但提醒它依赖 backend 是否已在运行。
