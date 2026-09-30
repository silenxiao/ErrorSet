from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.database import repository as repo
from app.database.database import Base
from app.database.models import Exam, Question, User


def make_session() -> tuple[Session, sessionmaker]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    return factory(), factory


def create_exam(session: Session, name: str = "test") -> Exam:
    user = User(username=f"user-{name}", password_hash="hash")
    session.add(user)
    session.flush()
    exam = Exam(
        user_id=user.id,
        name=name,
        original_image=f"/tmp/{name}.jpg",
        status="awaiting_review",
    )
    session.add(exam)
    session.commit()
    return exam


def test_only_one_request_can_claim_an_exam_stage() -> None:
    first, factory = make_session()
    exam = create_exam(first)
    second = factory()
    try:
        stale_exam = second.get(Exam, exam.id)
        assert stale_exam is not None

        assert repo.transition_exam_status(
            first,
            exam,
            expected_status="awaiting_review",
            target_status="local_processing",
        )
        assert not repo.transition_exam_status(
            second,
            stale_exam,
            expected_status="awaiting_review",
            target_status="local_processing",
        )
        assert first.get(Exam, exam.id).status == "local_processing"
    finally:
        second.close()
        first.close()


def test_exam_list_includes_question_counts() -> None:
    session, _factory = make_session()
    try:
        first = create_exam(session, "first")
        second = create_exam(session, "second")
        for number, exam in enumerate((first, first, second), start=1):
            session.add(
                Question(
                    exam_id=exam.id,
                    question_no=str(number),
                    text="question",
                    bbox=[0, 0, 10, 10],
                    ai_bbox=[0, 0, 10, 10],
                )
            )
        session.commit()

        rows = repo.list_exams_with_question_counts(session, first.user_id)

        assert [(exam.name, count) for exam, count in rows] == [("first", 2)]
        assert repo.list_exams_with_question_counts(session, second.user_id)[0][1] == 1
    finally:
        session.close()
