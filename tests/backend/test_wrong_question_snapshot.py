"""错题独立于试卷存活的回归测试（§28）。

用户报告：删除试卷后错题的"原题"丢了。设计上错题自带文本/插图快照，
试卷删除只清掉题目行，错题记录与快照必须原样保留、列表照常可查。
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import repository as repo
from app.database.database import Base
from app.database.models import Exam, Question, User, WrongQuestion


def make_session() -> tuple[Session, sessionmaker]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return factory(), factory


def test_wrong_question_survives_exam_deletion() -> None:
    session, factory = make_session()
    try:
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
            text="4. (分数除法) 根据如图所示的信息，一桶油重多少千克？",
            bbox=[0, 0, 10, 10],
            ai_bbox=[0, 0, 10, 10],
        )
        session.add(question)
        session.flush()
        wrong = WrongQuestion(
            user_id=user.id,
            question_id=question.id,
            question_no="4",
            question_text=question.text,
            illustration_images=["data/wrong-illustrations/a.png"],
        )
        session.add(wrong)
        session.commit()

        # 删除试卷（与 delete_exam_and_files 相同的数据路径）
        repo.delete_exam(session, exam)

        # 错题记录必须还在，且管理后台列表（题目外连接 + 快照回填）不丢行
        assert repo.get_wrong_question(session, wrong.id) is not None
        rows = repo.list_all_wrong_questions(session)
        assert len(rows) == 1
        assert rows[0]["wrong_question"].id == wrong.id
        assert rows[0]["wrong_question"].question_text == question.text
        # 题目行已随试卷删除，题干回落到错题自带快照
        assert rows[0]["question_text"] == question.text

        # 管理后台详情走同一套快照兜底，删卷后依然可读
        detail = repo.get_all_wrong_question(session, wrong.id)
        assert detail is not None
        assert detail["question_text"] == question.text
        assert detail["username"] == "u1"

        # 用户端列表同样基于快照组装，题目行已不在也不报错、不丢字段
        user_rows = repo.list_wrong_questions(session, user.id)
        assert [row.id for row in user_rows] == [wrong.id]
        assert user_rows[0].question_no == "4"
    finally:
        session.close()
