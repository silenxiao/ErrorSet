from ipaddress import ip_address, ip_network
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.exceptions import AuthError, RateLimitError, ValidationError
from app.core.security import RateLimiter, create_token, hash_password, validate_new_password, verify_password
from app.database import repository as repo
from app.database.database import get_db
from app.schemas.auth import (
    CredentialsIn,
    GradeUpdate,
    PasswordUpdate,
    TokenOut,
    UserOut,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DbSession = Annotated[Session, Depends(get_db)]

# 登录爆破与注册刷号防护：按 客户端IP+用户名 / 客户端IP 计数
_login_limiter = RateLimiter(max_events=5, window_seconds=300)
_register_limiter = RateLimiter(max_events=10, window_seconds=3600)
# 改密接口同样可被用来爆破原密码，按用户限流
_change_password_limiter = RateLimiter(max_events=5, window_seconds=300)


def _client_ip(request: Request) -> str:
    """从实际连接端向外回溯，只跨过显式信任的代理。"""
    peer = request.client.host if request.client else "unknown"
    try:
        current = ip_address(peer)
    except ValueError:
        return peer
    trusted = [ip_network(value) for value in get_settings().trusted_proxy_cidrs]
    forwarded = request.headers.get("x-forwarded-for", "")
    if not forwarded or not any(current in network for network in trusted):
        return str(current)
    try:
        chain = [ip_address(value.strip()) for value in forwarded.split(",")]
    except ValueError:
        return str(current)  # 非法链不能提供新的限流身份
    for address in reversed(chain):
        if not any(current in network for network in trusted):
            break
        current = address
    return str(current)


def _check_credentials(username: str, password: str) -> None:
    if not username or len(username) > 64:
        raise ValidationError("用户名不能为空且不超过 64 个字符")
    try:
        validate_new_password(password)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc


@router.post("/register", response_model=TokenOut, status_code=201)
def register(payload: CredentialsIn, db: DbSession, request: Request) -> TokenOut:
    """注册新用户，成功即登录（返回 token）。年级作为首次上传试卷的默认值。"""
    if not _register_limiter.allow(f"register:{_client_ip(request)}"):
        raise RateLimitError()
    _check_credentials(payload.username, payload.password)
    if repo.get_user_by_username(db, payload.username) is not None:
        raise ValidationError("用户名已存在")
    user = repo.create_user(
        db,
        username=payload.username,
        password_hash=hash_password(payload.password),
        grade=payload.grade,
    )
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(payload: CredentialsIn, db: DbSession, request: Request) -> TokenOut:
    """账号密码登录。连续失败会触发临时限流。"""
    key = f"login:{_client_ip(request)}:{payload.username}"
    if not _login_limiter.allow(key):
        raise RateLimitError()
    user = repo.get_user_by_username(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise AuthError("用户名或密码错误")
    _login_limiter.clear(key)
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    """当前登录用户信息。"""
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
def update_me(payload: GradeUpdate, db: DbSession, user: CurrentUser) -> UserOut:
    """修改当前用户资料（目前支持年级），「我的」页调用。"""
    return UserOut.model_validate(repo.update_user_grade(db, user, payload.grade))


@router.put("/me/password", response_model=dict)
def update_password(
    payload: PasswordUpdate, db: DbSession, user: CurrentUser
) -> dict:
    """修改当前用户密码，「我的」页调用。需提供正确的原密码。"""
    key = f"password:{user.id}"
    if not _change_password_limiter.allow(key):
        raise RateLimitError()
    if payload.new_password != payload.confirm_password:
        raise ValidationError("两次输入的新密码不一致")
    if not verify_password(payload.old_password, user.password_hash):
        raise AuthError("原密码不正确")
    if payload.old_password == payload.new_password:
        raise ValidationError("新密码不能与原密码相同")
    repo.update_user_password(db, user, hash_password(payload.new_password))
    # 改密成功即清空失败计数，避免正常用户被自己之前的手误拖累
    _change_password_limiter.clear(key)
    return {"ok": True}
