from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import CamelModel
from app.schemas.question import QuestionOut


class ExamCreated(BaseModel):
    """POST /api/v1/exams 的 202 返回体（§5.1）。"""

    id: int
    status: str


class ReRecognizeRequest(CamelModel):
    """POST /api/v1/exams/{id}/re-recognize 请求体（均可选）。"""

    include_illustrations: bool | None = None
    # 仅作防滥用上限；超过 EXTRA_PROMPT_MAX_CHARS（800）的内容在服务层
    # 直接弃用（保留试卷已有补充提示词），而不是报错
    extra_prompt: str | None = Field(default=None, max_length=10000)


class ExamListItem(CamelModel):
    """GET /api/v1/exams 列表项。"""

    id: int
    name: str
    status: str
    created_at: datetime
    question_count: int


class ExamDetail(CamelModel):
    """GET /api/v1/exams/{exam_id}（§26）。"""

    id: int
    name: str
    status: str
    created_at: datetime
    image_url: str = ""
    include_illustrations: bool = True
    grade: str = "一年级"
    extra_prompt: str | None = None
    # 识别失败原因（status=failed 时非空，如模型超时/网络错误）
    error_message: str = ""
    questions: list[QuestionOut] = []
