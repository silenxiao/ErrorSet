"""FastAPI 鉴权依赖：从 Authorization: Bearer 解析当前用户。"""

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core import security
from app.core.exceptions import AuthError
from app.database import repository as repo
from app.database.database import get_db
from app.database.models import User


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError()
    user_id = security.decode_token(authorization[len("Bearer "):])
    if user_id is None:
        raise AuthError()
    user = repo.get_user(db, user_id)
    if user is None:
        raise AuthError("用户不存在")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
