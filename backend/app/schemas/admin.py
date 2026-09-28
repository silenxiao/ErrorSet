from datetime import datetime

from app.schemas.common import CamelModel


class AdminStatsOut(CamelModel):
    user_count: int
    exam_count: int
    question_count: int
    wrong_question_count: int


class AdminUserOut(CamelModel):
    id: int
    username: str
    is_admin: bool
    exam_count: int
    wrong_question_count: int
    created_at: datetime


class AdminUserUpdate(CamelModel):
    """重置密码 / 设·撤管理员，字段均可选。"""

    password: str | None = None
    is_admin: bool | None = None


class AdminExamOut(CamelModel):
    id: int
    name: str
    status: str
    username: str
    question_count: int
    original_image: str
    created_at: datetime


class AdminWrongQuestionOut(CamelModel):
    id: int
    username: str
    exam_name: str
    subject: str
    question_text: str
    wrong_reason: str
    image: str
    created_at: datetime


class AdminFeedbackOut(CamelModel):
    id: int
    username: str
    content: str
    created_at: datetime
