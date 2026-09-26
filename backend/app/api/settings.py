from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.database.database import get_db
from app.schemas.settings import (
    ModelProfileCreate,
    ModelProfileOut,
    ModelProfileUpdate,
)
from app.services import settings_service

router = APIRouter(tags=["settings"])

DbSession = Annotated[Session, Depends(get_db)]


def _to_out(row) -> ModelProfileOut:
    return ModelProfileOut(
        id=row.id,
        name=row.name,
        provider=row.provider,
        base_url=row.base_url,
        model=row.model,
        has_api_key=bool(row.api_key),
        enabled=row.enabled,
    )


@router.get("/api/v1/settings/models", response_model=list[ModelProfileOut])
def list_models(db: DbSession, user: CurrentUser) -> list[ModelProfileOut]:
    """当前用户的模型列表（启用的排最前）。API Key 不回传。"""
    return [_to_out(row) for row in settings_service.list_model_profiles(db, user.id)]


@router.post("/api/v1/settings/models", response_model=ModelProfileOut)
def create_model(payload: ModelProfileCreate, db: DbSession, user: CurrentUser) -> ModelProfileOut:
    """添加模型，下一次识别立即生效。"""
    row = settings_service.create_model_profile(
        db,
        user_id=user.id,
        name=payload.name,
        provider=payload.provider,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
        enabled=payload.enabled,
    )
    return _to_out(row)


@router.put("/api/v1/settings/models/{profile_id}", response_model=ModelProfileOut)
def update_model(
    profile_id: int, payload: ModelProfileUpdate, db: DbSession, user: CurrentUser
) -> ModelProfileOut:
    """更新模型，api_key 留空表示保持不变。"""
    row = settings_service.update_model_profile(
        db,
        profile_id,
        user_id=user.id,
        name=payload.name,
        provider=payload.provider,
        base_url=payload.base_url,
        model=payload.model,
        api_key=payload.api_key,
    )
    return _to_out(row)


@router.put("/api/v1/settings/models/{profile_id}/enable", response_model=ModelProfileOut)
def enable_model(profile_id: int, db: DbSession, user: CurrentUser) -> ModelProfileOut:
    """启用指定模型（独占，其余停用），下一次识别立即生效。"""
    return _to_out(settings_service.enable_model_profile(db, profile_id, user.id))


@router.delete("/api/v1/settings/models/{profile_id}", response_model=dict)
def delete_model(profile_id: int, db: DbSession, user: CurrentUser) -> dict:
    settings_service.delete_model_profile(db, profile_id, user.id)
    return {"ok": True}
