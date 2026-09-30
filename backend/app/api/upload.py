from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.core.exceptions import UploadError
from app.database.database import get_db
from app.schemas.exam import ExamCreated
from app.services import recognition_service
from app.workers.recognition_worker import RecognitionJob, worker

router = APIRouter(tags=["exams"])

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/api/v1/exams", status_code=202, response_model=ExamCreated)
async def create_exam(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    name: str = Form(""),
    include_illustrations: bool = Form(True),
    grade: str = Form("一年级"),
) -> ExamCreated:
    """上传试卷图片，创建 Exam 并入队第一段识别（§5.1/§6.1）。

    include_illustrations：试卷是否包含插图，False 时跳过插图识别。
    """
    # 读入内存前先按声明大小拦截，避免超大请求占满内存
    if file.size is not None and file.size > get_settings().max_upload_bytes:
        raise UploadError("文件超过 10MB 限制")
    file_bytes = await file.read()
    exam = recognition_service.create_exam_from_upload(
        db,
        user_id=user.id,
        file_bytes=file_bytes,
        filename=file.filename or "",
        name=name,
        include_illustrations=include_illustrations,
        grade=grade,
    )
    worker.enqueue(RecognitionJob(exam_id=exam.id, stage="global"))
    return ExamCreated(id=exam.id, status=exam.status)
