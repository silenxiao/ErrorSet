"""模型管理：模型列表的增删改查、启用切换，并构建当前生效的 Provider。"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.database.database import SessionLocal
from app.database.models import ModelProfile, ProviderSetting
from app.providers.base import VisionProvider
from app.providers.factory import ProviderFactory


def list_model_profiles(db: Session) -> list[ModelProfile]:
    """启用的排最前，其余按创建时间倒序。"""
    return list(
        db.scalars(
            select(ModelProfile).order_by(
                ModelProfile.enabled.desc(), ModelProfile.id.desc()
            )
        )
    )


def get_model_profile(db: Session, profile_id: int) -> ModelProfile:
    row = db.get(ModelProfile, profile_id)
    if row is None:
        raise NotFoundError("模型不存在")
    return row


def _validate(provider: str, base_url: str) -> None:
    if not provider.strip():
        raise ValidationError("服务商不能为空")
    if provider.strip().lower() == "custom" and not base_url.strip():
        raise ValidationError("自定义服务商必须填写 API 地址（Base URL）")


def create_model_profile(db: Session, **kwargs) -> ModelProfile:
    """新增模型。enabled=True 时独占启用；列表为空时自动启用。"""
    provider = (kwargs.get("provider") or "").strip()
    base_url = (kwargs.get("base_url") or "").strip()
    _validate(provider, base_url)

    enabled = bool(kwargs.get("enabled"))
    if not enabled and len(list_model_profiles(db)) == 0:
        enabled = True
    if enabled:
        _disable_all(db)

    row = ModelProfile(
        name=(kwargs.get("name") or "").strip(),
        provider=provider,
        base_url=base_url,
        model=(kwargs.get("model") or "").strip(),
        api_key=(kwargs.get("api_key") or "").strip(),
        enabled=enabled,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_model_profile(db: Session, profile_id: int, **kwargs) -> ModelProfile:
    """更新模型。api_key 留空表示保持不变。"""
    row = get_model_profile(db, profile_id)
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


def delete_model_profile(db: Session, profile_id: int) -> None:
    row = get_model_profile(db, profile_id)
    db.delete(row)
    db.commit()


def enable_model_profile(db: Session, profile_id: int) -> ModelProfile:
    """启用指定模型（独占：其余全部停用）。"""
    row = get_model_profile(db, profile_id)
    _disable_all(db)
    row.enabled = True
    db.commit()
    db.refresh(row)
    return row


def _disable_all(db: Session) -> None:
    for row in db.scalars(select(ModelProfile).where(ModelProfile.enabled.is_(True))):
        row.enabled = False


def get_enabled_model_profile(db: Session) -> ModelProfile | None:
    return db.scalars(
        select(ModelProfile).where(ModelProfile.enabled.is_(True))
    ).first()


def get_recognition_provider() -> VisionProvider:
    """构建当前生效的识别 Provider（Global 与 Local 共用）。

    优先用模型列表中启用的模型；否则回落到旧的单行设置 / .env。
    每次识别任务开始时调用，模型切换后立即生效。
    """
    settings = get_settings()
    db = SessionLocal()
    try:
        cfg = get_enabled_model_profile(db)
        if cfg is not None:
            return _build_provider(
                cfg.provider, cfg.model, cfg.api_key, cfg.base_url, settings.global_model
            )
        legacy = db.scalars(select(ProviderSetting)).first()
        if legacy is not None:
            return _build_provider(
                legacy.provider, legacy.model, legacy.api_key, legacy.base_url,
                settings.global_model,
            )
    finally:
        db.close()

    return ProviderFactory.create(settings.global_provider, settings.global_model)


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
    )
