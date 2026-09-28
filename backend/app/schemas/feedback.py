from datetime import datetime

from app.schemas.common import CamelModel


class FeedbackCreate(CamelModel):
    """POST /api/v1/feedback。content 去空白后 1~1000 字，路由内校验。"""

    content: str


class FeedbackOut(CamelModel):
    id: int
    content: str
    created_at: datetime
