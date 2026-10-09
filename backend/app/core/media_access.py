"""短时效图片访问凭据。签名与登录 JWT 用不同的派生密钥。"""

import hashlib
import hmac
import time
from pathlib import Path
from urllib.parse import quote

import jwt

from app.core.config import get_settings

MEDIA_TTL_SECONDS = 15 * 60
MEDIA_SUBDIRS = frozenset({"originals", "working", "crops", "wrong", "wrong-illustrations"})
MEDIA_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".webp"})


def normalized_media_path(path: str) -> str:
    """将 DB 中的绝对/相对路径规范化为 data_dir 下的相对路径。"""
    root = Path(get_settings().data_dir).resolve()
    item = Path(path)
    if not item.is_absolute():
        item = Path.cwd() / item
    relative = item.resolve().relative_to(root)
    if not relative.parts or relative.parts[0] not in MEDIA_SUBDIRS:
        raise ValueError("不允许访问非图片目录")
    if relative.suffix.lower() not in MEDIA_EXTENSIONS:
        raise ValueError("不允许访问非图片类型")
    return relative.as_posix()


def _media_key() -> bytes:
    secret = get_settings().jwt_secret.encode("utf-8")
    return hmac.new(secret, b"ErrorSet/media/v1", hashlib.sha256).digest()


def signed_media_url(path: str, *, viewer_id: int, admin: bool = False) -> str:
    """只能由已鉴权 API 针对其获准返回的图片调用；禁止直接暴露任意路径签发接口。"""
    if not path:
        return ""
    relative = normalized_media_path(path)
    token = _sign_access(relative, viewer_id=viewer_id, admin=admin)
    return f"/files/{quote(relative, safe='/')}?access={quote(token, safe='')}"


def _sign_access(resource: str, *, viewer_id: int, admin: bool = False) -> str:
    payload = {
        "sub": str(viewer_id),
        "file": resource,
        "scope": "admin" if admin else "owner",
        "aud": "errorset-media",
        "exp": int(time.time()) + MEDIA_TTL_SECONDS,
    }
    return jwt.encode(payload, _media_key(), algorithm="HS256")


def signed_illustration_url(illustration_id: int, *, viewer_id: int) -> str:
    """动态裁图凭据绑定插图 ID；和磁盘文件凭据不能互换。"""
    token = _sign_access(f"illustrations/{illustration_id}", viewer_id=viewer_id)
    return f"/api/v1/illustrations/{illustration_id}/image?access={quote(token, safe='')}"


def verify_media_access(relative: str, access: str) -> tuple[int, bool] | None:
    """拒绝失效、篡改、错误用途、路径不匹配的签名。"""
    try:
        data = jwt.decode(
            access,
            _media_key(),
            algorithms=["HS256"],
            audience="errorset-media",
            options={"require": ["sub", "file", "scope", "exp"]},
        )
        if data["file"] != relative or data["scope"] not in ("owner", "admin"):
            return None
        viewer_id = int(data["sub"])
        return (viewer_id, data["scope"] == "admin") if viewer_id > 0 else None
    except (jwt.PyJWTError, TypeError, ValueError, KeyError):
        return None
