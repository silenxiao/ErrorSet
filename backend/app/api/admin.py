"""管理后台接口（/api/v1/admin）：全部要求管理员身份（AdminUser）。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.deps import AdminUser
from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import hash_password
from app.database import repository as repo
from app.database.database import get_db
from app.database.models import User
from app.schemas.admin import (
    AdminExamOut,
    AdminFeedbackOut,
    AdminStatsOut,
    AdminUserOut,
    AdminUserUpdate,
    AdminWrongQuestionOut,
)
from app.services import question_service, recognition_service

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

DbSession = Annotated[Session, Depends(get_db)]


def _user_out(db: Session, user: User) -> AdminUserOut:
    exam_count, wrong_count = repo.user_data_counts(db, user.id)
    return AdminUserOut(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        exam_count=exam_count,
        wrong_question_count=wrong_count,
        created_at=user.created_at,
    )


@router.get("/stats", response_model=AdminStatsOut)
def stats(db: DbSession, _admin: AdminUser) -> AdminStatsOut:
    counts = repo.count_stats(db)
    return AdminStatsOut(
        user_count=counts["users"],
        exam_count=counts["exams"],
        question_count=counts["questions"],
        wrong_question_count=counts["wrong_questions"],
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: DbSession, _admin: AdminUser) -> list[AdminUserOut]:
    return [
        AdminUserOut(
            id=row["user"].id,
            username=row["user"].username,
            is_admin=row["user"].is_admin,
            exam_count=row["exam_count"],
            wrong_question_count=row["wrong_question_count"],
            created_at=row["user"].created_at,
        )
        for row in repo.list_users_with_counts(db)
    ]


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int, payload: AdminUserUpdate, db: DbSession, admin: AdminUser
) -> AdminUserOut:
    """重置密码 / 设·撤管理员。禁止撤销自己的管理员身份，防锁死。"""
    user = repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("用户不存在")
    if payload.password is not None:
        if len(payload.password) < 6:
            raise ValidationError("密码至少 6 位")
        repo.update_user_password(db, user, hash_password(payload.password))
    if payload.is_admin is not None:
        if user.id == admin.id and not payload.is_admin:
            raise ValidationError("不能撤销自己的管理员身份")
        repo.set_user_admin(db, user, payload.is_admin)
    return _user_out(db, user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: DbSession, admin: AdminUser) -> Response:
    """删除用户及其全部数据：逐卷清理图片与关联记录、清空错题，再删模型配置与账号。"""
    if user_id == admin.id:
        raise ValidationError("不能删除当前登录的账号")
    user = repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("用户不存在")
    for exam in repo.list_exams(db, user_id):
        recognition_service.delete_exam_and_files(db, exam.id, user_id)
    # 删卷不再连带错题，这里显式清空该用户的错题库
    question_service.delete_user_wrong_questions(db, user_id)
    repo.delete_user(db, user)
    return Response(status_code=204)


@router.get("/exams", response_model=list[AdminExamOut])
def list_exams(db: DbSession, _admin: AdminUser) -> list[AdminExamOut]:
    return [
        AdminExamOut(
            id=row["exam"].id,
            name=row["exam"].name,
            status=row["exam"].status,
            username=row["username"],
            question_count=row["question_count"],
            original_image=row["exam"].original_image,
            created_at=row["exam"].created_at,
        )
        for row in repo.list_all_exams(db)
    ]


@router.delete("/exams/{exam_id}", status_code=204)
def delete_exam(exam_id: int, db: DbSession, _admin: AdminUser) -> Response:
    exam = repo.get_exam(db, exam_id)
    if exam is None:
        raise NotFoundError("试卷不存在")
    recognition_service.delete_exam_and_files(db, exam_id, exam.user_id)
    return Response(status_code=204)


@router.get("/wrong-questions", response_model=list[AdminWrongQuestionOut])
def list_wrong_questions(
    db: DbSession, _admin: AdminUser
) -> list[AdminWrongQuestionOut]:
    return [
        AdminWrongQuestionOut(
            id=row["wrong_question"].id,
            username=row["username"],
            exam_name=row["exam_name"],
            subject=row["wrong_question"].subject,
            question_text=row["question_text"],
            wrong_reason=row["wrong_question"].wrong_reason,
            image=row["wrong_question"].image,
            created_at=row["wrong_question"].created_at,
        )
        for row in repo.list_all_wrong_questions(db)
    ]


@router.delete("/wrong-questions/{wrong_id}", status_code=204)
def delete_wrong_question(wrong_id: int, db: DbSession, _admin: AdminUser) -> Response:
    row = repo.get_wrong_question(db, wrong_id)
    if row is None:
        raise NotFoundError("错题不存在")
    question_service.delete_wrong_question(db, wrong_id, row.user_id)
    return Response(status_code=204)


@router.get("/feedbacks", response_model=list[AdminFeedbackOut])
def list_feedbacks(db: DbSession, _admin: AdminUser) -> list[AdminFeedbackOut]:
    return [
        AdminFeedbackOut(
            id=row["feedback"].id,
            username=row["username"],
            content=row["feedback"].content,
            created_at=row["feedback"].created_at,
        )
        for row in repo.list_all_feedbacks(db)
    ]


@router.delete("/feedbacks/{feedback_id}", status_code=204)
def delete_feedback(feedback_id: int, db: DbSession, _admin: AdminUser) -> Response:
    row = repo.get_feedback(db, feedback_id)
    if row is None:
        raise NotFoundError("留言不存在")
    repo.delete_feedback(db, row)
    return Response(status_code=204)
