"""管理后台错题详情接口的回归测试。

对应需求：错题表移除「错因」与「来源试卷」两列，管理后台改为点击题干
查看该题详情（含原题快照图、原文、正确答案、AI 分析、知识点）。

因此这里锁定两件事：
1. 响应结构（camelCase）供管理后台直接消费，且不再包含 examName/wrongReason；
2. 数据库模型确实已移除这两个字段，防止被人改回去。
"""

from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.admin import get_wrong_question_detail
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.media_access import verify_media_access
from app.database.database import Base
from app.database.models import Exam, Question, User, WrongQuestion


def make_session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return factory()


def _seed(session: Session) -> WrongQuestion:
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

    data_dir = Path(get_settings().data_dir)
    wrong = WrongQuestion(
        user_id=user.id,
        question_id=question.id,
        question_no="4",
        question_text="4. 入库时的题目原文",
        correct_answer="12 千克",
        analysis="先通分再相减。",
        knowledge_points=["分数减法", "单位换算"],
        note="课上讲过",
        image=str(data_dir / "wrong" / "snap.png"),
        illustration_images=[str(data_dir / "wrong-illustrations" / "a.png")],
    )
    session.add(wrong)
    session.commit()
    return wrong


def test_legacy_columns_are_gone_from_model() -> None:
    """exam_id / wrong_reason 必须已从模型移除（防止改回）。"""
    assert not hasattr(WrongQuestion, "exam_id")
    assert not hasattr(WrongQuestion, "wrong_reason")


def test_detail_returns_expected_camel_case_shape() -> None:
    session = make_session()
    try:
        wrong = _seed(session)
        out = get_wrong_question_detail(wrong.id, session, SimpleNamespace(id=1))
        dumped = out.model_dump(by_alias=True)

        # 管理后台直接读这些 camelCase 字段
        assert dumped["id"] == wrong.id
        assert dumped["username"] == "u1"
        assert dumped["questionNo"] == "4"
        assert dumped["subject"] == ""
        assert dumped["questionText"] == "4. 入库时的题目原文"
        assert dumped["correctAnswer"] == "12 千克"
        assert dumped["analysis"] == "先通分再相减。"
        assert dumped["knowledgePoints"] == ["分数减法", "单位换算"]
        assert dumped["note"] == "课上讲过"
        # 路径转成 /files 静态 URL 后回传，不暴露文件系统路径
        for url, path in [(dumped["imageUrl"], "wrong/snap.png"),
                          (dumped["illustrationImages"][0], "wrong-illustrations/a.png")]:
            parts = urlsplit(url)
            assert parts.path == f"/files/{path}"
            assert verify_media_access(path, parse_qs(parts.query)["access"][0]) == (1, True)
        assert dumped["createdAt"]

        # 已删除的两项不得再出现在响应里
        assert "examName" not in dumped
        assert "wrongReason" not in dumped
    finally:
        session.close()


def test_detail_falls_back_to_live_question_text() -> None:
    """旧记录未存原文快照时，题干回退实时题目。"""
    session = make_session()
    try:
        wrong = _seed(session)
        wrong.question_text = ""
        session.commit()

        out = get_wrong_question_detail(wrong.id, session, SimpleNamespace(id=1))
        assert out.question_text == "4. 实时题目原文"
    finally:
        session.close()


def test_detail_404_for_missing_row() -> None:
    session = make_session()
    try:
        with pytest.raises(NotFoundError):
            get_wrong_question_detail(12345, session, None)
    finally:
        session.close()


def test_detail_survives_deleted_question_row() -> None:
    """题目行被删（试卷删除）后详情仍可读，靠错题自带快照。"""
    from app.database import repository as repo

    session = make_session()
    try:
        wrong = _seed(session)
        question = session.get(Question, wrong.question_id)
        repo.delete_exam(session, session.get(Exam, question.exam_id))

        out = get_wrong_question_detail(wrong.id, session, SimpleNamespace(id=1))
        assert out.question_text == "4. 入库时的题目原文"
    finally:
        session.close()
