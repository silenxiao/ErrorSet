from typing import Annotated

from fastapi import APIRouter, Depends, Response
from fastapi.responses import Response as ImageResponse
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.exceptions import NotFoundError
from app.database import repository as repo
from app.database.database import get_db
from app.schemas.question import (
    BBoxUpdate,
    IllustrationOut,
    QuestionOut,
    QuestionUpdate,
    WrongQuestionCreate,
    WrongQuestionOut,
    WrongQuestionResult,
    WrongQuestionSort,
    WrongQuestionUpdate,
)
from app.services import question_service, recognition_service

router = APIRouter(tags=["questions"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("/api/v1/questions/{question_id}", response_model=QuestionOut)
def get_question(question_id: int, db: DbSession, user: CurrentUser) -> QuestionOut:
    """查询题目（§26）。"""
    return QuestionOut.model_validate(
        question_service.get_question_or_404(db, question_id, user.id)
    )


@router.patch("/api/v1/questions/{question_id}", response_model=QuestionOut)
def update_question(
    question_id: int, payload: QuestionUpdate, db: DbSession, user: CurrentUser
) -> QuestionOut:
    """编辑题目字段（目前支持 text），仅传入的字段会被修改。"""
    fields = payload.model_dump(by_alias=False, exclude_unset=True)
    return QuestionOut.model_validate(
        question_service.update_question_fields(db, question_id, user.id, **fields)
    )


@router.patch("/api/v1/questions/{question_id}/bbox", response_model=QuestionOut)
def update_bbox(
    question_id: int, payload: BBoxUpdate, db: DbSession, user: CurrentUser
) -> QuestionOut:
    """修改 bbox，保存后 bbox_source = manual（§13/§36）。"""
    question = question_service.update_bbox(db, question_id, user.id, payload.bbox)
    return QuestionOut.model_validate(question)


@router.post("/api/v1/questions/{question_id}/bbox/reset", response_model=QuestionOut)
def reset_bbox(question_id: int, db: DbSession, user: CurrentUser) -> QuestionOut:
    """恢复 AI bbox，bbox_source = ai（§13）。"""
    question = question_service.reset_bbox(db, question_id, user.id)
    return QuestionOut.model_validate(question)


@router.patch("/api/v1/illustrations/{illustration_id}/bbox", response_model=IllustrationOut)
def update_illustration_bbox(
    illustration_id: int, payload: BBoxUpdate, db: DbSession, user: CurrentUser
) -> IllustrationOut:
    """修改插图 bbox，保存后 bbox_source = manual。"""
    illustration = question_service.update_illustration_bbox(
        db, illustration_id, user.id, payload.bbox
    )
    return IllustrationOut.model_validate(illustration)


@router.post(
    "/api/v1/illustrations/{illustration_id}/bbox/reset",
    response_model=IllustrationOut,
)
def reset_illustration_bbox(
    illustration_id: int, db: DbSession, user: CurrentUser
) -> IllustrationOut:
    """恢复插图 AI bbox，bbox_source = ai。"""
    illustration = question_service.reset_illustration_bbox(db, illustration_id, user.id)
    return IllustrationOut.model_validate(illustration)


def _wrong_question_out(db: Session, row) -> WrongQuestionOut:
    """组装错题响应，附带来源题目的编号与文本（§28：保留文本与插图）。"""
    out = WrongQuestionOut.model_validate(row)
    out.illustration_images = [
        recognition_service.data_file_url(path)
        for path in (row.illustration_images or [])
    ]
    question = repo.get_question(db, row.question_id)
    if question is not None:
        # 文本快照优先；旧记录（快照为空）回退到实时读取
        out.question_no = row.question_no or question.question_no
        out.question_text = row.question_text or question.text
        out.illustrations = [
            IllustrationOut.model_validate(item) for item in question.illustrations
        ]
    return out


@router.post(
    "/api/v1/wrong-questions",
    response_model=WrongQuestionOut,
    status_code=201,
)
def create_wrong_question(
    payload: WrongQuestionCreate, db: DbSession, user: CurrentUser
) -> WrongQuestionOut:
    """加入错题库（§28.1）。"""
    row = question_service.create_wrong_question(
        db, user.id, **payload.model_dump(by_alias=False)
    )
    return _wrong_question_out(db, row)


@router.get("/api/v1/wrong-questions", response_model=list[WrongQuestionOut])
def list_wrong_questions(db: DbSession, user: CurrentUser) -> list[WrongQuestionOut]:
    """当前用户的错题列表（§26）。"""
    return [
        _wrong_question_out(db, row) for row in repo.list_wrong_questions(db, user.id)
    ]


@router.get("/api/v1/wrong-questions/{wrong_id}", response_model=WrongQuestionOut)
def get_wrong_question(
    wrong_id: int, db: DbSession, user: CurrentUser
) -> WrongQuestionOut:
    """错题详情（§26）。"""
    row = repo.get_wrong_question(db, wrong_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError(f"错题 {wrong_id} 不存在")
    return _wrong_question_out(db, row)


@router.patch("/api/v1/wrong-questions/{wrong_id}", response_model=WrongQuestionOut)
def update_wrong_question(
    wrong_id: int, payload: WrongQuestionUpdate, db: DbSession, user: CurrentUser
) -> WrongQuestionOut:
    """编辑错题字段（目前支持科目），仅传入的字段会被修改。"""
    fields = payload.model_dump(by_alias=False, exclude_unset=True)
    row = question_service.update_wrong_question(db, wrong_id, user.id, **fields)
    return _wrong_question_out(db, row)


@router.post(
    "/api/v1/wrong-questions/{wrong_id}/result",
    response_model=WrongQuestionOut,
)
def record_wrong_question_result(
    wrong_id: int, payload: WrongQuestionResult, db: DbSession, user: CurrentUser
) -> WrongQuestionOut:
    """做对/做错打卡：correct 使做对次数 +1，wrong 使做错次数 +1。"""
    row = question_service.record_wrong_question_result(
        db, wrong_id, user.id, payload.result
    )
    return _wrong_question_out(db, row)


@router.post(
    "/api/v1/wrong-questions/{wrong_id}/sort",
    response_model=WrongQuestionOut,
)
def sort_wrong_question(
    wrong_id: int, payload: WrongQuestionSort, db: DbSession, user: CurrentUser
) -> WrongQuestionOut:
    """置顶（top）/置底（bottom）错题，排序持久化。"""
    row = question_service.sort_wrong_question(db, wrong_id, user.id, payload.position)
    return _wrong_question_out(db, row)


@router.delete("/api/v1/wrong-questions/{wrong_id}", status_code=204)
def delete_wrong_question(
    wrong_id: int, db: DbSession, user: CurrentUser
) -> Response:
    """删除错题记录及其题图快照。"""
    question_service.delete_wrong_question(db, wrong_id, user.id)
    return Response(status_code=204)


@router.get("/api/v1/illustrations/{illustration_id}/image")
def get_illustration_image(
    illustration_id: int, db: DbSession, user: CurrentUser
) -> ImageResponse:
    """按插图当前 bbox 从原图动态裁剪 PNG（吃到人工校正后的 bbox）。"""
    data = question_service.render_illustration_image(db, illustration_id, user.id)
    return ImageResponse(content=data, media_type="image/png")


@router.get("/api/v1/questions/{question_id}/analyze")
def analyze_question(question_id: int, db: DbSession, user: CurrentUser) -> str:
    """AI 分析题目答案。"""
    return question_service.analyze_question(db, question_id, user.id)
