"""启动权限、令牌撤销、二次识别排队、重复题号和原子打卡。"""

from dataclasses import asdict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api import auth, recognition
from app.core.config import get_settings
from app.core.security import RateLimiter, create_token, hash_password
from app.database import database, repository as repo
from app.database.database import Base, get_db
from app.database.models import Exam, Question, User, WrongQuestion
from app.main import create_app
from app.pipeline import orchestrator
from app.pipeline.validator import normalize_global
from app.workers.recognition_worker import RecognitionWorker


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "data_dir", str(tmp_path))
    monkeypatch.setattr(auth, "_login_limiter", RateLimiter(100, 300))
    monkeypatch.setattr(auth, "_change_password_limiter", RateLimiter(100, 300))
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    with factory() as db:
        admin = User(username="admin", password_hash=hash_password("oldpass123"), is_admin=True)
        user = User(username="user", password_hash=hash_password("oldpass123"))
        db.add_all([admin, user])
        db.commit()
        exam = repo.create_exam(db, user_id=user.id, name="private",
                                original_image=str(tmp_path / "originals" / "private.png"))
        repo.set_exam_status(db, exam, "awaiting_review")
        question = Question(exam_id=exam.id, question_no="1", text="This question contains enough text.",
                            bbox=[0, 0, 500, 500], ai_bbox=[0, 0, 500, 500], confidence=1)
        db.add(question)
        db.commit()
        wrong = repo.create_wrong_question(db, user_id=user.id, question_id=question.id)
        app = create_app()
        def isolated_db():
            with factory() as request_db:
                yield request_db
        app.dependency_overrides[get_db] = isolated_db
        yield db, TestClient(app), admin, user, exam, wrong, factory
    engine.dispose()


def headers(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def test_restart_does_not_promote_existing_users(isolated, monkeypatch):
    db, _, admin, user, _, _, factory = isolated
    repo.set_user_admin(db, admin, False)
    identities = {u.id: u.auth_identity for u in (admin, user)}
    monkeypatch.setattr(database, "SessionLocal", factory)
    database._seed_default_user()
    database._seed_default_user()
    with factory() as persisted:
        users = list(persisted.scalars(select(User)))
        assert len(users) == 2
        assert not any(u.is_admin for u in users)
        assert {u.id: u.auth_identity for u in users} == identities


def test_empty_database_seeds_exactly_one_admin(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(database, "SessionLocal", factory)
    database._seed_default_user()
    database._seed_default_user()
    with factory() as db:
        users = list(db.scalars(select(User)))
        assert len(users) == 1
        assert users[0].is_admin
        assert users[0].username == get_settings().seed_admin_username
    engine.dispose()


@pytest.mark.parametrize("admin_reset", [False, True])
def test_password_changes_revoke_all_old_tokens_and_new_login_works(isolated, admin_reset):
    db, client, admin, user, _, _, _ = isolated
    old_headers = [headers(user), headers(user)]
    old_identity = user.auth_identity
    if admin_reset:
        response = client.patch(f"/api/v1/admin/users/{user.id}", headers=headers(admin), json={"password": "newpass456"})
    else:
        response = client.put("/api/v1/auth/me/password", headers=old_headers[0],
                              json={"oldPassword": "oldpass123", "newPassword": "newpass456", "confirmPassword": "newpass456"})
    assert response.status_code == 200
    db.refresh(user)
    assert user.auth_identity != old_identity
    for old in old_headers:
        assert client.get("/api/v1/auth/me", headers=old).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "user", "password": "oldpass123"}).status_code == 401
    login = client.post("/api/v1/auth/login", json={"username": "user", "password": "newpass456"})
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login.json()['token']}"}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers(admin)).status_code == 200


def test_failed_password_change_does_not_revoke_token(isolated):
    db, client, _, user, _, _, _ = isolated
    original = user.auth_identity
    old = headers(user)
    result = client.put("/api/v1/auth/me/password", headers=old,
                        json={"oldPassword": "incorrect", "newPassword": "newpass456", "confirmPassword": "newpass456"})
    assert result.status_code == 401
    db.refresh(user)
    assert user.auth_identity == original
    assert client.get("/api/v1/auth/me", headers=old).status_code == 200


def test_confirmation_persists_queue_state_and_rejects_duplicate_actions(isolated, monkeypatch):
    _, client, _, user, exam, _, _ = isolated
    queue = RecognitionWorker()  # 不启动消费，模拟 worker 忙于另一张试卷。
    monkeypatch.setattr(recognition, "worker", queue)
    result = client.post(f"/api/v1/exams/{exam.id}/confirm", headers=headers(user))
    assert result.status_code == 200
    assert result.json()["status"] == "local_queued"
    assert queue.queue.qsize() == 1
    detail = client.get(f"/api/v1/exams/{exam.id}", headers=headers(user))
    assert detail.json()["status"] == "local_queued"
    assert client.post(f"/api/v1/exams/{exam.id}/confirm", headers=headers(user)).status_code == 409
    assert client.post(f"/api/v1/exams/{exam.id}/re-recognize", headers=headers(user)).status_code == 409
    assert queue.queue.qsize() == 1


@pytest.mark.asyncio
async def test_worker_claims_queued_local_job_once(isolated, monkeypatch):
    db, _, _, _, exam, _, factory = isolated
    repo.set_exam_status(db, exam, "local_queued")
    monkeypatch.setattr(orchestrator, "SessionLocal", factory)
    calls = []
    def provider(user_id):
        calls.append(user_id)
        return object()  # 非可疑题无需实际调用模型。
    monkeypatch.setattr(orchestrator, "get_recognition_provider", provider)
    pipeline = orchestrator.RecognitionPipeline()
    await pipeline.run_local(exam.id)
    await pipeline.run_local(exam.id)
    db.refresh(exam)
    assert exam.status == "completed"
    assert calls == [exam.user_id]


@pytest.mark.asyncio
async def test_restart_recovers_queued_local_jobs(isolated, monkeypatch):
    import app.main as main
    from unittest.mock import AsyncMock

    db, _, _, _, exam, _, factory = isolated
    repo.set_exam_status(db, exam, "local_queued")
    class FakeWorker:
        def __init__(self):
            self.started = False
            self.jobs = []
        def start(self):
            self.started = True
        def enqueue(self, job):
            assert self.started
            self.jobs.append(job)
        async def stop(self):
            self.started = False
    fake = FakeWorker()
    monkeypatch.setattr(main, "worker", fake)
    monkeypatch.setattr(main, "SessionLocal", factory)
    monkeypatch.setattr(main, "init_db", lambda: None)
    monkeypatch.setattr(main, "setup_logging", lambda: None)
    monkeypatch.setattr(main, "close_http_client", AsyncMock())
    async with main.lifespan(create_app()):
        assert [(job.exam_id, job.stage) for job in fake.jobs] == [(exam.id, "local")]


@pytest.mark.parametrize("number", ["1", ""])
def test_duplicate_or_missing_numbers_preserve_exact_tree_structure(isolated, number):
    db, _, _, _, exam, _, factory = isolated
    def node(text, children=None):
        return {"question_no": number, "text": text, "bbox": [0, 0, 500, 500], "sub_questions": children or []}
    normalized = normalize_global({"questions": [
        node("root A", [node("child A", [node("grandchild A")]), node("sibling A")]),
        node("root B", [node("child B")]),
    ]})
    saved = repo.save_questions(db, exam, [asdict(q) for q in normalized])
    ids = {q.text: q.id for q in saved}
    expected = {"root A": None, "child A": ids["root A"], "grandchild A": ids["child A"],
                "sibling A": ids["root A"], "root B": None, "child B": ids["root B"]}
    with factory() as persisted:
        rows = [persisted.get(Question, q.id) for q in saved]
        assert {q.text: q.parent_id for q in rows} == expected
        assert all(q.parent_id != q.id for q in rows)


@pytest.mark.parametrize("correct", [False, True])
def test_concurrent_stale_checkins_are_both_counted(isolated, correct):
    db, _, _, _, _, wrong, factory = isolated
    with factory() as first, factory() as second:
        a = repo.get_wrong_question(first, wrong.id)
        b = repo.get_wrong_question(second, wrong.id)
        repo.increment_wrong_question_count(first, a, correct=correct)
        repo.increment_wrong_question_count(second, b, correct=correct)
    db.refresh(wrong)
    assert (wrong.correct_count, wrong.wrong_count) == ((2, 0) if correct else (0, 2))


def test_multiple_threads_do_not_lose_checkins(isolated):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    db, _, _, _, _, wrong, factory = isolated
    barrier = Barrier(8)
    def checkin(index):
        with factory() as session:
            row = repo.get_wrong_question(session, wrong.id)
            barrier.wait(timeout=10)
            repo.increment_wrong_question_count(session, row, correct=index % 2 == 0)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(checkin, range(8)))
    db.refresh(wrong)
    assert (wrong.correct_count, wrong.wrong_count) == (4, 4)
