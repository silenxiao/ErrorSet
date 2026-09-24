from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.database import get_db
from app.schemas.settings import ProviderSettingOut, ProviderSettingUpdate
from app.services import settings_service

router = APIRouter(tags=["settings"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/api/v1/settings/provider", response_model=ProviderSettingOut)
def get_provider_settings(db: DbSession) -> ProviderSettingOut:
    """读取识别服务商设置（API Key 不回传）。"""
    row = settings_service.get_provider_setting(db)
    if row is None:
        return ProviderSettingOut(provider="", base_url="", model="", has_api_key=False)
    return ProviderSettingOut(
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        has_api_key=bool(row.api_key),
    )


@router.put("/api/v1/settings/provider", response_model=ProviderSettingOut)
def update_provider_settings(
    payload: ProviderSettingUpdate, db: DbSession
) -> ProviderSettingOut:
    """保存识别服务商设置，下一次识别立即生效。"""
    if not payload.provider.strip():
        from app.core.exceptions import ValidationError

        raise ValidationError("服务商不能为空")
    row = settings_service.save_provider_setting(
        db,
        provider=payload.provider,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
    )
    return ProviderSettingOut(
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        has_api_key=bool(row.api_key),
    )
