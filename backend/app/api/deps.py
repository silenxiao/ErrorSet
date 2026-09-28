"""FastAPI 鉴权依赖：从 Authorization: Bearer 解析当前用户。"""

from typing import Annotated

from fastapi import Depends, Header, Query
from sqlalchemy.orm import Session

from app.core import security
from app.core.exceptions import AuthError, ForbiddenError
from app.database import repository as repo
from app.database.database import get_db
from app.database.models import User


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str, Query()] = "",
) -> User:
    # 浏览器 <img> / 小程序 <image> 标签发不出 Authorization 头，允许 ?token= 回退
    raw = ""
    if authorization and authorization.startswith("Bearer "):
        raw = authorization[len("Bearer "):]
    elif token:
        raw = token
    if not raw:
        raise AuthError()
    user_id = security.decode_token(raw)
    if user_id is None:
        raise AuthError()
    user = repo.get_user(db, user_id)
    if user is None:
        raise AuthError("用户不存在")
    return user


def get_admin_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not user.is_admin:
        raise ForbiddenError("需要管理员权限")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
