"""留言板接口（/api/v1/feedback）：登录用户提交与查看自己的留言。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.exceptions import ValidationError
from app.database import repository as repo
from app.database.database import get_db
from app.schemas.feedback import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])

DbSession = Annotated[Session, Depends(get_db)]

CONTENT_MAX = 1000


@router.post("", response_model=FeedbackOut)
def create_feedback(
    payload: FeedbackCreate, db: DbSession, user: CurrentUser
) -> FeedbackOut:
    content = payload.content.strip()
    if not content:
        raise ValidationError("留言内容不能为空")
    if len(content) > CONTENT_MAX:
        raise ValidationError(f"留言内容不能超过 {CONTENT_MAX} 字")
    row = repo.create_feedback(db, user_id=user.id, content=content)
    return FeedbackOut.model_validate(row)


@router.get("/mine", response_model=list[FeedbackOut])
def list_my_feedback(db: DbSession, user: CurrentUser) -> list[FeedbackOut]:
    return [
        FeedbackOut.model_validate(row) for row in repo.list_feedbacks(db, user.id)
    ]
