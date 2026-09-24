from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import repository as repo
from app.database.database import get_db
from app.schemas.exam import ExamCreated, ExamDetail, ExamListItem, ReRecognizeRequest
from app.schemas.question import QuestionOut
from app.services import recognition_service
from app.workers.recognition_worker import RecognitionJob, worker

router = APIRouter(tags=["exams"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/api/v1/exams", response_model=list[ExamListItem])
def list_exams(db: DbSession) -> list[ExamListItem]:
    """试卷列表（§26），按创建时间倒序。"""
    items = []
    for exam in repo.list_exams(db):
        items.append(
            ExamListItem(
                id=exam.id,
                name=exam.name,
                status=exam.status,
                created_at=exam.created_at,
                question_count=repo.count_questions(db, exam.id),
            )
        )
    return items


@router.get("/api/v1/exams/{exam_id}", response_model=ExamDetail)
def get_exam(exam_id: int, db: DbSession) -> ExamDetail:
    """查询试卷与题目（§26）。"""
    exam = recognition_service.get_exam_or_404(db, exam_id)
    questions = [
        QuestionOut.model_validate(q)
        for q in repo.list_questions(db, exam.id)
    ]
    return ExamDetail(
        id=exam.id,
        name=exam.name,
        status=exam.status,
        created_at=exam.created_at,
        image_url=recognition_service.exam_image_url(exam),
        include_illustrations=exam.include_illustrations,
        grade=exam.grade,
        extra_prompt=exam.extra_prompt,
        questions=questions,
    )


@router.post("/api/v1/exams/{exam_id}/confirm", response_model=ExamCreated)
def confirm_exam(exam_id: int, db: DbSession) -> ExamCreated:
    """人工确认，触发第二段识别（§11.5/§6.2）。"""
    exam = recognition_service.confirm_exam(db, exam_id)
    worker.enqueue(RecognitionJob(exam_id=exam.id, stage="local"))
    return ExamCreated(id=exam.id, status="local_processing")


@router.post("/api/v1/exams/{exam_id}/re-recognize", response_model=ExamCreated)
def rerecognize_exam(
    exam_id: int,
    db: DbSession,
    body: ReRecognizeRequest | None = None,
    include_illustrations: bool | None = None,
) -> ExamCreated:
    """清除结果并重新识别（§26）。

    请求体（camelCase，均可选）：include_illustrations 本次识别是否包含插图，
    缺省沿用试卷已有设置；extra_prompt 用户补充提示词，拼入两段识别的提示词，
    空白字符串清除。include_illustrations 保留查询参数用法以兼容旧调用，
    请求体优先。
    """
    if body is not None and body.include_illustrations is not None:
        include_illustrations = body.include_illustrations
    extra_prompt = body.extra_prompt if body is not None else None
    exam = recognition_service.rerecognize_exam(
        db, exam_id, include_illustrations, extra_prompt
    )
    worker.enqueue(RecognitionJob(exam_id=exam.id, stage="global"))
    return ExamCreated(id=exam.id, status=exam.status)


@router.delete("/api/v1/exams/{exam_id}", status_code=204)
def delete_exam(exam_id: int, db: DbSession) -> Response:
    """删除试卷及关联数据与图片文件（§26）。"""
    recognition_service.delete_exam_and_files(db, exam_id)
    return Response(status_code=204)
