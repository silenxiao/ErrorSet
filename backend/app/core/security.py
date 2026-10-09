"""登录鉴权原语：bcrypt 密码哈希、JWT 签发/校验与内存限流。"""

import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.exceptions import ValidationError

if TYPE_CHECKING:
    from app.database.models import User


def validate_new_password(password: str) -> str:
    """新设密码统一校验；bcrypt 的限制按 UTF-8 字节数计算。"""
    if len(password) < 6:
        raise ValueError("密码至少 6 位")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("密码不能超过 72 字节（中文等字符占多个字节）")
    return password


def hash_password(password: str) -> str:
    # 防止注册/管理员重置等调用遗漏输入校验而触发 bcrypt 的 ValueError。
    try:
        validate_new_password(password)
    except ValueError as exc:
        raise ValidationError(str(exc)) from exc
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(user: "User") -> str:
    settings = get_settings()
    # 必须用 aware UTC 时间：PyJWT 把 naive datetime 当 UTC 处理，
    # 本地 naive 时间在 UTC+8 机器上会让 token 多活 8 小时
    payload = {
        "sub": str(user.id),
        "identity": user.auth_identity,
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> tuple[int, str] | None:
    """校验 token，返回数字 ID 与独立账号身份；旧格式令牌必须重新登录。"""
    try:
        payload = jwt.decode(
            token, get_settings().jwt_secret, algorithms=["HS256"],
            options={"require": ["sub", "identity", "exp"]},
        )
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    try:
        user_id = int(sub)
        identity = payload.get("identity")
        if user_id > 0 and isinstance(identity, str) and len(identity) == 32:
            return user_id, identity
        return None
    except (TypeError, ValueError):
        return None


class RateLimiter:
    """滑动窗口限流（内存版，与 §6.4 单进程部署匹配；重启即清零）。"""

    def __init__(self, max_events: int, window_seconds: float):
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """记录一次事件；窗口内超过上限时拒绝并返回 False。"""
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] > self.window_seconds:
            events.popleft()
        if len(events) >= self.max_events:
            return False
        events.append(now)
        return True

    def clear(self, key: str) -> None:
        self._events.pop(key, None)
