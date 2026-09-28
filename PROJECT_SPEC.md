# AI 试卷识别与错题库系统

## 1. 项目概述

开发一个基于 Web 的 AI 试卷/作业识别与错题管理系统。

用户上传试卷或作业照片后，系统通过第三方 Vision API 自动识别整张试卷中的所有独立题目，包括大题下面的所有小题，并提取：

- 题目编号
- 完整题干
- 选择题全部选项
- 数学公式 LaTeX
- 题目 bbox
- 题目中的插图、表格、几何图形等区域
- 识别置信度
- 后续错题相关信息

系统采用**两阶段 Vision 识别架构**：

```text
试卷图片
   ↓
第一阶段：Global Vision
   ↓
整页题目识别
   ↓
Question + BBox
   ↓
人工检查 / BBox 调整 / 确认
   ↓
Validator
   ↓
发现可疑题目
   ↓
Crop
   ↓
第二阶段：Local Vision
   ↓
局部 OCR / LaTeX / 内容纠正
   ↓
Merger
   ↓
最终题目
   ↓
错题库
```

---

# 2. MVP 技术原则

## 2.1 前端

使用 Web 前端：

- React
- TypeScript
- Vite
- Ant Design
- SVG
- KaTeX（LaTeX 公式渲染）
- Axios 或 Fetch

---

## 2.2 后端

使用：

- Python 3.12+
- FastAPI
- Pydantic
- SQLAlchemy
- SQLite
- httpx
- Pillow

---

## 2.3 AI

只使用第三方 Vision API。

第一阶段和第二阶段都通过统一的 Provider 接口调用。

MVP 不使用：

- 本地视觉模型
- Ollama
- oMLX
- 本地 LLM
- Redis
- Celery
- RabbitMQ
- PostgreSQL
- 向量数据库
- Kubernetes
- 微服务架构

---

# 3. 总体架构

```text
                    ┌─────────────────────┐
                    │      Web Frontend   │
                    │ React + TypeScript  │
                    └──────────┬──────────┘
                               │ HTTP
                               ↓
                    ┌─────────────────────┐
                    │      FastAPI        │
                    │      Backend        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ↓                ↓                ↓
        ┌──────────┐     ┌───────────┐    ┌───────────┐
        │ SQLite   │     │ Pipeline  │    │ File      │
        │          │     │           │    │ Storage   │
        └──────────┘     └─────┬─────┘    └───────────┘
                               │
                      ┌────────┴────────┐
                      ↓                 ↓
               Global Vision      Local Vision
                    API                API
```

---

# 4. 项目目录

```text
wrong-question/
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── exam.ts
│   │   │   └── question.ts
│   │   │
│   │   ├── components/
│   │   │   ├── ImageViewer/
│   │   │   ├── BoundingBox/
│   │   │   ├── QuestionList/
│   │   │   └── UploadPanel/
│   │   │
│   │   ├── pages/
│   │   │   ├── Upload/
│   │   │   ├── Recognition/
│   │   │   └── QuestionBank/
│   │   │
│   │   ├── hooks/
│   │   │   └── useRecognition.ts
│   │   │
│   │   ├── types/
│   │   │   ├── exam.ts
│   │   │   └── question.ts
│   │   │
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   │
│   │   ├── api/
│   │   │   ├── upload.py
│   │   │   ├── recognition.py
│   │   │   └── questions.py
│   │   │
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── logging.py
│   │   │   └── exceptions.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── common.py
│   │   │   ├── exam.py
│   │   │   ├── question.py
│   │   │   └── recognition.py
│   │   │
│   │   ├── pipeline/
│   │   │   ├── orchestrator.py
│   │   │   ├── preprocess.py
│   │   │   ├── global_recognition.py
│   │   │   ├── validator.py
│   │   │   ├── suspicious.py
│   │   │   ├── crop.py
│   │   │   ├── local_recognition.py
│   │   │   └── merger.py
│   │   │
│   │   ├── providers/
│   │   │   ├── base.py
│   │   │   ├── openai.py
│   │   │   ├── qwen.py
│   │   │   ├── gemini.py
│   │   │   └── factory.py
│   │   │
│   │   ├── prompts/
│   │   │   ├── global_question.py
│   │   │   └── local_question.py
│   │   │
│   │   ├── database/
│   │   │   ├── database.py
│   │   │   ├── models.py
│   │   │   └── repository.py
│   │   │
│   │   ├── services/
│   │   │   ├── recognition_service.py
│   │   │   └── question_service.py
│   │   │
│   │   └── workers/
│   │       └── recognition_worker.py
│   │
│   ├── data/
│   │   ├── originals/
│   │   ├── working/
│   │   ├── crops/
│   │   └── results/
│   │
│   └── pyproject.toml
│
├── tests/
│   ├── backend/
│   └── frontend/
│
├── .env
├── .env.example
├── .gitignore
├── README.md
└── PROJECT_SPEC.md
```

---

# 5. 核心业务流程

## 5.1 上传

用户上传：

- JPG
- JPEG
- PNG
- WebP

约束：

- 一张图片 = 一份试卷（MVP 只支持单页，多页支持见 §45）
- 文件大小不超过 10MB
- 超出格式或大小限制直接返回 4xx，不创建 Exam

接口：

```http
POST /api/v1/exams
```

使用 multipart/form-data。

返回：

```http
202 Accepted
```

```json
{
  "id": 123,
  "status": "uploaded"
}
```

---

## 5.2 预处理（Preprocess）

第一段识别开始前对原图执行：

- EXIF 方向校正（`Pillow.ImageOps.exif_transpose`），保证 bbox 坐标与页面显示方向一致
- 最长边缩放到不超过 2000px（等比缩放，只缩小不放大）
- 记录预处理后的实际宽高到 Exam 的 `width` / `height`

bbox 的 0～1000 归一化坐标统一相对预处理后的图片。

---

# 6. 异步任务机制与状态机

MVP 不引入 Redis、Celery、RabbitMQ。

使用 FastAPI BackgroundTasks 实现简单后台任务机制。

识别分**两段**执行，中间以人工确认为界：

## 6.1 第一段：上传后自动执行

```text
HTTP 上传
   ↓
保存原始图片
   ↓
创建 Exam（uploaded）
   ↓
创建 RecognitionTask
   ↓
立即返回 202
   ↓
后台：Preprocess + Global Vision
   ↓
Validator 校验入库（Question: pending_review）
   ↓
Exam 进入 awaiting_review，停止
```

第一段只负责整页识别和入库，**不会**自动进入二次识别。

## 6.2 第二段：人工确认后触发

用户在识别结果页检查、调整 bbox 后点击「确认」：

```http
POST /api/v1/exams/{exam_id}/confirm
```

```text
确认
   ↓
Validator 重新校验（使用确认后的最终 bbox）
   ↓
Suspicious 判定
   ↓
Crop → Local Vision → Merger
   ↓
Exam 进入 completed
```

## 6.3 状态机

Exam 状态：

```text
uploaded            已上传，未开始识别
global_processing   第一段识别中
awaiting_review     等待人工检查 / 调整 bbox / 确认
local_processing    第二段识别中
completed           全部完成
failed              失败（可通过重新识别重跑）
```

流转：

```text
uploaded → global_processing → awaiting_review → local_processing → completed
                    ↓                                                    ↑
                 failed ─────── 重新识别（re-recognize）──────────────────┘
```

任一阶段发生不可恢复错误进入 `failed`，错误信息记录在 RecognitionTask。

Question 状态：

```text
pending_review   Global 完成，等待人工确认
confirmed        用户已确认
correcting       二次识别进行中
completed        最终结果
failed           该题识别失败（回退使用 Global 结果）
```

流转：

```text
pending_review → confirmed → correcting → completed
                    ↓              ↓
                completed     failed（回退 Global 结果）
               （无可疑题目时直接完成）
```

无需二次识别的题目，确认后直接 `confirmed → completed`。

## 6.4 并发策略

MVP 单进程内顺序执行识别任务：同一时刻只运行一个 Exam 的识别任务，后续任务排队。

这样实现最简单，也天然规避了 Vision API 限流问题。

前端 MVP 使用轮询：

```text
每 1～2 秒
    ↓
GET /api/v1/exams/{exam_id}
```

未来可以升级：

- SSE
- WebSocket
- Redis
- Celery

但不属于 MVP。

---

# 7. 第一阶段：Global Vision

第一阶段 Vision API 负责分析整张试卷。

目标：

> 从整张图片中识别所有独立题目，包括大题下面的全部小题。

必须做到：

- 不遗漏题目
- 不把多个独立题目合并
- 正确识别大题和小题
- 识别选择题所有选项
- 识别数学公式
- 识别插图
- 排除学生手写内容
- 排除红笔批改内容

---

# 8. Question 数据

每一道独立题目：

```json
{
  "question_no": "3(1)",
  "parent_id": null,
  "text": "已知 $x^2-2x+1=0$，求 $x$ 的值。",
  "bbox": [120, 250, 880, 430],
  "ai_bbox": [125, 245, 870, 425],
  "bbox_source": "ai",
  "confidence": 0.96,
  "status": "pending_review",
  "illustrations": []
}
```

## 8.1 大题与小题

Question 使用扁平表 + `parent_id` 表达层级：

- 独立题目：`parent_id` 为空
- 大题下的小题：`parent_id` 指向所属大题的 Question 记录
- 大题本身也是一条 Question 记录，`text` 保存大题题干和共享材料（阅读材料、公共图表说明等），`bbox` 覆盖大题整体范围
- 小题只保存自己的题干和内容

## 8.2 question_no 格式

```text
独立题目：    "1"、"2"、"3"
大题：        "3"
大题下的小题： "3(1)"、"3(2)"、"3(3)"
```

---

# 9. Text 识别要求

`text` 必须是：

> 完整、干净、可读的印刷原文。

必须：

- 保留完整题干
- 保留所有选项
- 保留题目编号
- 保留必要的文字说明
- 数学公式使用 LaTeX
- 不包含学生手写答案
- 不包含草稿
- 不包含老师红笔批改
- 不包含与题目无关的页面内容

数学公式：

行内：

```text
$x^2 + 2x + 1$
```

独立公式：

```text
$$
x^2 + 2x + 1 = 0
$$
```

---

# 10. BBox 规范

统一：

```text
[x1, y1, x2, y2]
```

坐标范围：

```text
0～1000
```

相对于原始图片宽高归一化。

必须满足：

```text
0 <= x1 < x2 <= 1000
0 <= y1 < y2 <= 1000
```

bbox 必须覆盖：

```text
题号
+
题干
+
选项
+
题目必要内容
```

不应该主动包含：

- 学生手写答案
- 红笔批改
- 相邻题目

---

# 11. BBox 人工调整

BBox 手动调整属于 MVP 核心功能。

AI 自动识别后，用户必须可以在 Web 页面中检查并修改 bbox。

## 11.1 支持的操作

用户可以：

- 拖动整个 bbox
- 拖动左上角
- 拖动右上角
- 拖动左下角
- 拖动右下角
- 拖动上边
- 拖动下边
- 拖动左边
- 拖动右边

---

## 11.2 题目与 bbox 双向联动

点击右侧题目：

```text
题目 1
题目 2
题目 3
```

图片中对应 bbox 高亮。

点击图片中的 bbox：

```text
┌────────────────────┐
│       第 2 题       │
└────────────────────┘
```

右侧自动选择对应题目。

---

## 11.3 AI bbox 与最终 bbox 分离

Question 保存两个 bbox：

```text
ai_bbox
bbox
```

其中：

```text
ai_bbox
```

保存 AI 第一次识别的原始结果。

```text
bbox
```

保存当前最终生效的结果。

---

## 11.4 bbox_source

```text
ai
manual
```

AI 原始结果：

```text
bbox_source = "ai"
```

用户修改后：

```text
bbox_source = "manual"
```

---

## 11.5 人工确认

用户检查并调整完 bbox 后，点击「确认」按钮：

```http
POST /api/v1/exams/{exam_id}/confirm
```

确认是两段识别的分界点：

- 确认前：所有题目处于 `pending_review`，试卷处于 `awaiting_review`，只有第一段结果
- 确认后：Validator / Suspicious / Crop / Local Vision / Merger 依次执行
- Crop 使用确认时刻的最终 `bbox`（见 §18）

确认操作只需要做一次；逐题 bbox 保存仍通过 §13 的 PATCH 接口完成。

---

# 12. BBox 数据模型

```python
class Question:
    id: int
    exam_id: int
    parent_id: int | None
    question_no: str
    text: str

    bbox: list[int]
    ai_bbox: list[int]

    bbox_source: str

    confidence: float | None

    status: str
```

---

# 13. BBox API

## 修改 bbox

```http
PATCH /api/v1/questions/{question_id}/bbox
```

Request：

```json
{
  "bbox": [125, 280, 875, 430]
}
```

Response：

```json
{
  "id": 12,
  "bbox": [125, 280, 875, 430],
  "ai_bbox": [130, 275, 860, 420],
  "bbox_source": "manual"
}
```

---

## 恢复 AI bbox

```http
POST /api/v1/questions/{question_id}/bbox/reset
```

执行：

```text
bbox = ai_bbox
bbox_source = ai
```

---

# 14. BBox 前端实现

推荐：

```text
React + TypeScript + SVG
```

结构：

```text
ImageViewer
├── OriginalImage
└── SVG Overlay
    ├── QuestionBBox
    │   ├── Move
    │   ├── TopLeft
    │   ├── TopRight
    │   ├── BottomLeft
    │   ├── BottomRight
    │   ├── Top
    │   ├── Bottom
    │   ├── Left
    │   └── Right
    └── IllustrationBBox
```

原因：

- bbox 与图片容易同步
- 支持拖动
- 支持 resize
- 支持选中
- 支持高亮
- 支持缩放
- 比 Canvas 更适合交互式框选

---

# 15. Illustration

每道题可以包含：

- 图片
- 几何图形
- 表格
- 坐标系
- 柱状图
- 折线图
- 电路图
- 其他题目插图

结构：

```json
{
  "bbox": [500, 300, 850, 450],
  "type": "geometry"
}
```

没有插图：

```json
{
  "illustrations": []
}
```

MVP：

- 题目 bbox 支持人工编辑
- Illustration bbox 暂时只自动识别
- 后续再增加 Illustration bbox 编辑

---

# 16. Validator

Global Vision 返回结果后进行验证。

Validator 检查：

### 16.1 JSON

- 是否为合法 JSON
- 是否符合 Pydantic Schema

### 16.2 Question

- 是否有空题目
- 是否缺少题号
- 是否存在明显重复
- 是否存在异常题目范围

### 16.3 BBox

检查：

```text
0 <= x1 < x2 <= 1000
0 <= y1 < y2 <= 1000
```

并检查：

- bbox 是否过小
- bbox 是否过大
- bbox 是否异常重叠
- 是否覆盖整道题

### 16.4 LaTeX

检查：

- 是否存在明显格式错误
- `$` 是否成对
- `$$` 是否成对
- 是否存在明显 OCR 异常

### 16.5 默认阈值

MVP 使用以下默认值，实现为可配置常量：

| 检查项 | 默认阈值 |
|---|---|
| 置信度低 | confidence < 0.7 |
| 题目文本过短 | text 少于 10 个字符 |
| bbox 过小 | 面积 < 整图面积的 0.5% |
| bbox 过大 | 面积 > 整图面积的 90% |
| bbox 异常重叠 | 两题 bbox IoU > 0.6 |
| LaTeX 异常 | `$` 或 `$$` 不配对 |

注意：`confidence` 是 Vision 模型对自身识别结果的自估值，不是真实 OCR 置信度，只作为可疑判定的参考信号。

---

# 17. Suspicious Question

Validator 根据规则判断哪些题目需要第二阶段识别。

规则即 §16.5 的默认阈值：

```text
confidence < 0.7          置信度低
LaTeX $ / $$ 不配对       LaTeX 异常
text 少于 10 个字符        题目文本过短
bbox 面积异常              过小（< 0.5%）或过大（> 90%）
bbox IoU > 0.6            与其他题目异常重叠
插图识别异常               illustrations 内容异常
模型输出不完整             题目数量或字段缺失
```

只有可疑题目进入第二阶段。

这样可以降低 API 成本。

Suspicious 判定执行两次：

- Global 返回后初步判定一次（供页面提前标注可疑题目）
- 人工确认后基于最终 bbox 重新判定一次（以这次结果为准）

---

# 18. Crop

对于需要二次识别的题目：

```text
question.bbox
      ↓
转换成实际像素坐标
      ↓
增加 padding
      ↓
裁剪
      ↓
Local Vision API
```

重要规则：

> Crop 必须使用当前 `question.bbox`，不能重新使用 `ai_bbox`。

即：

```python
effective_bbox = question.bbox
```

而不是：

```python
effective_bbox = question.ai_bbox
```

Crop 发生在人工确认之后，因此这里的 `question.bbox` 就是用户确认时刻的最终结果（可能等于 AI 原始结果，也可能是人工调整后的结果）。

---

# 19. 第二阶段 Local Vision

第二阶段只处理单道题目的局部图片。

主要任务：

- 修正 OCR
- 修正 LaTeX
- 补全遗漏文字
- 修正选项
- 修正题号
- 排除手写内容
- 排除红笔批改
- 修正第一阶段明显错误

第二阶段原则：

> 主要修正题目内容，不重新决定整张试卷的题目结构。

---

# 20. Merger

第一阶段：

```text
Global Result
```

第二阶段：

```text
Local Result
```

最终通过 Merger 合并。

原则：

```text
Global
  ↓
结构、题目顺序、bbox

Local
  ↓
OCR、LaTeX、局部内容
```

冲突规则：

- 题目结构、顺序、题号以 Global 为准；Local 返回的题号与 Global 不一致时，保留 Global 结果并记录警告
- Local 结果只替换 text、选项、LaTeX 等内容字段
- Local 认为裁剪图不是一道完整题目时，丢弃 Local 结果，保留 Global 结果并记录警告
- bbox 永远以 Global / 人工调整结果为准，Local 不修改 bbox

最终得到：

```text
Final Question
```

---

# 21. Vision Provider 抽象

业务逻辑不得直接依赖任何厂商 SDK。

定义统一接口：

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class VisionRequest:
    image_path: str
    prompt: str
    temperature: float = 0


@dataclass
class VisionResponse:
    text: str
    provider: str
    model: str
    latency_ms: int
    raw: dict | None = None


class VisionProvider(ABC):

    @abstractmethod
    async def analyze(
        self,
        request: VisionRequest
    ) -> VisionResponse:
        pass
```

---

# 22. Provider

支持：

```text
OpenAIProvider
QwenProvider
GeminiProvider
```

以及未来其他 Vision Provider。

通过 Factory：

```python
provider = ProviderFactory.create(
    provider_name="qwen",
    model="xxx"
)
```

业务层不关心具体供应商。

---

# 23. 环境变量

```env
GLOBAL_PROVIDER=qwen
GLOBAL_MODEL=xxx

LOCAL_PROVIDER=openai
LOCAL_MODEL=xxx

QWEN_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

---

# 24. API 成本记录

每一次 Vision API 调用必须记录：

```text
provider
model
prompt_version
input_tokens
output_tokens
total_tokens
cost
latency_ms
status
error
raw_output
```

便于统计：

- 每张试卷成本
- 每道题成本
- 每个模型成本
- 第一阶段成本
- 第二阶段成本
- 失败率
- 平均延迟

cost 统一使用美元（USD），由各 Provider 内置的定价表计算，定价表随 Provider 配置维护。

---

# 25. Database

MVP 使用 SQLite。

## Exam

```text
exam
```

字段：

```text
id
name
original_image
width
height
status
created_at
updated_at
```

`name` 为试卷名称，上传时可填，默认取文件名。

状态（见 §6.3）：

```text
uploaded
global_processing
awaiting_review
local_processing
completed
failed
```

---

## Question

```text
question
```

字段：

```text
id
exam_id
parent_id
question_no
text
subject
bbox
ai_bbox
bbox_source
confidence
status
created_at
updated_at
```

`parent_id` 可空，指向所属大题（见 §8.1）。`subject` 为识别阶段判断的科目（数学/语文/英语/物理/化学/生物/历史/地理/政治 之一，global-v3 起输出），加入错题库时作为科目默认值，旧数据为空串。

状态（见 §6.3）：

```text
pending_review
confirmed
correcting
completed
failed
```

---

## Illustration

```text
illustration
```

字段：

```text
id
question_id
bbox
type
```

---

## RecognitionTask

```text
recognition_task
```

字段：

```text
id
exam_id
question_id
stage
provider
model
prompt_version
input_image
output_json
input_tokens
output_tokens
total_tokens
cost
latency_ms
status
error
created_at
```

`question_id` 可空：Global 阶段的任务属于整张试卷，为空；Local 阶段的任务指向具体题目。

---

## WrongQuestion

```text
wrong_question
```

字段：

```text
id
question_id
exam_id
answer
correct_answer
wrong_reason
knowledge_points
image
note
created_at
updated_at
```

说明：

- `question_id` / `exam_id` 指向来源题目和试卷（source_exam）
- `knowledge_points` 是字符串数组，SQLite 中存为 JSON 字符串
- `image` 保存题图快照路径，加入错题库时从原图裁剪生成，存入 `backend/data/results/`
- `note` 为用户备注，可空

---

# 26. API

## 创建试卷

```http
POST /api/v1/exams
```

## 试卷列表

```http
GET /api/v1/exams
```

返回试卷数组（id、name、status、created_at、题目数量），按创建时间倒序。

## 查询试卷

```http
GET /api/v1/exams/{exam_id}
```

返回：

```json
{
  "id": 123,
  "name": "数学月考",
  "status": "completed",
  "questions": []
}
```

`questions` 按 question_no 排序，包含 `parent_id` 层级信息。

## 确认并触发二次识别

```http
POST /api/v1/exams/{exam_id}/confirm
```

仅当 Exam 处于 `awaiting_review` 时有效，触发第二段识别（见 §6.2）。

## 重新识别

```http
POST /api/v1/exams/{exam_id}/re-recognize
Content-Type: application/json

{ "includeIllustrations": true, "extraPrompt": "补充提示词（可选）" }
```

清除该试卷的识别结果，状态重置为 `global_processing`，重新执行两段识别（第一段结束后仍停在 `awaiting_review`）。用于 `failed` 后重跑，或用户修改 bbox 后希望整体重来。

请求体（均可选，camelCase）：
- `includeIllustrations`：本次识别是否包含插图，缺省沿用已有设置（保留查询参数 `?include_illustrations=` 兼容旧调用，请求体优先）。
- `extraPrompt`：用户补充提示词，持久化在 Exam 上，拼接到 Global 与 Local 两段提示词末尾（模板见 `prompts/global_question.py` 的 `USER_EXTRA_PROMPT_TEMPLATE`，要求不得改变 JSON 输出格式）；传空白字符串清除，不传保持原值。`GET /exams/{id}` 以 `extraPrompt` 回显，供弹窗回填。

## 删除试卷

```http
DELETE /api/v1/exams/{exam_id}
```

删除 Exam、Question、Illustration、RecognitionTask、WrongQuestion 关联数据及图片文件。

## 查询题目

```http
GET /api/v1/questions/{question_id}
```

## 修改 bbox

```http
PATCH /api/v1/questions/{question_id}/bbox
```

## 恢复 AI bbox

```http
POST /api/v1/questions/{question_id}/bbox/reset
```

## 加入错题库

```http
POST /api/v1/wrong-questions
```

Request：

```json
{
  "question_id": 456,
  "answer": "x=1",
  "correct_answer": "x=1 或 x=-1",
  "wrong_reason": "漏判负根",
  "knowledge_points": ["一元二次方程"],
  "note": ""
}
```

后端自动裁剪题图快照保存到 `image` 路径。

## 错题列表

```http
GET /api/v1/wrong-questions
```

## 错题详情

```http
GET /api/v1/wrong-questions/{id}
```

## 编辑错题

```http
PATCH /api/v1/wrong-questions/{id}
Content-Type: application/json

{ "subject": "数学" }
```

可编辑字段（均可选，camelCase，仅传入的字段会被修改）：`subject` 科目（≤32 字符，空字符串清除，前端显示为"未设置"）。错题库页面的科目标签可点击编辑，支持常用科目联想与自由输入。

---

# 27. Web 页面

## 27.1 上传页面

支持：

- 点击上传
- 拖拽上传
- 图片预览
- 上传进度
- 识别状态
- 历史试卷列表（`GET /api/v1/exams`），显示名称、状态、时间，点击进入识别结果页；提供删除入口
- 上传时可填写试卷名称，默认取文件名

---

## 27.2 识别结果页面

布局：

```text
┌──────────────────────────┬────────────────────────────┐
│                          │                            │
│       原始试卷图片        │       题目列表              │
│                          │                            │
│    ┌──────────────┐      │  第1题                     │
│    │    第1题      │      │  第2题                     │
│    └──────────────┘      │  第3题                     │
│                          │    ├─ 3(1)                 │
│    ┌──────────────┐      │    └─ 3(2)                 │
│    │    第2题      │      │  第4题                     │
│    └──────────────┘      │                            │
│                          │  [确认并开始二次识别]        │
└──────────────────────────┴────────────────────────────┘
```

左侧：

- 原始图片
- bbox
- bbox 编辑
- 选中高亮

右侧：

- 题目列表（按层级树形展示，大题下缩进显示小题，KaTeX 渲染公式）
- 题目文本
- 识别状态（Question status）
- 可疑标记
- 修改状态
- 每道题的「保存 bbox」与「加入错题库」入口
- 底部「确认并开始二次识别」按钮（仅 `awaiting_review` 状态显示）
- 失败时提供「重新识别」按钮

---

## 27.3 错题库页面

- 错题列表（题干摘要、错因、知识点、来源试卷、加入时间）
- 错题详情（完整题干、图片快照、我的答案、正确答案、错因、知识点、备注）
- MVP 不做编辑和删除错题之外的扩展功能

---

# 28. 错题库

错题库属于 MVP 范围，在 Phase 4 实现（见 §39）。

## 28.1 错题如何产生

MVP 采用**手动添加**：

- 识别结果页的题目列表中，每道题提供「加入错题库」按钮
- 点击后弹窗，手动填写：
  - 我的答案（answer）
  - 正确答案（correct_answer）
  - 错因（wrong_reason）
  - 知识点（knowledge_points，可多个）
  - 备注（note，可空）
- 提交后调用 `POST /api/v1/wrong-questions` 入库
- 后端自动从原图裁剪题图快照，作为错题图片保存

数据模型见 §25 的 WrongQuestion 表。

## 28.2 错题库页面

- 错题列表（见 §27.3）
- 错题详情（见 §27.3）

后续支持：

- 搜索
- 标签
- 学科
- 年级
- 题型
- 收藏
- 重做
- 错题统计

---

# 29. Recognition Pipeline

核心代码逻辑。Pipeline 分两段，以人工确认为界（见 §6）：

```python
class RecognitionPipeline:

    async def run_global(self, exam):
        """第一段：上传后自动执行，结束于 awaiting_review。"""

        image = await self.preprocess(exam.image_path)

        global_result = await (
            self.global_model
            .recognize(image.path)
        )

        # JSON 解析失败时按 §32 重试，耗尽则 Exam 置 failed
        questions = self.validator.validate(
            global_result
        )

        # 初步可疑标记，仅供页面提前展示
        self.validator.find_suspicious(questions)

        await self.repository.save_questions(questions)

        # Exam -> awaiting_review，等待人工检查 / 调整 bbox / 确认

    async def run_local(self, exam):
        """第二段：POST /exams/{id}/confirm 触发。
        使用确认时刻的最终 bbox。"""

        questions = self.validator.validate(exam.questions)

        suspicious = (
            self.validator
            .find_suspicious(questions)
        )

        for question in suspicious:

            # 必须使用当前 bbox（人工确认后的最终结果）
            crop = self.crop(
                exam.image,
                question.bbox
            )

            result = await (
                self.local_model
                .recognize(crop)
            )

            # 单题失败回退 Global 结果，见 §32
            self.merger.merge(
                question,
                result
            )

        await self.repository.save_final(exam.questions)

        # Exam -> completed
```

---

# 30. JSON Schema

Global Vision 最终只允许输出 JSON。

自 global-v4 起，大题与其所有小题合并为一道题输出：`text` 完整包含大题题干、共享材料和全部小题（保留小题编号），不再输出 `sub_questions`。Validator 仍兼容旧版层级输出（`sub_questions` 展平为 question 表并以 `parent_id` 关联，见 §8.1）。

示例：

```json
{
  "questions": [
    {
      "question_no": "1",
      "text": "下列说法正确的是（  ）",
      "subject": "数学",
      "bbox": [100, 100, 900, 250],
      "illustrations": [],
      "confidence": 0.98,
      "sub_questions": []
    },
    {
      "question_no": "3",
      "text": "（大题题干与共享材料）",
      "bbox": [100, 260, 900, 640],
      "illustrations": [],
      "confidence": 0.95,
      "sub_questions": [
        {
          "question_no": "3(1)",
          "text": "已知 $x^2-2x+1=0$，求 $x$。",
          "bbox": [100, 300, 900, 430],
          "illustrations": [
            {
              "bbox": [600, 300, 850, 420],
              "type": "geometry"
            }
          ],
          "confidence": 0.93,
          "sub_questions": []
        },
        {
          "question_no": "3(2)",
          "text": "……",
          "bbox": [100, 440, 900, 620],
          "illustrations": [],
          "confidence": 0.94,
          "sub_questions": []
        }
      ]
    }
  ]
}
```

说明：

- `confidence` 是模型对自身识别结果的自估值，不是真实 OCR 置信度，仅用于可疑判定参考（见 §16.5）
- 小题编号必须带大题编号前缀，如 `3(1)`

禁止输出：

```text
这里是识别结果：
```

必须：

```text
纯 JSON
```

---

# 31. Prompt 核心要求

Global Vision Prompt：

```text
仔细识别这张试卷/作业照片中的所有题目。

必须识别整张图片中的每一道独立小题，
包括大题下面的所有小题。

要求：

1. text 是题目的完整干净原文。
2. 不包含学生手写答案。
3. 不包含老师红笔批改。
4. 选择题必须保留全部选项。
5. 数学公式使用 LaTeX。
6. bbox 使用 [x1,y1,x2,y2]。
7. 坐标范围为 0-1000。
8. bbox 必须覆盖完整题目。
9. illustrations 记录题目中的插图、图形、表格等。
10. 没有插图时返回空数组。
11. 大题作为父题目，其题干和共享材料放在 text 中，
    所有小题放在 sub_questions 数组中。
12. 小题编号必须带大题编号前缀，如 "3(1)"。
13. 独立题目的 sub_questions 为空数组。
14. 只输出 JSON。
15. 不要输出任何其他文字。
```

---

# 32. 错误处理

## JSON 解析失败

允许重试：

```text
最多 2 次
```

重试耗尽仍失败：Global 阶段整卷置 `failed`，原始输出保存到 RecognitionTask 的 `output_json` / `error`，可人工排查后重新识别。

---

## 网络错误

允许重试，最多 3 次。

---

## 429

指数退避：

```text
初始等待 2 秒
每次翻倍
最多重试 3 次
```

耗尽后按网络错误处理。

---

## 5xx

允许重试，最多 3 次。

---

## Local 阶段单题失败

单道题目的二次识别失败时：

- 该题回退使用 Global 结果，status 置 `failed`
- 错误信息记录到该题的 RecognitionTask
- 不影响其他题目，不阻塞整卷，Exam 照常进入 `completed`

---

## API Key / Authentication 错误

不重试。

---

## 图片格式错误

不重试，直接返回错误。

---

# 33. 文件存储

MVP 本地文件系统：

```text
backend/data/
├── originals/
├── working/
├── crops/
└── results/
```

数据库只保存路径。

未来可以升级：

- S3
- OSS
- COS
- MinIO

---

# 34. 前端状态

```typescript
interface Question {
  id: number;
  examId: number;
  parentId: number | null;
  questionNo: string;
  text: string;

  bbox: [
    number,
    number,
    number,
    number
  ];

  aiBbox: [
    number,
    number,
    number,
    number
  ];

  bboxSource: "ai" | "manual";

  confidence?: number;

  status:
    | "pending_review"
    | "confirmed"
    | "correcting"
    | "completed"
    | "failed";

  illustrations: Illustration[];
}
```

---

# 35. BBox 编辑状态

前端拖动流程：

```text
Mouse Down
    ↓
确定操作类型
    ↓
Move / Resize
    ↓
计算新的像素坐标
    ↓
转换为 0～1000
    ↓
前端实时更新
    ↓
Mouse Up
    ↓
用户点击保存
    ↓
PATCH API
```

前端实时编辑可以暂时不保存数据库。

只有点击某道题的「保存」后才持久化：bbox 按**逐题**保存（每道题一次 `PATCH /api/v1/questions/{question_id}/bbox`），不提供整页批量保存。

---

# 36. BBox 校验

前端和后端都必须校验。

```text
0 <= x1 < x2 <= 1000
0 <= y1 < y2 <= 1000
```

限制最小尺寸：

```text
width > 1
height > 1
```

超出图片范围时自动限制：

```text
0～1000
```

---

# 37. AI 与人工结果关系

数据关系：

```text
                 ┌─────────────┐
                 │ Global AI   │
                 └──────┬──────┘
                        ↓
                    ai_bbox
                        │
                        ↓
                ┌──────────────┐
                │ 用户检查/调整 │
                └──────┬───────┘
                       ↓
                  人工确认
                       ↓
                     bbox
                       │
                       ↓
                  后续 Pipeline
```

核心原则：

> `ai_bbox` 永远保存 AI 原始结果，`bbox` 保存当前最终结果。

后续 Pipeline（Validator / Crop / Local Vision）只在人工确认之后执行，使用确认时刻的 `bbox`（见 §6.2）。

---

# 38. MVP 不做的功能

以下暂时不加入：

- 用户登录
- 多租户
- 权限系统
- Redis
- Celery
- RabbitMQ
- PostgreSQL
- 向量数据库
- 本地 AI 模型
- Ollama
- oMLX
- Kubernetes
- 微服务
- WebSocket
- SSE
- 自动答案判定
- 自动批改整张试卷
- OCR 本地模型
- 多页试卷（MVP 一张图 = 一份试卷，多页见 §45）

先把：

```text
上传
→ 全页识别
→ BBox
→ 人工调整
→ 二次识别
→ 题目保存
→ 错题库
```

跑通。

---

# 39. MVP 开发阶段

## Phase 1：基础识别

实现：

```text
上传图片
↓
Global Vision
↓
JSON
↓
SQLite
↓
API
↓
Web 显示
```

完成后试卷停在 `awaiting_review`，用户可以在页面上查看识别出的题目和 bbox。

目标：

> 能正确识别整张试卷中的所有题目（含大题/小题层级），并进入待确认状态。

---

## Phase 2：BBox 编辑与人工确认

实现：

```text
显示 bbox
↓
点击题目
↓
高亮 bbox
↓
拖动 bbox
↓
调整大小
↓
逐题保存
↓
恢复 AI bbox
↓
点击「确认」触发二次识别入口
```

这是 MVP 核心功能。确认操作在本阶段先打通 API 与按钮，实际二次识别在 Phase 3 实现。

---

## Phase 3：二次 Vision

实现：

```text
人工确认触发
↓
Validator（使用最终 bbox）
↓
Suspicious
↓
Crop
↓
Local Vision
↓
Merger
↓
Exam 进入 completed
```

---

## Phase 4：错题库

实现：

```text
题目列表「加入错题库」按钮 + 弹窗
↓
WrongQuestion 入库（含题图快照）
↓
错题列表
↓
错题详情
```

---

## Phase 5：增强功能

未来再考虑：

```text
用户系统
标签
搜索
知识点
答案
错因
统计
SSE/WebSocket
PostgreSQL
Redis
对象存储
向量检索
```

---

# 40. 质量指标

项目需要重点关注：

## 题目召回率

```text
识别出的题目数量
/
实际题目数量
```

重点指标：

> 漏题率

---

## 题目切分准确率

检查：

- 是否把两题合成一题
- 是否把一道题拆成多题

---

## BBox 准确率

检查：

- 是否完整框住题目
- 是否包含相邻题目
- 是否遗漏选项
- 是否包含手写内容

同时统计：

```text
AI bbox
vs
人工 bbox
```

---

## OCR 准确率

检查：

- 汉字
- 数字
- 英文
- 特殊符号

---

## LaTeX 准确率

重点检查：

- 分数
- 根号
- 上下标
- 积分
- 矩阵
- 方程组
- 几何符号

---

## 手写/批改排除率

重点保证：

```text
题目原文
≠
学生答案
≠
老师批改
```

---

## API 成本

统计：

```text
每张试卷
每道题
Global
Local
总成本
```

---

## 延迟

统计：

```text
上传
→ Global
→ Validator
→ Local
→ 完成
```

---

# 41. MVP 最终流程

```text
┌──────────────┐
│ 上传试卷图片  │   Exam: uploaded
└──────┬───────┘
       ↓
┌─────────────────┐
│ 保存原始图片     │
│ Preprocess      │   Exam: global_processing
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Global Vision   │
│ 整页识别         │
└──────┬──────────┘
       ↓
┌─────────────────┐
│ Validator 入库  │   Question: pending_review
│ Question +      │
│ ai_bbox         │
└──────┬──────────┘
       ↓
┌─────────────────────────┐
│ Web 识别结果页           │   Exam: awaiting_review
│ 人工检查 / 调整 bbox     │
│ （逐题保存，可恢复 AI）  │
└──────┬──────────────────┘
       ↓
┌─────────────────────────┐
│ 用户点击「确认」          │
│ POST /exams/{id}/confirm│   Exam: local_processing
└──────┬──────────────────┘
       ↓
┌─────────────────┐
│ Validator       │   使用确认后的最终 bbox
└──────┬──────────┘
       ↓
   可疑题目？
      / \
    否   是
    │     │
    │     ↓
    │  ┌─────────────┐
    │  │ Crop        │
    │  │ 使用 bbox   │
    │  └──────┬──────┘
    │         ↓
    │  ┌─────────────┐
    │  │ Local Vision│   Question: correcting
    │  └──────┬──────┘
    │         ↓
    │  ┌─────────────┐
    └─→│ Merger      │   单题失败回退 Global 结果
       └──────┬──────┘
              ↓
       ┌─────────────┐
       │ 最终 Question│   Question: completed
       └──────┬──────┘
              ↓
       ┌─────────────┐
       │ SQLite      │   Exam: completed
       │ 错题库       │   （之后可手动加入错题库）
       └─────────────┘
```

---

# 42. 最终 MVP 验收标准

## 上传

- [ ] 可以上传试卷图片
- [ ] 支持 JPG/JPEG/PNG/WebP
- [ ] 超过 10MB 或格式不符时返回 4xx
- [ ] 上传后返回 202，status 为 uploaded
- [ ] 后台自动开始第一段识别

## 流程与状态

- [ ] Global 完成后 Exam 进入 awaiting_review
- [ ] awaiting_review 期间可逐题修改并保存 bbox
- [ ] 点击「确认」触发二次识别
- [ ] 二次识别完成后 Exam 进入 completed
- [ ] 失败时 Exam 进入 failed，可重新识别
- [ ] 可以删除试卷

## AI 识别

- [ ] 识别整张试卷
- [ ] 识别所有独立题目
- [ ] 大题/小题以层级结构识别并按 parent_id 入库
- [ ] 小题编号带大题前缀（如 3(1)）
- [ ] 保留选择题选项
- [ ] 数学公式输出 LaTeX
- [ ] 排除手写
- [ ] 排除红笔批改

## BBox

- [ ] 每道题都有 bbox
- [ ] bbox 使用 0～1000 坐标
- [ ] 可以点击 bbox
- [ ] 可以点击题目定位 bbox
- [ ] 可以拖动 bbox
- [ ] 可以调整四角
- [ ] 可以调整四边
- [ ] 可以逐题保存 bbox
- [ ] 保存后 bbox_source = manual
- [ ] 可以恢复 AI bbox
- [ ] 恢复后 bbox_source = ai
- [ ] ai_bbox 永久保留

## 二次识别

- [ ] 仅在人工确认后触发
- [ ] Validator 可以发现可疑题目
- [ ] 使用确认时刻的最终 bbox 进行 crop
- [ ] Local Vision 可以修正题目
- [ ] Merger 可以生成最终结果
- [ ] 单题失败时回退 Global 结果且不阻塞整卷

## 数据

- [ ] SQLite 保存 Exam
- [ ] SQLite 保存 Question（含 parent_id）
- [ ] SQLite 保存 Illustration
- [ ] SQLite 保存 RecognitionTask
- [ ] SQLite 保存 WrongQuestion
- [ ] 保存 AI 调用成本
- [ ] 保存模型和 Provider
- [ ] 保存错误信息

## Web

- [ ] 上传页面（含历史试卷列表）
- [ ] 识别结果页面
- [ ] bbox 可视化
- [ ] bbox 编辑
- [ ] 题目列表（层级树形展示）
- [ ] 「确认并开始二次识别」按钮
- [ ] 「加入错题库」按钮与弹窗
- [ ] 错题库列表页
- [ ] 错题详情页

---

# 43. 最终技术栈

| 层 | 技术 |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Build | Vite |
| UI | Ant Design |
| Image Overlay | SVG |
| LaTeX 渲染 | KaTeX |
| HTTP | Fetch / Axios |
| Backend | Python |
| API | FastAPI |
| Validation | Pydantic |
| ORM | SQLAlchemy |
| Database | SQLite |
| Image | Pillow |
| HTTP Client | httpx |
| AI | Third-party Vision API |
| Testing | pytest / Vitest |
| Task | FastAPI BackgroundTasks |
| Mobile（Android/iOS） | React Native + Expo（TypeScript + expo-router），见 mobile/README.md |

---

# 44. 核心设计原则

整个项目遵循以下原则：

### 原则 1：AI 负责识别，人负责最终确认

AI 提供：

```text
题目
+
bbox
```

用户可以修正 bbox。

---

### 原则 2：AI 原始结果不能丢

始终保留：

```text
ai_bbox
```

最终使用：

```text
bbox
```

---

### 原则 3：人工修改优先

用户修改后的 bbox 是最终生效结果。

---

### 原则 4：二次识别只解决局部问题

Global Vision：

```text
解决整页结构
```

Local Vision：

```text
解决局部内容质量
```

---

### 原则 5：业务代码与 AI 厂商解耦

业务代码只依赖：

```text
VisionProvider
```

不直接依赖具体厂商 SDK。

---

### 原则 6：先简单跑通，再扩展

MVP 优先：

```text
React
+
FastAPI
+
SQLite
+
第三方 Vision API
```

不要提前引入复杂基础设施。

---

# 45. 后续扩展方向

MVP 稳定后，可以逐步增加：

```text
多页试卷支持
答案识别
↓
错题自动判断
↓
错因分析
↓
知识点提取
↓
相似题推荐
↓
错题复习
↓
自动生成练习
↓
用户账户
↓
云存储
↓
PostgreSQL
↓
Redis / Queue
↓
向量检索
```

最终形成：

```text
拍照
 ↓
AI 识别
 ↓
人工确认
 ↓
错题入库
 ↓
错因分析
 ↓
知识点分析
 ↓
智能复习
 ↓
相似题训练
```

这套架构在 MVP 阶段保持简单，同时为后续扩展保留足够的接口和数据结构。

---

# 46. 管理后台

独立管理前端应用（`admin/` 目录，React 18 + TypeScript + Vite + Ant Design，dev 端口 5174，代理 `/api`、`/files` 到后端 8000），仅管理员账号可登录。

## 46.1 管理员身份

- `user` 表增加 `is_admin`（布尔，默认 False），存量库由 `_sqlite_lightweight_migrations()` 自动补列。
- 种子用户 `xiaohui` 在启动时被幂等地设为管理员（`_seed_default_user`）。
- 鉴权依赖 `get_admin_user`（`app/api/deps.py`）：复用 `get_current_user` 后校验 `is_admin`，非管理员返回 403（`ForbiddenError`）。
- `UserOut` 含 `isAdmin`，登录与 `/auth/me` 响应均返回，供前端判断。

## 46.2 管理接口（/api/v1/admin，全部要求管理员）

```http
GET    /api/v1/admin/stats                     # 用户/试卷/题目/错题总数
GET    /api/v1/admin/users                     # 用户列表（含试卷数、错题数）
PATCH  /api/v1/admin/users/{user_id}           # 重置密码 / 设·撤管理员（禁止撤销自己的管理员）
DELETE /api/v1/admin/users/{user_id}           # 级联删除用户（逐卷清理图片与关联数据；禁止删除自己）
GET    /api/v1/admin/exams                     # 跨用户试卷列表（所属用户、题目数）
DELETE /api/v1/admin/exams/{exam_id}           # 删除任意试卷（复用 delete_exam_and_files）
GET    /api/v1/admin/wrong-questions           # 跨用户错题列表（所属用户、来源试卷、题干）
DELETE /api/v1/admin/wrong-questions/{id}      # 删除任意错题
```

## 46.3 管理页面

- 登录页：登录后校验 `isAdmin`，非管理员提示无权限；路由守卫 `RequireAdmin` 每次加载实时校验。
- 概览：用户/试卷/题目/错题总数卡片 + 最近注册用户表。
- 用户：表格展示试卷/错题数量；管理员 Switch（自己禁用）、重置密码弹窗、删除二次确认（自己禁用）。
- 试卷：跨用户列表，状态标签、查看原图（/files）、删除二次确认。
- 错题：跨用户列表，科目、题干摘要、错因、来源试卷、查看快照、删除二次确认。