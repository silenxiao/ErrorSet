"""服务商运行时设置：保存/读取配置并构建当前生效的 Provider。"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.database.database import SessionLocal
from app.database.models import ProviderSetting
from app.providers.base import VisionProvider
from app.providers.factory import ProviderFactory


def get_provider_setting(db: Session) -> ProviderSetting | None:
    return db.scalars(select(ProviderSetting)).first()


def save_provider_setting(db: Session, **kwargs) -> ProviderSetting:
    """单行语义：存在则更新，api_key 留空表示保持不变。"""
    row = get_provider_setting(db)
    if row is None:
        row = ProviderSetting(id=1)
        db.add(row)
    for key in ("provider", "base_url", "model"):
        setattr(row, key, kwargs.get(key, "") or "")
    api_key = (kwargs.get("api_key") or "").strip()
    if api_key:
        row.api_key = api_key
    db.commit()
    db.refresh(row)
    return row


def get_recognition_provider() -> VisionProvider:
    """构建当前生效的识别 Provider（Global 与 Local 共用）。

    有运行时设置时用它；否则回落到 .env（PROJECT_SPEC.md §23）。
    每次识别任务开始时调用，设置保存后立即生效。
    """
    settings = get_settings()
    db = SessionLocal()
    try:
        cfg = get_provider_setting(db)
    finally:
        db.close()

    if cfg is None:
        return ProviderFactory.create(settings.global_provider, settings.global_model)

    name = (cfg.provider or "").strip().lower()
    model = (cfg.model or "").strip() or settings.global_model
    if not name:
        raise ValidationError("服务商未配置")
    if name == "custom" and not (cfg.base_url or "").strip():
        raise ValidationError("自定义服务商必须填写 API 地址（Base URL）")
    return ProviderFactory.create(
        name, model, api_key=cfg.api_key or None, base_url=cfg.base_url or None
    )
