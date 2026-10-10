# ErrorSet 部署说明

本文档覆盖服务端（后端 + Web 前端 + 管理后台）的 Docker Compose 部署，以及微信小程序、App 的发布流程。

开发环境（本机跑 `uvicorn` + `vite`）见 [README.md](README.md)，不在本文范围。

---

## 一、整体架构

```
浏览器 / 小程序 / App
        │
        ▼
┌───────────────────────────── 服务器 ─────────────────────────────┐
│                                                                  │
│  ┌── web 容器 (nginx) ──┐   ┌── admin 容器 (nginx) ──┐           │
│  │  宿主端口 80          │   │  宿主端口 8081          │           │
│  │  托管 Web 前端 dist   │   │  托管管理后台 dist      │           │
│  │  /api /files ─────┐  │   │  /api /files ────┐      │           │
│  └───────────────────┼──┘   └──────────────────┼──────┘           │
│                      ▼                         ▼                  │
│           ┌──── backend 容器 (uvicorn, 仅容器网络内) ────┐         │
│           │  FastAPI + 识别 worker（单进程）              │        │
│           └──────────────────┬─────────────────────────┘         │
│                              ▼                                   │
│                 ./data/  ← 数据卷：SQLite + 全部图片              │
└──────────────────────────────────────────────────────────────────┘
```

| 入口 | 地址 | 说明 |
|---|---|---|
| Web 前端 | `http://服务器IP/` | 教师端错题库 |
| 管理后台 | `http://服务器IP:8081/` | 用户/试卷/留言管理 |
| 后端 API | 仅容器网络内 | 由 nginx 反代，不直接暴露 |
| Swagger 文档 | 默认不对外 | 如需访问，取消 docker-compose.yml 中 `127.0.0.1:8000` 端口映射注释后访问 `http://127.0.0.1:8000/docs` |

关键设计：

- 两个前端（`frontend/`、`admin/`）代码里全部用相对路径请求 `/api` 和 `/files`，由各自的 nginx 容器**同源反代**到 backend 容器，因此前端代码无需任何修改、无需配置 CORS。
- 后端识别 worker 运行在进程内，**必须单进程运行**，所以 backend 容器固定单 uvicorn 进程，不能加 `--workers` 或多副本。
- 所有持久化数据（SQLite 数据库 + 上传/识别图片）都在宿主机 `./data/` 目录，备份、迁移只需拷贝该目录。

Compose 使用专用网络，默认 `172.30.86.0/24`：网关 `.1`、backend `.2`、web `.3`、admin `.4`。部署脚本每次将 `TRUSTED_PROXY_CIDRS` 设置为网关/web/admin 的三个 `/32` 地址，容器重建不会改变信任地址。若与 VPN/宿主网络冲突，先在 `.env` 修改 `PROXY_NETWORK_PREFIX`（前三段，如 `172.30.87`）。勿将无关或不可信容器接入此网络；自定义代理拓扑需另行调整脚本的信任边界。

后端使用 `--no-proxy-headers`，由应用统一校验转发链。宿主 nginx 覆盖 `X-Forwarded-For` 为 `$remote_addr`，容器 nginx 追加连接地址。上线时验证不同客户端未共用登录限流额度。

本次安全升级会为存量账号生成独立登录身份，旧登录令牌失效，用户需重新登录。
后端启动时会事务化迁移旧用户/题目表为 `AUTOINCREMENT`，保留数据/索引并跨过历史数据引用的已删除 ID。

## 二、服务器要求

- **系统**：Ubuntu 22.04+ / Debian 12（其他 x86_64 Linux 只要装好 Docker 也可以）
- **配置**：1 核 2G 起步（图片预处理 + AI 识别是内存峰值），磁盘 20G 起（图片随使用量增长）
- **端口**：开放 `80`（Web）和 `8081`（管理后台）
- **软件**：Docker + Compose 插件（部署脚本会自动安装）

## 三、快速部署（三步）

```bash
# 1. 把代码上传到服务器（二选一）
git clone <你的仓库地址> errorset && cd errorset
# 或在本机执行（排除不需要的目录，速度快很多）：
rsync -avz --exclude node_modules --exclude .git --exclude '*/dist' --exclude .env --exclude .env.local --exclude '.env.*.local' --exclude data --exclude backups --exclude logs --exclude .venv --exclude .agents \
    ./ user@服务器IP:/opt/errorset

# 2. 在服务器上执行一键部署脚本
cd /opt/errorset
bash deploy/setup_server.sh

# 3. 浏览器访问
#    Web 前端    http://服务器IP/
#    管理后台    http://服务器IP:8081/
#    初始管理员  见 .env 的 SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD（仅空库创建）
```

脚本会自动完成：安装 Docker（如缺失）→ 生成 `.env`（含随机 `JWT_SECRET` 和管理员密码，权限 600）→ 构建镜像 → 启动三个容器 → 健康检查。**脚本幂等，重复执行即为"更新部署"**。

> ⚠️ 如果 `.env` 还没填 AI API Key，试卷识别功能不可用。编辑 `.env` 填入后重跑 `bash deploy/setup_server.sh` 即可（无需删容器）。

### Web 是否需要重新编译

**首次从源码部署到外网，需要生产构建；部署脚本会自动完成，不需要先在本机手动编译。** `frontend/Dockerfile` 在构建镜像时执行 `npm ci` 和 `npm run build`（`tsc -b && vite build`），再将生成的 `dist/` 放入 nginx 镜像。管理后台 `admin/` 使用同样的流程。本机的 `dist/` 不会参与 Docker 构建，也无需上传；开发环境的 `npm run dev` 不能替代生产构建。

| 场景 | 是否需要重新构建 Web |
|---|---|
| 首次从源码部署，或修改了前端源码、依赖、构建配置 | **需要**，通过部署脚本或下方命令构建 |
| 修改 `frontend/nginx.conf` | **需要重建镜像并重建容器**，让镜像包含新配置 |
| 同一版本已构建的镜像迁移到外网服务器 | **无需重新编译**，可复用该镜像 |
| 仅更换公网 IP、域名、HTTPS 证书或宿主 nginx 配置 | **无需重新编译**，按第六节配置入口即可 |
| 仅修改后端 `.env` 中的模型、API Key 等运行配置 | **无需重新编译 Web**，按第四节让后端配置生效 |

Web 请求使用同源相对路径 `/api` 和 `/files`，没有把本机后端地址写入生产构建。`frontend/vite.config.ts` 中的 `127.0.0.1:8000` 只用于开发服务器代理；生产环境由 `frontend/nginx.conf` 反代到 `backend:8000`，不用为了外网访问把它改为公网 IP。

**操作步骤（在服务器仓库根目录执行）：**

1. 首次部署：按上面的快速部署步骤上传源码，然后运行 `bash deploy/setup_server.sh`；使用域名时运行 `bash deploy/setup_server.sh --with-domain example.com`。脚本自动构建 Web、管理后台和后端镜像并启动服务。
2. 常规版本更新：运行 `bash deploy/update.sh`，自动备份、拉取代码并重新构建部署。
3. 已完成首次部署、后端正常运行，且此次仅修改 Web 时：先将最新前端源码同步到服务器，再执行：

   ```bash
   # 构建成功后才替换 Web 容器；不更新后端及管理后台
   docker compose build web
   docker compose up -d --no-deps web

   # 检查容器状态与日志
   docker compose ps web
   docker compose logs --tail=50 web
   ```

   若同时修改了管理后台，改为 `docker compose build web admin` 和 `docker compose up -d --no-deps web admin`。涉及后端/API 变更时使用完整版本更新流程，保持客户端与后端版本一致。仅执行 `docker compose restart web` 不会编译源码，也不会应用新镜像。
4. 访问公网地址（如 `https://example.com/`），检查页面、登录、图片加载及刷新前端路由是否正常。若仍显示旧页面，强制刷新浏览器；如有 CDN，清理对应缓存。

## 四、配置说明（.env）

配置文件为仓库根目录 `.env`（模板见 [.env.example](.env.example)），首次部署由脚本自动生成：

| 变量 | 说明 | 部署时需要改吗 |
|---|---|---|
| `GLOBAL_PROVIDER` / `GLOBAL_MODEL` | 试卷识别用的视觉模型（如 `qwen` / `qwen-vl-max`） | 按需 |
| `LOCAL_PROVIDER` / `LOCAL_MODEL` | 文本类模型（如 `openai` / `gpt-4o-mini`） | 按需 |
| `QWEN_API_KEY` 等 5 个 KEY | 各家 AI 服务密钥，至少填识别所用的一家 | **必填** |
| `JWT_SECRET` | 登录令牌签名密钥 | 脚本已自动生成随机值，**不要用默认值** |
| `JWT_EXPIRE_DAYS` | 登录有效期（天），默认 30 | 按需 |
| `WEB_PUBLISH` / `ADMIN_PUBLISH` | 容器端口发布方式（默认 `80:80` / `8081:80`） | **无需修改**（`--with-domain` 域名模式自动改为回环监听） |
| `CORS_ORIGINS` | 跨域白名单 | **无需修改**（nginx 同源反代，浏览器请求不跨域） |
| `DATABASE_URL` / `DATA_DIR` | 数据库与图片路径 | **不要修改**（docker-compose 已固定为容器内 `/data`） |

已有 `.env` 必须提供至少 32 字符的非默认 `JWT_SECRET`；空库首次启动前设置 12–72 字符的随机 `SEED_ADMIN_PASSWORD`（建议 ASCII）。修改 JWT 密钥会使已有令牌和签名媒体链接失效。修改种子密码不会修改已有账号。

改完 `.env` 后重跑 `bash deploy/setup_server.sh` 或执行 `docker compose up -d` 生效。

> 模型与 API Key 也可以在 Web 端「模型管理」页面在线配置（存数据库），二者取其一即可。

## 五、日常运维

### 管理后台新增系统模型返回 500

在服务器终端执行 `docker logs --since=10m --tail=200 errorset-backend` 查看异常，无需进入容器或项目目录。若日志包含 `NOT NULL constraint failed: model_profile.user_id`，说明旧数据库的用户归属列仍为非空，无法保存没有用户归属的系统模型。

本版本后端启动时会自动迁移该约束，保留已有模型、凭据、索引和触发器；迁移使用事务，失败会回滚。服务器更新到包含修复的代码后重新构建并启动后端即可，无需重新编译 Web 或管理后台，也不要删除数据库。

```bash
# 在服务器实际项目目录执行；将路径替换为实际位置
cd /opt/errorset
bash deploy/backup.sh
git pull --ff-only
docker compose build backend
docker compose up -d --no-deps backend
docker compose ps backend
docker compose logs --tail=100 backend
```

确认后端健康后，在管理后台重新添加系统模型。也可以直接执行 `bash deploy/update.sh` 完成完整版本更新（会重建所有服务）。

所有命令都在仓库根目录执行：

```bash
# 更新部署（一键：先自动备份 → 拉新代码 → 先构建镜像再重建容器（短暂停机））
bash deploy/update.sh

# 查看日志
docker compose logs -f backend   # 后端
docker compose logs -f web       # Web 前端（nginx）
docker compose logs -f admin     # 管理后台

# 重启 / 停止
docker compose restart backend
docker compose down              # 停止并移除容器（./data 数据保留）

# 备份（停止后端后打包 data/ + .env + Git 版本到 backups/，自动保留最近 10 份）
bash deploy/backup.sh
```

**为什么更新不影响数据**：所有持久化数据（SQLite `app.db` + 全部图片）都在宿主机 `./data/` 目录，经 bind mount 进入容器——重新构建镜像、删除/重建容器、`docker compose down` 不删除该目录；启动迁移会修改数据库。已有 `.env` 会保留密钥和模型配置，仅更新代理信任与旧端口配置。数据库结构变更（新表/新列）由后端启动时自动建表 + 轻量列迁移完成，存量数据自动兼容。`update.sh` 在此基础上先自动备份一份，若新版本迁移逻辑异常，可用 `backups/` 里最新一份回滚：

```bash
bash deploy/rollback.sh backups/errorset-<时间戳>-<PID>.tar.gz
```

自动回滚仅接受本项目生成的可信备份，要求备份包含 `deployment-revision.txt`。脚本先备份当前状态，再停服、切换到匹配的 Git 提交，将当前数据目录整体移到 `backups/pre-rollback-*`，恢复备份数据和配置后启动。回滚后的数据回到备份时刻；之后的新业务写入保留在移出的目录中，不会合并。确认恢复后由维护者清理保留目录。

回滚后处于 detached HEAD，后续更新前需切回部署分支。旧备份无版本记录时须手动确认对应代码版本。回滚到旧脚本版本后须检查端口与宿主 nginx 的兼容性。

**停机说明**：备份会停止运行中的后端，并在成功或失败退出时尝试恢复原运行状态；更新重建也会中断服务，不是无中断滚动更新。进行中的识别可能失败，排队任务会恢复。备份要求没有其他进程写入 data/。归档包含 SQLite WAL 和全部图片，权限受 umask 077 保护；建议定期异地备份。

自动更新/备份/回滚要求服务器有 Git checkout。上传代码不能替代克隆仓库。备份不包含宿主 nginx 配置和证书，迁移时需另行保存或重新配置。

**数据迁移到新服务器**：旧服务器执行 `bash deploy/backup.sh` → 将可信归档传到新服务器 → 准备与归档版本匹配的 Git checkout 和 Docker → 停服并移出已有 data/ 后恢复完整 data/ 与 .env → 检查网络/域名配置并执行部署脚本。不要先启动空库创建默认数据。

**数据库说明**：SQLite，位于 `./data/app.db`，启动时自动建表并做轻量列迁移，无需手工迁移。空用户表首次启动按 `.env` 的种子账号创建管理员（is_admin）。

已有用户的数据库不会因管理员缺失而自动提权。管理员被删除或降级后，需要由维护者显式恢复权限。
二次识别确认后立即持久化 `local_queued` 状态；排队任务在重启后自动重新入队，
实际执行中断的任务仍置为 `failed`，允许用户重试。此次增加了排队状态，后端与各客户端应同步更新。

## 六、HTTPS 与域名（小程序/App 上线前置条件）

微信小程序的 request/uploadFile/downloadFile 合法域名**必须是 HTTPS**，App 虽无强制但生产也建议 HTTPS。

### 一键配置（推荐）

前置条件：域名 A 记录已指向服务器公网 IP（`dig 域名` 能解析到），云厂商安全组放行 **80 和 443**。然后在服务器仓库根目录执行：

```bash
# Web 前端 + API 共用一个域名（推荐，前端同源反代，无需改 CORS）
bash deploy/setup_server.sh --with-domain example.com

# 如需管理后台也走域名：
bash deploy/setup_server.sh --with-domain cuoti-ai.cn  --admin-domain admin.cuoti-ai.cn
```

脚本会自动完成：安装 nginx + certbot → 把容器端口收回回环监听（写入 `.env` 的 `WEB_PUBLISH=127.0.0.1:8080:80`、`ADMIN_PUBLISH=127.0.0.1:8082:80`，不进 git，`update.sh` 拉新代码不影响）→ 渲染 [deploy/nginx-errorset.conf.template](deploy/nginx-errorset.conf.template) 为宿主机 nginx 站点配置 → certbot 签发证书并配置 443 跳转。完成后访问 `https://example.com/`。

说明：

- **幂等**，可重复执行；站点配置文件只在首次生成（certbot 之后追加的证书段不会被覆盖），已有证书不会重复签发，续期由 certbot 的 systemd timer 自动完成（`sudo certbot renew --dry-run` 可验证）。
- 证书签发失败（DNS 未生效 / 80 端口未放行）时脚本会提示原因并继续以 HTTP 运行，排除后手动重试：`sudo certbot --nginx -d example.com --redirect`
- 证书注册邮箱默认跳过（Let's Encrypt 到期前无法邮件提醒），如需要：`CERTBOT_EMAIL=you@example.com bash deploy/setup_server.sh --with-domain example.com`
- **IP 仍然可以访问**：站点配置里有一个 `default_server` 兜底块，`http://服务器IP/`（Web + API）和 `http://服务器IP:8081/`（管理后台）走 HTTP 照常可用——IP 签发不了 Let's Encrypt 证书，HTTPS 只有域名能走。若不希望 IP:8081 暴露公网，删除站点文件里 `listen 8081 default_server` 那个 server 块即可。
- 站点配置文件只在**首次生成**；已有配置会先备份，再迁移旧管理代理端口和旧的追加式转发头，保留证书段。新增/更换域名须另行维护 server_name 和证书。若服务器上已生成过旧版配置、想套用模板的新改动：`sudo rm /etc/nginx/sites-available/errorset /etc/nginx/sites-enabled/errorset` 后重跑脚本（certbot 已签的证书会自动复用）。
- 管理后台也可以**仅走域名**：传 `--admin-domain` 后可用 `https://admin.example.com`；仅用 SSH 隧道时须删除管理域名入口和 IP:8081 的整个 server 块，再使用 `ssh -L 8082:127.0.0.1:8082 服务器`。传 --admin-domain 本身不会关闭 IP:8081 入口。

### 手动配置（了解原理 / 特殊环境）

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# 站点配置可参考 deploy/nginx-errorset.conf.template：
#   example.com      → proxy_pass http://127.0.0.1:8080;   # Web + API（经 web 容器同源反代）
#   admin.example.com → proxy_pass http://127.0.0.1:8082;  # 管理后台（可选）
# 同时把 .env 里 WEB_PUBLISH/ADMIN_PUBLISH 设为回环监听（见上），docker compose up -d 生效
sudo certbot --nginx -d example.com -d admin.example.com
```

## 七、客户端发布

### 微信小程序（miniprogram/）

1. **改后端地址**：`miniprogram/config.js` 的 `BACKEND_BASE` 改为 `https://example.com`（第六章一键域名模式配好的 HTTPS 域名，Web 和 API 同源共用）。注意 `utils/api.js`、`utils/request.js`、`utils/upload.js`、`pages/bank/bank.js`、`pages/upload/upload.js` 里还有同值的 `127.0.0.1:8000` 兜底，需一并全局搜索替换。
2. **小程序后台配置合法域名**：微信公众平台 → 开发管理 → 开发设置 → 服务器域名，把 `https://example.com` 同时配到 **request / uploadFile / downloadFile** 合法域名（图片经 `/files` 下载）。
3. **appid**：在 `miniprogram/project.config.json`，换成自己的。
4. **上传发布**：微信开发者工具打开 `miniprogram/` → 上传 → 公众平台提交审核 → 发布。
5. 开发调试期可在开发者工具勾选「不校验合法域名」用 `http://` 局域网 IP 联调，但**真机预览和正式版必须 HTTPS 合法域名**。

### App（mobile/，React Native + Expo）

1. **改后端地址**：`mobile/src/api/config.ts` 的 `FALLBACK_BASE`，或打包前设置环境变量 `EXPO_PUBLIC_BACKEND_BASE=https://example.com`。
2. **打 Android APK**：
   ```bash
   cd mobile
   npx expo prebuild -p android --no-install
   cd android && ./gradlew assembleRelease
   # 产物 android/app/build/outputs/apk/release/app-release.apk
   ```
   ⚠️ 当前 release 包仍用 `debug.keystore` 签名，正式分发前请在 `android/app/build.gradle` 配置自己的签名 keystore。
3. **iOS**：`npx expo prebuild -p ios` 后用 Xcode 打开 `mobile/ios` 签名打包（需 Apple 开发者账号）。

## 八、上线验证

确认 Web/管理后台入口、HTTPS 证书、登录、图片上传/查看和识别正常，并查看后端启动迁移日志。当前健康检查仅访问 `/docs`，不覆盖完整业务链路或前端入口。宿主 nginx 管理代理使用回环 8082，公网入口使用 8081，两者分开避免端口冲突。

## 九、常见问题

| 问题 | 处理 |
|---|---|
| 80/8081 端口被占用 | 改 `.env` 的完整 WEB_PUBLISH/ADMIN_PUBLISH 映射，并同步宿主 nginx 代理端口 |
| 境内服务器构建镜像慢 | 给 `backend/Dockerfile` 的 pip 加 `-i https://pypi.tuna.tsinghua.edu.cn/simple`；`frontend`、`admin` 的 `npm ci` 改为 `npm ci --registry=https://registry.npmmirror.com` |
| 后端起不来 / 健康检查不过 | `docker compose logs -f backend`；检查配置格式、数据库迁移和 `data/` 权限；缺 AI Key 通常只影响识别 |
| 图片/数据库写入失败 | 宿主机 `./data` 目录需对容器内进程（默认 root）可写，检查属主与挂载路径 |
| 为什么不能开多个后端副本 | 识别 worker 在进程内轮询任务，多副本会重复消费；确需扩展需先改造为独立 worker 进程 |
| 管理后台安全 | 8081 建议仅对可信 IP 开放（云安全组/防火墙），或经宿主 nginx 加 basic auth |
| 登录态失效 | JWT 默认 30 天有效，改 `JWT_EXPIRE_DAYS` 后需用户重新登录 |
