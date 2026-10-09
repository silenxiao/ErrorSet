"""错题详情响应组装的回归测试（§28）。

背景：前端错题详情浮窗原先在挂载时无条件再拉一次实时题目
（GET /api/v1/questions/{id}），但 §28 的入库快照已经带回了原文与插图，
那次请求的结果实际从未被渲染——现在改为「快照为空才兜底」。

因此这里锁定前端守卫所依赖的契约：只要题目行还在，列表接口返回的
questionText / illustrationImages 必须已经齐备，前端才敢跳过兜底请求。
"""

from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.questions import _wrong_question_out
from app.core.config import get_settings
from app.core.media_access import verify_media_access
from app.database.database import Base
from app.database.models import Exam, Question, User, WrongQuestion


def make_session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return factory()


def _seed(session: Session, *, question_text: str = "", question_no: str = "") -> WrongQuestion:
    """建一条"题目行还在"的错题记录，文本/编号快照可按需留空。"""
    user = User(username="u1", password_hash="hash")
    session.add(user)
    session.flush()

    exam = Exam(
        user_id=user.id,
        name="月考卷",
        original_image="data/originals/x.jpg",
        status="completed",
    )
    session.add(exam)
    session.flush()

    question = Question(
        exam_id=exam.id,
        question_no="4",
        text="4. 实时题目原文",
        bbox=[0, 0, 10, 10],
        ai_bbox=[0, 0, 10, 10],
    )
    session.add(question)
    session.flush()

    # 快照路径放在 data_dir 内，保证能转成预期的 /files URL
    snapshot = Path(get_settings().data_dir) / "wrong-illustrations" / "a.png"
    wrong = WrongQuestion(
        user_id=user.id,
        question_id=question.id,
        question_no=question_no,
        question_text=question_text,
        illustration_images=[str(snapshot)],
    )
    session.add(wrong)
    session.commit()
    return wrong


def test_snapshot_fields_are_populated_for_frontend_guard() -> None:
    """快照齐全时，响应必须自带原文与插图 URL——前端据此跳过兜底请求。"""
    session = make_session()
    try:
        wrong = _seed(session, question_text="4. 快照原文", question_no="4")
        out = _wrong_question_out(session, wrong)
        dumped = out.model_dump(by_alias=True)

        # 前端守卫读的就是 camelCase 的 questionText
        assert dumped["questionText"] == "4. 快照原文"
        assert dumped["questionNo"] == "4"
        assert len(dumped["illustrationImages"]) == 1
        parts = urlsplit(dumped["illustrationImages"][0])
        assert parts.path == "/files/wrong-illustrations/a.png"
        assert verify_media_access("wrong-illustrations/a.png", parse_qs(parts.query)["access"][0]) == (wrong.user_id, False)
        # 快照优先：不再回退实时题目文本
        assert dumped["questionText"] != "4. 实时题目原文"
    finally:
        session.close()


def test_snapshot_takes_priority_over_live_question_text() -> None:
    """快照与实时文本不一致时，以快照为准（试卷删除后原文仍可读）。"""
    session = make_session()
    try:
        wrong = _seed(session, question_text="入库时的原文")
        out = _wrong_question_out(session, wrong)
        assert out.question_text == "入库时的原文"
    finally:
        session.close()


def test_legacy_row_without_snapshot_falls_back_to_live_question() -> None:
    """迁移前旧记录快照为空：兜底回退实时题目，前端守卫会正常发起请求。"""
    session = make_session()
    try:
        wrong = _seed(session, question_text="", question_no="")
        out = _wrong_question_out(session, wrong)

        assert out.question_text == "4. 实时题目原文"
        assert out.question_no == "4"
        # 前端守卫按 questionText 真值判断，此路径必须为假才会触发兜底
        assert out.model_dump(by_alias=True)["questionText"]
    finally:
        session.close()
