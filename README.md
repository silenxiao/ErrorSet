# AI 试卷识别与错题库系统

上传试卷/作业照片，通过两阶段 Vision API 识别全部题目（含大题/小题），
人工检查并调整 bbox 后触发二次识别，最终存入错题库。

完整设计见 [PROJECT_SPEC.md](./PROJECT_SPEC.md)。

## 技术栈

- 前端：React + TypeScript + Vite + Ant Design + SVG + KaTeX
- 后端：Python 3.12+ / FastAPI / SQLAlchemy / SQLite / Pillow
- AI：第三方 Vision API（OpenAI / Qwen / Gemini，统一 Provider 接口）

## 目录结构

```text
frontend/   Web 前端
backend/    FastAPI 后端
tests/      测试（backend / frontend）
```

## 快速开始

### 后端

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp ../.env.example ../.env   # 填入 API Key
uvicorn app.main:app --reload
```

服务默认运行在 http://127.0.0.1:8000 ，API 文档在 http://127.0.0.1:8000/docs 。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 http://localhost:5173 ，`/api` 请求代理到后端 8000 端口。

## 测试

```bash
# 后端
cd backend && pytest ../tests/backend

# 前端
cd frontend && npm test
```

## MVP 流程（PROJECT_SPEC.md §41）

```text
上传（uploaded）
  → Global Vision 整页识别（global_processing）
  → awaiting_review：人工检查 / 调整 bbox（逐题保存）
  → 点击确认（POST /exams/{id}/confirm）触发二次识别（local_processing）
  → completed：可手动加入错题库
```
