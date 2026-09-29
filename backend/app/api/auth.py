from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.exceptions import AuthError, ValidationError
from app.core.security import create_token, hash_password, verify_password
from app.database import repository as repo
from app.database.database import get_db
from app.schemas.auth import CredentialsIn, GradeUpdate, TokenOut, UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DbSession = Annotated[Session, Depends(get_db)]


def _check_credentials(username: str, password: str) -> None:
    if not username or len(username) > 64:
        raise ValidationError("用户名不能为空且不超过 64 个字符")
    if len(password) < 6:
        raise ValidationError("密码至少 6 位")


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: CredentialsIn, db: DbSession) -> TokenOut:
    """注册新用户，成功即登录（返回 token）。年级作为首次上传试卷的默认值。"""
    _check_credentials(payload.username, payload.password)
    if repo.get_user_by_username(db, payload.username) is not None:
        raise ValidationError("用户名已存在")
    user = repo.create_user(
        db,
        username=payload.username,
        password_hash=hash_password(payload.password),
        grade=payload.grade,
    )
    return TokenOut(token=create_token(user.id), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(payload: CredentialsIn, db: DbSession) -> TokenOut:
    """账号密码登录。"""
    user = repo.get_user_by_username(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthError("用户名或密码错误")
    return TokenOut(token=create_token(user.id), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    """当前登录用户信息。"""
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
def update_me(payload: GradeUpdate, db: DbSession, user: CurrentUser) -> UserOut:
    """修改当前用户资料（目前支持年级），「我的」页调用。"""
    return UserOut.model_validate(repo.update_user_grade(db, user, payload.grade))
