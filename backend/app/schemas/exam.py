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
    extra_prompt: str | None = Field(default=None, max_length=2000)


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
    questions: list[QuestionOut] = []
