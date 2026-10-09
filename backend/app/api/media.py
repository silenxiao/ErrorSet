"""图片下载必须经过短期签名验证及数据库资源归属检查。"""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.media_access import MEDIA_EXTENSIONS, MEDIA_SUBDIRS, normalized_media_path, verify_media_access
from app.database import repository as repo
from app.database.database import get_db
from app.database.models import Exam, RecognitionTask, WrongQuestion

router = APIRouter(tags=["media"])


def _relative_in_data(path: str) -> str | None:
    if not path:
        return None
    try:
        return normalized_media_path(path)
    except (ValueError, OSError):
        return None


def _owned_file(db: Session, user_id: int, relative: str) -> bool:
    # 原始试卷及预处理图片
    for exam in db.scalars(select(Exam).where(Exam.user_id == user_id)):
        if _relative_in_data(exam.original_image) == relative:
            return True
        # 工作图和原图使用相同 uuid stem，路径由预处理函数固定生成
        if relative == f"working/{Path(exam.original_image).stem}_processed.jpg":
            return True

    # 识别阶段生成的裁图/任务输入文件
    stmt = (
        select(RecognitionTask.input_image)
        .join(Exam, RecognitionTask.exam_id == Exam.id)
        .where(Exam.user_id == user_id)
    )
    if any(_relative_in_data(image) == relative for image in db.scalars(stmt)):
        return True

    # 错题快照不依赖原试卷，可以独立存在
    for wrong in repo.list_wrong_questions(db, user_id):
        if _relative_in_data(wrong.image) == relative:
            return True
        if any(
            _relative_in_data(image) == relative
            for image in (wrong.illustration_images or [])
        ):
            return True
    return False


@router.get("/files/{file_path:path}", include_in_schema=False)
def get_media(
    file_path: str,
    access: Annotated[str, Query()],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    # 禁止路径穿越、目录列举、数据库和非图片文件下载。
    parts = file_path.replace("\\", "/").split("/")
    if (
        len(parts) < 2
        or parts[0] not in MEDIA_SUBDIRS
        or any(part in ("", ".", "..") for part in parts)
        or Path(file_path).suffix.lower() not in MEDIA_EXTENSIONS
    ):
        raise HTTPException(404, "Not Found")
    root = Path(get_settings().data_dir).resolve()
    target = (root / file_path).resolve()
    try:
        relative = target.relative_to(root).as_posix()
    except ValueError:
        raise HTTPException(404, "Not Found") from None
    if relative != "/".join(parts):
        raise HTTPException(404, "Not Found")

    signature = verify_media_access(relative, access)
    if signature is None:
        raise HTTPException(404, "Not Found")
    viewer_id, signed_as_admin = signature
    viewer = repo.get_user(db, viewer_id)
    if viewer is None:
        raise HTTPException(404, "Not Found")
    if signed_as_admin:
        if not viewer.is_admin:
            raise HTTPException(404, "Not Found")
    elif not _owned_file(db, viewer.id, relative):
        raise HTTPException(404, "Not Found")
    if not target.is_file():
        raise HTTPException(404, "Not Found")
    return FileResponse(
        target,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        },
    )
