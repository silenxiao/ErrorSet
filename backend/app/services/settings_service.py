"""模型管理：模型列表的增删改查、启用切换，并构建当前生效的 Provider。

模型分两类：
- 私有模型：user_id 指向具体用户，origin=user 为用户自建、origin=admin 为后台分配；
- 系统模型：is_system=True 且 user_id 为 NULL，由管理后台维护，enabled 为公共开关
  （开启后所有用户可见可用）。

每用户同时只启用一个模型，记录在 user.active_model_id（系统模型是全体共享的
一行，无法在行上存每用户的启用状态）；自有模型的 enabled 列同步维护作兼容。
"""

import base64
import os
import tempfile
import time

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.database.database import SessionLocal
from app.database.models import ModelProfile, User
from app.providers.base import VisionProvider, VisionRequest
from app.providers.factory import ProviderFactory
from app.core.network_security import validate_model_base_url


def list_model_profiles(db: Session, user_id: int) -> list[ModelProfile]:
    """该用户的模型列表（自有在前、系统在后），均按创建时间倒序。"""
    own = list(
        db.scalars(
            select(ModelProfile)
            .where(ModelProfile.user_id == user_id)
            .order_by(ModelProfile.id.desc())
        )
    )
    system = list(
        db.scalars(
            select(ModelProfile)
            .where(
                ModelProfile.is_system.is_(True), ModelProfile.enabled.is_(True)
            )
            .order_by(ModelProfile.id.desc())
        )
    )
    return own + system


def get_model_profile(db: Session, profile_id: int, user_id: int) -> ModelProfile:
    row = db.get(ModelProfile, profile_id)
    if row is None or row.user_id != user_id or row.origin != "user" or row.is_system:
        raise NotFoundError("模型不存在")
    return row


def _get_enableable_profile(
    db: Session, profile_id: int, user_id: int
) -> ModelProfile:
    """启用目标：自有模型，或公共开关已开的系统模型。"""
    row = db.get(ModelProfile, profile_id)
    if row is None:
        raise NotFoundError("模型不存在")
    if row.user_id != user_id and not (row.is_system and row.enabled):
        raise NotFoundError("模型不存在")
    return row


def _validate(provider: str, base_url: str) -> None:
    if not provider.strip():
        raise ValidationError("服务商不能为空")
    if base_url.strip():
        validate_model_base_url(base_url)
    if provider.strip().lower() == "custom" and not base_url.strip():
        raise ValidationError("自定义服务商必须填写 API 地址（Base URL）")


def _set_active_model(db: Session, user_id: int, profile_id: int) -> None:
    db.execute(
        update(User).where(User.id == user_id).values(active_model_id=profile_id)
    )


def create_model_profile(db: Session, user_id: int, **kwargs) -> ModelProfile:
    """新增私有模型。enabled=True 时独占启用；该用户无私有模型时自动启用。"""
    provider = (kwargs.get("provider") or "").strip()
    base_url = (kwargs.get("base_url") or "").strip()
    _validate(provider, base_url)

    enabled = bool(kwargs.get("enabled"))
    has_own = (
        db.scalars(
            select(ModelProfile.id).where(ModelProfile.user_id == user_id).limit(1)
        ).first()
        is not None
    )
    if not enabled and not has_own:
        enabled = True
    if enabled:
        _disable_all(db, user_id)

    row = ModelProfile(
        user_id=user_id,
        name=(kwargs.get("name") or "").strip(),
        provider=provider,
        base_url=base_url,
        model=(kwargs.get("model") or "").strip(),
        api_key=(kwargs.get("api_key") or "").strip(),
        enabled=enabled,
        origin="user",
    )
    db.add(row)
    db.flush()
    if enabled:
        _set_active_model(db, user_id, row.id)
    db.commit()
    db.refresh(row)
    return row


def update_model_profile(
    db: Session, profile_id: int, user_id: int, **kwargs
) -> ModelProfile:
    """更新模型。api_key 留空表示保持不变。"""
    row = get_model_profile(db, profile_id, user_id)
    provider = (kwargs.get("provider") or "").strip()
    base_url = (kwargs.get("base_url") or "").strip()
    _validate(provider, base_url)

    row.name = (kwargs.get("name") or "").strip()
    row.provider = provider
    row.base_url = base_url
    row.model = (kwargs.get("model") or "").strip()
    api_key = (kwargs.get("api_key") or "").strip()
    if api_key:
        row.api_key = api_key
    db.commit()
    db.refresh(row)
    return row


def delete_model_profile(db: Session, profile_id: int, user_id: int) -> None:
    row = get_model_profile(db, profile_id, user_id)
    if row.id == get_active_model_id(db, user_id):
        db.execute(
            update(User)
            .where(User.id == user_id, User.active_model_id == profile_id)
            .values(active_model_id=None)
        )
    db.delete(row)
    db.commit()


def enable_model_profile(db: Session, profile_id: int, user_id: int) -> ModelProfile:
    """启用指定模型（该用户内独占：其余私有模型全部停用），可以是系统模型。"""
    row = _get_enableable_profile(db, profile_id, user_id)
    _disable_all(db, user_id)
    if row.user_id == user_id:
        row.enabled = True
    _set_active_model(db, user_id, row.id)
    db.commit()
    db.refresh(row)
    return row


def _disable_all(db: Session, user_id: int) -> None:
    for row in db.scalars(
        select(ModelProfile).where(
            ModelProfile.enabled.is_(True), ModelProfile.user_id == user_id
        )
    ):
        row.enabled = False


def get_active_model_id(db: Session, user_id: int) -> int | None:
    return db.get(User, user_id).active_model_id


def resolve_active_model_profile(
    db: Session, user_id: int
) -> ModelProfile | None:
    """该用户当前生效的模型：active_model_id 指向的模型，回落到自有 enabled 行。"""
    active_id = get_active_model_id(db, user_id)
    if active_id is not None:
        row = db.get(ModelProfile, active_id)
        if row is not None and (
            row.user_id == user_id or (row.is_system and row.enabled)
        ):
            return row
    return get_enabled_model_profile(db, user_id)


def get_enabled_model_profile(db: Session, user_id: int) -> ModelProfile | None:
    return db.scalars(
        select(ModelProfile).where(
            ModelProfile.enabled.is_(True), ModelProfile.user_id == user_id
        )
    ).first()


def get_recognition_provider(user_id: int, count_usage: bool = True) -> VisionProvider:
    """构建该用户当前生效的识别 Provider（Global 与 Local 共用）。

    优先用该用户模型列表中启用的模型；否则回落到 .env 默认配置。
    每次识别任务开始时调用，模型切换后立即生效。
    count_usage=False 时不计入系统模型调用次数（二次识别等衍生调用不计数）。
    """
    settings = get_settings()
    db = SessionLocal()
    try:
        cfg = resolve_active_model_profile(db, user_id)
        if cfg is not None:
            if cfg.is_system and count_usage:
                # 系统模型用量统计：每次识别调用 +1，仅后台用户列表展示
                db.execute(
                    update(User)
                    .where(User.id == user_id)
                    .values(system_model_calls=User.system_model_calls + 1)
                )
                db.commit()
            return _build_provider(
                cfg.provider, cfg.model, cfg.api_key, cfg.base_url, settings.global_model
            )
    finally:
        db.close()

    return ProviderFactory.create(settings.global_provider, settings.global_model, allow_env_key=True)


# ---------- 管理后台（/api/v1/admin/models） ----------


def list_system_model_profiles(db: Session) -> list[ModelProfile]:
    return list(
        db.scalars(
            select(ModelProfile)
            .where(ModelProfile.is_system.is_(True))
            .order_by(ModelProfile.id.desc())
        )
    )


def list_admin_user_model_profiles(db: Session, user_id: int) -> list[ModelProfile]:
    """后台视角的某用户模型列表：只含后台分配的（origin=admin），用户自建不展示。"""
    return list(
        db.scalars(
            select(ModelProfile)
            .where(
                ModelProfile.user_id == user_id,
                ModelProfile.origin == "admin",
                ModelProfile.is_system.is_(False),
            )
            .order_by(ModelProfile.id.desc())
        )
    )


def admin_create_model_profile(db: Session, scope: str, **kwargs) -> ModelProfile:
    """后台新增模型：scope=system 建系统模型，scope=user 分配给指定用户。"""
    provider = (kwargs.get("provider") or "").strip()
    base_url = (kwargs.get("base_url") or "").strip()
    _validate(provider, base_url)

    if scope == "system":
        row = ModelProfile(
            user_id=None,
            is_system=True,
            origin="admin",
            name=(kwargs.get("name") or "").strip(),
            provider=provider,
            base_url=base_url,
            model=(kwargs.get("model") or "").strip(),
            api_key=(kwargs.get("api_key") or "").strip(),
            enabled=bool(kwargs.get("enabled")),
        )
    else:
        user_id = kwargs.get("user_id")
        if not user_id or db.get(User, user_id) is None:
            raise NotFoundError("用户不存在")
        row = ModelProfile(
            user_id=user_id,
            is_system=False,
            origin="admin",
            name=(kwargs.get("name") or "").strip(),
            provider=provider,
            base_url=base_url,
            model=(kwargs.get("model") or "").strip(),
            api_key=(kwargs.get("api_key") or "").strip(),
            enabled=False,
        )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def admin_update_model_profile(
    db: Session, profile_id: int, **kwargs
) -> ModelProfile:
    """后台编辑模型。api_key 留空表示保持不变；系统模型的 enabled 为公共开关。"""
    row = get_admin_model_profile(db, profile_id)
    provider = (kwargs.get("provider") or "").strip()
    base_url = (kwargs.get("base_url") or "").strip()
    _validate(provider, base_url)

    row.name = (kwargs.get("name") or "").strip()
    row.provider = provider
    row.base_url = base_url
    row.model = (kwargs.get("model") or "").strip()
    api_key = (kwargs.get("api_key") or "").strip()
    if api_key:
        row.api_key = api_key
    if row.is_system and kwargs.get("enabled") is not None:
        row.enabled = bool(kwargs["enabled"])
    db.commit()
    db.refresh(row)
    return row


def admin_delete_model_profile(db: Session, profile_id: int) -> None:
    """后台删除模型；选中它的用户回落到各自的自有启用模型。"""
    row = get_admin_model_profile(db, profile_id)
    db.execute(
        update(User)
        .where(User.active_model_id == profile_id)
        .values(active_model_id=None)
    )
    db.delete(row)
    db.commit()


def get_admin_model_profile(db: Session, profile_id: int) -> ModelProfile:
    """后台仅能管理后台创建的模型，不能借 ID 访问用户自建凭据。"""
    row = db.get(ModelProfile, profile_id)
    if row is None or row.origin != "admin":
        raise NotFoundError("模型不存在")
    return row


def _build_provider(
    provider: str, model: str, api_key: str, base_url: str, fallback_model: str
) -> VisionProvider:
    name = (provider or "").strip().lower()
    if not name:
        raise ValidationError("服务商未配置")
    return ProviderFactory.create(
        name,
        (model or "").strip() or fallback_model,
        api_key=api_key or None,
        base_url=base_url or None,
        allow_env_key=False,
    )


# 连通性测试：1x1 透明 PNG + 固定提示词，走真实识别路径（含鉴权/端点/模型名校验）
_TEST_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
_TEST_PROMPT = "这是一张测试图片。请直接回复：OK"


async def test_model_profile(row: ModelProfile) -> dict:
    """向该模型发一次最小识别请求，检验配置是否可用。不抛异常，结果见 ok/error。

    注意：Provider 层异常（如缺 API Key 的 ProviderAuthError）继承自 AppError
    而非 ValidationError/ValueError，必须一并捕获，否则接口会 500 而不是
    返回「不可用 + 原因」。
    """
    settings = get_settings()
    try:
        provider = _build_provider(
            row.provider, row.model, row.api_key, row.base_url, settings.global_model
        )
    except Exception as exc:  # 构造失败同样按"不可用"返回，不中断请求
        return {"ok": False, "error": str(exc) or type(exc).__name__}

    fd, path = tempfile.mkstemp(suffix=".png")
    started = time.monotonic()
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(_TEST_PNG)
        resp = await provider.analyze(
            VisionRequest(image_path=path, prompt=_TEST_PROMPT)
        )
        return {"ok": True, "latencyMs": resp.latency_ms}
    except Exception as exc:  # Provider 层错误统一转为结果，不中断请求
        latency = int((time.monotonic() - started) * 1000)
        return {"ok": False, "error": str(exc) or type(exc).__name__, "latencyMs": latency}
    finally:
        os.unlink(path)
