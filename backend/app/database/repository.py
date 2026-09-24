"""数据访问层：所有 DB 读写集中在这里，pipeline / service 不直接操作 Session。"""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database.models import (
    Exam,
    Illustration,
    Question,
    RecognitionTask,
    WrongQuestion,
)

# ---------------------------------------------------------------------------
# Exam
# ---------------------------------------------------------------------------


def create_exam(
    db: Session,
    *,
    name: str,
    original_image: str,
    include_illustrations: bool = True,
    grade: str = "一年级",
) -> Exam:
    exam = Exam(
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


def list_exams(db: Session) -> list[Exam]:
    stmt = select(Exam).order_by(Exam.created_at.desc())
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


def delete_recognition_results(db: Session, exam_id: int) -> None:
    """清空一张试卷的全部识别结果（重新识别前调用）。"""
    db.execute(
        delete(Illustration).where(
            Illustration.question_id.in_(
                select(Question.id).where(Question.exam_id == exam_id)
            )
        )
    )
    db.execute(delete(WrongQuestion).where(WrongQuestion.exam_id == exam_id))
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


def list_wrong_questions(db: Session) -> list[WrongQuestion]:
    stmt = select(WrongQuestion).order_by(WrongQuestion.created_at.desc())
    return list(db.scalars(stmt))
