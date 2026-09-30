"""「我的」页修改密码接口的回归测试。

要点：
- 必须校验原密码，错误时返回 401 语义（AuthError）
- 新密码长度/一致性校验
- 改密后必须能用新密码登录、旧密码失效
- 原密码错误会限流（防爆破）
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api import auth as auth_api
from app.core.exceptions import AuthError, RateLimitError, ValidationError
from app.core.security import hash_password, verify_password
from app.database.database import Base
from app.database.models import User
from app.schemas.auth import PasswordUpdate


@pytest.fixture()
def session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def user(session: Session) -> User:
    row = User(username="u1", password_hash=hash_password("oldpass123"))
    session.add(row)
    session.commit()
    return row


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    """限流器是模块级单例，逐个测试清空避免相互干扰。"""
    auth_api._change_password_limiter._events.clear()


def _payload(old: str, new: str, confirm: str | None = None) -> PasswordUpdate:
    return PasswordUpdate(
        old_password=old, new_password=new, confirm_password=confirm if confirm is not None else new
    )


def test_change_password_success(session: Session, user: User) -> None:
    result = auth_api.update_password(_payload("oldpass123", "newpass456"), session, user)

    assert result == {"ok": True}
    session.refresh(user)
    assert verify_password("newpass456", user.password_hash)
    assert not verify_password("oldpass123", user.password_hash)


def test_wrong_old_password_rejected(session: Session, user: User) -> None:
    with pytest.raises(AuthError):
        auth_api.update_password(_payload("wrongpass", "newpass456"), session, user)

    session.refresh(user)
    assert verify_password("oldpass123", user.password_hash), "原密码错误时不得修改"
    assert not verify_password("newpass456", user.password_hash)


def test_mismatched_confirmation_rejected(session: Session, user: User) -> None:
    with pytest.raises(ValidationError):
        auth_api.update_password(
            _payload("oldpass123", "newpass456", "otherpass789"), session, user
        )

    session.refresh(user)
    assert verify_password("oldpass123", user.password_hash)


def test_same_as_old_password_rejected(session: Session, user: User) -> None:
    with pytest.raises(ValidationError):
        auth_api.update_password(_payload("oldpass123", "oldpass123"), session, user)


def test_short_new_password_rejected(session: Session, user: User) -> None:
    """长度校验在 schema 层，构造时即失败。"""
    with pytest.raises(ValueError):
        _payload("oldpass123", "12345")


def test_too_long_new_password_rejected() -> None:
    with pytest.raises(ValueError):
        _payload("oldpass123", "x" * 129)


def test_repeated_wrong_old_password_is_rate_limited(session: Session, user: User) -> None:
    """连续猜错原密码应触发限流，避免被用来爆破。"""
    for _ in range(5):
        with pytest.raises(AuthError):
            auth_api.update_password(_payload("nope-nope", "newpass456"), session, user)

    with pytest.raises(RateLimitError):
        auth_api.update_password(_payload("nope-nope", "newpass456"), session, user)


def test_success_clears_failure_counter(session: Session, user: User) -> None:
    """失败几次后改对，应清空计数，正常用户不被自己手误拖累。"""
    for _ in range(3):
        with pytest.raises(AuthError):
            auth_api.update_password(_payload("bad-guess", "newpass456"), session, user)

    auth_api.update_password(_payload("oldpass123", "newpass456"), session, user)
    assert auth_api._change_password_limiter._events.get(f"password:{user.id}") is None
