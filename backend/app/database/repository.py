"""数据访问层：所有 DB 读写集中在这里，pipeline / service 不直接操作 Session。"""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database.models import (
    Exam,
    Feedback,
    Illustration,
    ModelProfile,
    Question,
    RecognitionTask,
    User,
    WrongQuestion,
)

# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------


def create_user(db: Session, *, username: str, password_hash: str) -> User:
    user = User(username=username, password_hash=password_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.scalars(select(User).where(User.username == username)).first()


# ---------------------------------------------------------------------------
# Exam
# ---------------------------------------------------------------------------


def create_exam(
    db: Session,
    *,
    user_id: int,
    name: str,
    original_image: str,
    include_illustrations: bool = True,
    grade: str = "一年级",
) -> Exam:
    exam = Exam(
        user_id=user_id,
        name=name,
        original_image=original_image,
        include_illustrations=include_illustrations,
        grade=grade,
        status="uploaded",
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def get_exam(db: Session, exam_id: int) -> Exam | None:
    return db.get(Exam, exam_id)


def list_exams(db: Session, user_id: int) -> list[Exam]:
    stmt = (
        select(Exam)
        .where(Exam.user_id == user_id)
        .order_by(Exam.created_at.desc())
    )
    return list(db.scalars(stmt))


def list_exams_by_status(db: Session, status: str) -> list[Exam]:
    """跨用户的按状态查询，仅供进程重启后的任务恢复使用。"""
    stmt = select(Exam).where(Exam.status == status)
    return list(db.scalars(stmt))


def set_exam_status(db: Session, exam: Exam, status: str) -> Exam:
    exam.status = status
    db.commit()
    db.refresh(exam)
    return exam


def set_exam_size(db: Session, exam: Exam, *, width: int, height: int) -> Exam:
    exam.width = width
    exam.height = height
    db.commit()
    db.refresh(exam)
    return exam


def list_exam_image_files(db: Session, exam_id: int) -> list[str]:
    """收集试卷识别过程产生的图片路径（task 输入图：crops/processed 等）。

    不含错题快照：错题库记录独立于试卷存在，其文件随错题自身的删除而清理。
    """
    task_images = db.scalars(
        select(RecognitionTask.input_image).where(
            RecognitionTask.exam_id == exam_id
        )
    ).all()
    return [path for path in task_images if path]


def delete_recognition_results(db: Session, exam_id: int) -> None:
    """清空一张试卷的识别结果（重新识别/删卷前调用）。

    错题库记录不受影响（§28：错题保留文本与快照，独立于试卷存在）。
    """
    db.execute(
        delete(Illustration).where(
            Illustration.question_id.in_(
                select(Question.id).where(Question.exam_id == exam_id)
            )
        )
    )
    db.execute(delete(Question).where(Question.exam_id == exam_id))
    db.execute(delete(RecognitionTask).where(RecognitionTask.exam_id == exam_id))
    db.commit()


def delete_exam(db: Session, exam: Exam) -> None:
    delete_recognition_results(db, exam.id)
    db.delete(exam)
    db.commit()


def fail_stale_processing_exams(db: Session) -> int:
    """启动恢复：进程重启导致中断的识别任务置为 failed，允许重新识别。"""
    stmt = select(Exam).where(
        Exam.status.in_(["global_processing", "local_processing"])
    )
    stale = list(db.scalars(stmt))
    for exam in stale:
        exam.status = "failed"
    if stale:
        db.commit()
    return len(stale)


def count_questions(db: Session, exam_id: int) -> int:
    stmt = select(func.count()).select_from(Question).where(Question.exam_id == exam_id)
    return int(db.scalar(stmt) or 0)


# ---------------------------------------------------------------------------
# Question / Illustration
# ---------------------------------------------------------------------------


def list_questions(db: Session, exam_id: int) -> list[Question]:
    stmt = (
        select(Question)
        .where(Question.exam_id == exam_id)
        .order_by(Question.id)
    )
    return list(db.scalars(stmt))


def get_question(db: Session, question_id: int) -> Question | None:
    return db.get(Question, question_id)


def save_questions(
    db: Session,
    exam: Exam,
    normalized: list[dict],
) -> list[Question]:
    """保存 Validator 展平后的题目（含层级 parent 关联）与插图。

    normalized 中每项：question_no / text / bbox / ai_bbox / confidence /
    illustrations / parent_no（独立题为 None）。
    """
    created: dict[str, Question] = {}
    rows: list[Question] = []

    for item in normalized:
        parent = created.get(item["parent_no"]) if item.get("parent_no") else None
        q = Question(
            exam_id=exam.id,
            parent_id=parent.id if parent else None,
            question_no=item["question_no"],
            text=item["text"],
            subject=item.get("subject", ""),
            bbox=item["bbox"],
            ai_bbox=item["ai_bbox"],
            bbox_source="ai",
            confidence=item.get("confidence"),
            status="pending_review",
        )
        db.add(q)
        rows.append(q)
        created[item["question_no"]] = q

    db.flush()  # 分配主键 id，供插图外键使用

    for item in normalized:
        q = created[item["question_no"]]
        for illus in item.get("illustrations") or []:
            bbox = illus.get("bbox", [0, 0, 0, 0])
            db.add(
                Illustration(
                    question_id=q.id,
                    bbox=bbox,
                    ai_bbox=list(bbox),
                    bbox_source="ai",
                    type=illus.get("type", "image"),
                )
            )

    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def update_question_bbox(db: Session, question: Question, bbox: list[int]) -> Question:
    question.bbox = bbox
    question.bbox_source = "manual"
    db.commit()
    db.refresh(question)
    return question


def update_question(db: Session, question: Question, **fields) -> Question:
    for name, value in fields.items():
        setattr(question, name, value)
    db.commit()
    db.refresh(question)
    return question


def reset_question_bbox(db: Session, question: Question) -> Question:
    question.bbox = list(question.ai_bbox)
    question.bbox_source = "ai"
    db.commit()
    db.refresh(question)
    return question


# ---------------------------------------------------------------------------
# Illustration
# ---------------------------------------------------------------------------


def get_illustration(db: Session, illustration_id: int) -> Illustration | None:
    return db.get(Illustration, illustration_id)


def update_illustration_bbox(
    db: Session, illustration: Illustration, bbox: list[int]
) -> Illustration:
    illustration.bbox = bbox
    illustration.bbox_source = "manual"
    db.commit()
    db.refresh(illustration)
    return illustration


def reset_illustration_bbox(db: Session, illustration: Illustration) -> Illustration:
    illustration.bbox = list(illustration.ai_bbox)
    illustration.bbox_source = "ai"
    db.commit()
    db.refresh(illustration)
    return illustration


def set_question_status(db: Session, question: Question, status: str) -> None:
    question.status = status
    db.commit()


def set_question_text(db: Session, question: Question, text: str) -> None:
    question.text = text
    db.commit()


# ---------------------------------------------------------------------------
# RecognitionTask
# ---------------------------------------------------------------------------


def create_task(db: Session, **kwargs) -> RecognitionTask:
    task = RecognitionTask(**kwargs)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def finish_task(db: Session, task: RecognitionTask, **kwargs) -> RecognitionTask:
    for key, value in kwargs.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


def list_tasks(db: Session, exam_id: int) -> list[RecognitionTask]:
    stmt = select(RecognitionTask).where(RecognitionTask.exam_id == exam_id)
    return list(db.scalars(stmt))


# ---------------------------------------------------------------------------
# WrongQuestion
# ---------------------------------------------------------------------------


def create_wrong_question(db: Session, **kwargs) -> WrongQuestion:
    row = WrongQuestion(**kwargs)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_wrong_question(db: Session, wrong_id: int) -> WrongQuestion | None:
    return db.get(WrongQuestion, wrong_id)


def increment_wrong_question_count(
    db: Session, row: WrongQuestion, *, correct: bool
) -> WrongQuestion:
    if correct:
        row.correct_count += 1
    else:
        row.wrong_count += 1
    db.commit()
    db.refresh(row)
    return row


def update_wrong_question(db: Session, row: WrongQuestion, **fields) -> WrongQuestion:
    for name, value in fields.items():
        setattr(row, name, value)
    db.commit()
    db.refresh(row)
    return row


def delete_wrong_question(db: Session, row: WrongQuestion) -> None:
    db.delete(row)
    db.commit()


def get_wrong_question_by_question(
    db: Session, question_id: int
) -> WrongQuestion | None:
    """同一题目在错题库中的现有记录（重复加入时用于替换/清理）。"""
    return db.scalars(
        select(WrongQuestion).where(WrongQuestion.question_id == question_id)
    ).first()


def list_wrong_questions(db: Session, user_id: int) -> list[WrongQuestion]:
    """错题列表：按手动排序号降序（置顶在前），同序号按创建时间降序。"""
    stmt = (
        select(WrongQuestion)
        .where(WrongQuestion.user_id == user_id)
        .order_by(WrongQuestion.sort_order.desc(), WrongQuestion.created_at.desc())
    )
    return list(db.scalars(stmt))


def wrong_question_sort_bounds(db: Session, user_id: int) -> tuple[int, int]:
    """当前错题排序号的最大/最小值，供置顶（max+1）与置底（min-1）使用。"""
    max_order = (
        db.scalar(
            select(func.max(WrongQuestion.sort_order)).where(
                WrongQuestion.user_id == user_id
            )
        )
        or 0
    )
    min_order = (
        db.scalar(
            select(func.min(WrongQuestion.sort_order)).where(
                WrongQuestion.user_id == user_id
            )
        )
        or 0
    )
    return max_order, min_order


def set_wrong_question_sort_order(
    db: Session, row: WrongQuestion, order: int
) -> WrongQuestion:
    row.sort_order = order
    db.commit()
    db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Feedback（留言板）
# ---------------------------------------------------------------------------


def create_feedback(db: Session, *, user_id: int, content: str) -> Feedback:
    row = Feedback(user_id=user_id, content=content)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_feedbacks(db: Session, user_id: int) -> list[Feedback]:
    stmt = (
        select(Feedback)
        .where(Feedback.user_id == user_id)
        .order_by(Feedback.created_at.desc())
    )
    return list(db.scalars(stmt))


# ---------------------------------------------------------------------------
# Admin（管理后台，跨用户查询）
# ---------------------------------------------------------------------------


def count_stats(db: Session) -> dict[str, int]:
    return {
        "users": db.scalar(select(func.count(User.id))) or 0,
        "exams": db.scalar(select(func.count(Exam.id))) or 0,
        "questions": db.scalar(select(func.count(Question.id))) or 0,
        "wrong_questions": db.scalar(select(func.count(WrongQuestion.id))) or 0,
    }


def user_data_counts(db: Session, user_id: int) -> tuple[int, int]:
    """单个用户的试卷数与错题数。"""
    exam_count = (
        db.scalar(select(func.count(Exam.id)).where(Exam.user_id == user_id)) or 0
    )
    wrong_count = (
        db.scalar(
            select(func.count(WrongQuestion.id)).where(
                WrongQuestion.user_id == user_id
            )
        )
        or 0
    )
    return exam_count, wrong_count


def list_users_with_counts(db: Session) -> list[dict]:
    """全部用户及各自试卷/错题数量，按注册先后排序。"""
    exam_counts = dict(
        db.execute(
            select(Exam.user_id, func.count(Exam.id)).group_by(Exam.user_id)
        ).all()
    )
    wrong_counts = dict(
        db.execute(
            select(WrongQuestion.user_id, func.count(WrongQuestion.id)).group_by(
                WrongQuestion.user_id
            )
        ).all()
    )
    return [
        {
            "user": user,
            "exam_count": exam_counts.get(user.id, 0),
            "wrong_question_count": wrong_counts.get(user.id, 0),
        }
        for user in db.scalars(select(User).order_by(User.id.asc()))
    ]


def update_user_password(db: Session, user: User, password_hash: str) -> User:
    user.password_hash = password_hash
    db.commit()
    db.refresh(user)
    return user


def set_user_admin(db: Session, user: User, is_admin: bool) -> User:
    user.is_admin = is_admin
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    """删除用户及其模型配置；试卷/错题由服务层先逐卷清理文件后删除。"""
    db.execute(delete(ModelProfile).where(ModelProfile.user_id == user.id))
    db.delete(user)
    db.commit()


def list_all_exams(db: Session) -> list[dict]:
    """跨用户试卷列表，附所属用户名与题目数。"""
    question_count = (
        select(func.count(Question.id))
        .where(Question.exam_id == Exam.id)
        .scalar_subquery()
    )
    rows = db.execute(
        select(Exam, User.username, question_count)
        .join(User, Exam.user_id == User.id)
        .order_by(Exam.created_at.desc())
    ).all()
    return [
        {"exam": row[0], "username": row[1], "question_count": row[2] or 0}
        for row in rows
    ]


def list_all_wrong_questions(db: Session) -> list[dict]:
    """跨用户错题列表，附所属用户名、来源试卷名与题干。"""
    rows = db.execute(
        select(WrongQuestion, User.username, Exam.name, Question.text)
        .join(User, WrongQuestion.user_id == User.id)
        .join(Exam, WrongQuestion.exam_id == Exam.id)
        .join(Question, WrongQuestion.question_id == Question.id)
        .order_by(WrongQuestion.created_at.desc())
    ).all()
    return [
        {
            "wrong_question": row[0],
            "username": row[1],
            "exam_name": row[2],
            "question_text": row[3],
        }
        for row in rows
    ]


def list_all_feedbacks(db: Session) -> list[dict]:
    """跨用户留言列表，附所属用户名。"""
    rows = db.execute(
        select(Feedback, User.username)
        .join(User, Feedback.user_id == User.id)
        .order_by(Feedback.created_at.desc())
    ).all()
    return [{"feedback": row[0], "username": row[1]} for row in rows]


def get_feedback(db: Session, feedback_id: int) -> Feedback | None:
    return db.get(Feedback, feedback_id)


def delete_feedback(db: Session, row: Feedback) -> None:
    db.delete(row)
    db.commit()
