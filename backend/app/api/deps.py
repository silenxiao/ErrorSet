"""FastAPI 鉴权依赖：从 Authorization: Bearer 解析当前用户。"""

from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core import security
from app.core.exceptions import AuthError, ForbiddenError
from app.database import repository as repo
from app.database.database import get_db
from app.database.models import User


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    raw = ""
    if authorization and authorization.startswith("Bearer "):
        raw = authorization[len("Bearer "):]
    if not raw:
        raise AuthError()
    identity = security.decode_token(raw)
    if identity is None:
        raise AuthError()
    user_id, auth_identity = identity
    user = repo.get_user(db, user_id)
    if user is None or user.auth_identity != auth_identity:
        raise AuthError("用户不存在")
    return user


def get_admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise ForbiddenError("需要管理员权限")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
