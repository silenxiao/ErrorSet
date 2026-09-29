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
    system_model_calls: int
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


class AdminModelProfileOut(CamelModel):
    """后台模型列表项。api_key 不回传，只告知是否已保存。

    is_system=True 为系统模型（enabled 为公共开关）；否则为分配给
    username（或 userId 指定用户）的独享模型，只展示 origin=admin 的。
    """

    id: int
    name: str
    provider: str
    base_url: str
    model: str
    has_api_key: bool
    enabled: bool
    is_system: bool
    user_id: int | None = None
    username: str | None = None


class AdminModelProfileCreate(CamelModel):
    """POST /api/v1/admin/models。scope=system 建系统模型；scope=user 分配给 userId 用户。"""

    scope: str  # "system" | "user"
    user_id: int | None = None
    name: str = ""
    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    enabled: bool = False


class AdminModelProfileUpdate(CamelModel):
    """PUT /api/v1/admin/models/{id}。api_key 留空表示保持不变；系统模型 enabled 为公共开关。"""

    name: str = ""
    provider: str
    base_url: str = ""
    model: str = ""
    api_key: str = ""
    enabled: bool | None = None
