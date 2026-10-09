"""账号身份、错题归属和可信代理限流的回归测试；不访问实际数据目录。"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.api import auth
from app.core.config import get_settings
from app.core.exceptions import AlreadyExistsError, NotFoundError
from app.core.security import RateLimiter, create_token
from app.database import repository as repo
from app.database.database import Base, get_db
from app.database.models import Exam, Illustration, Question, User, WrongQuestion
from app.main import create_app
from app.services import question_service


@pytest.fixture
def isolated():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as db:
        owner = repo.create_user(db, username="owner", password_hash="hash")
        other = repo.create_user(db, username="other", password_hash="hash")
        app = create_app()
        app.dependency_overrides[get_db] = lambda: db
        yield db, TestClient(app), owner, other
    engine.dispose()


def make_question(db, user):
    exam = repo.create_exam(db, user_id=user.id, name="private", original_image="unused")
    question = Question(exam_id=exam.id, question_no="1", text=f"{user.username} private",
                        bbox=[0, 0, 500, 500], ai_bbox=[0, 0, 500, 500])
    db.add(question)
    db.commit()
    return exam, question


def test_deleted_user_token_cannot_authenticate_reused_id(isolated):
    db, client, owner, other = isolated
    token = create_token(other)
    old_id = other.id
    repo.delete_user(db, other)
    new = repo.create_user(db, username="new", password_hash="hash")
    assert new.id > old_id
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    # 即使导入旧数据或其他数据库显式复用主键，独立身份仍会阻断旧 token。
    db.delete(new)
    db.commit()
    replacement = User(id=old_id, username="replacement", password_hash="hash")
    db.add(replacement)
    db.commit()
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    result = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {create_token(replacement)}"})
    assert result.status_code == 200
    assert result.json()["username"] == "replacement"


def test_old_token_without_independent_identity_requires_login(isolated):
    db, client, owner, _ = isolated
    token = jwt.encode({"sub": str(owner.id), "exp": datetime.now(timezone.utc) + timedelta(days=1)},
                       get_settings().jwt_secret, algorithm="HS256")
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_deleted_questions_are_not_reused_and_snapshots_survive(isolated):
    db, _, owner, other = isolated
    exam, question = make_question(db, owner)
    wrong = question_service.create_wrong_question(db, owner.id, question_id=question.id, note="keep")
    old_id = question.id
    repo.delete_exam(db, exam)
    _, new = make_question(db, other)
    assert new.id > old_id
    added = question_service.create_wrong_question(db, other.id, question_id=new.id, overwrite=True)
    assert added.id != wrong.id
    db.refresh(wrong)
    assert wrong.user_id == owner.id
    assert wrong.note == "keep"


@pytest.mark.parametrize("overwrite", [False, True])
def test_legacy_cross_tenant_collision_is_never_overwritten(isolated, overwrite, monkeypatch):
    db, client, owner, other = isolated
    _, question = make_question(db, other)
    wrong = WrongQuestion(user_id=owner.id, question_id=question.id,
                          question_text="owner snapshot", note="private", illustration_images=[])
    db.add(wrong)
    db.add(Illustration(question_id=question.id, bbox=[0, 0, 500, 500], ai_bbox=[0, 0, 500, 500]))
    db.commit()
    def forbidden_snapshot(*args):
        pytest.fail("归属校验失败时不得生成/清理快照")
    monkeypatch.setattr(question_service, "_snapshot_illustrations", forbidden_snapshot)
    result = client.post("/api/v1/wrong-questions",
                         headers={"Authorization": f"Bearer {create_token(other)}"},
                         json={"questionId": question.id, "overwrite": overwrite, "note": "changed"})
    assert result.status_code == 404
    db.refresh(wrong)
    assert wrong.note == "private"
    details = client.get(f"/api/v1/wrong-questions/{wrong.id}",
                         headers={"Authorization": f"Bearer {create_token(owner)}"})
    assert details.status_code == 200
    assert details.json()["illustrations"] == []
    assert details.json()["questionText"] == "owner snapshot"


@pytest.mark.parametrize("cross_tenant", [False, True])
def test_unique_conflict_does_not_bypass_overwrite_or_ownership(isolated, monkeypatch, cross_tenant):
    from sqlalchemy.exc import IntegrityError

    db, _, owner, other = isolated
    _, question = make_question(db, owner)
    wrong = WrongQuestion(user_id=other.id if cross_tenant else owner.id, question_id=question.id, note="keep")
    db.add(wrong)
    db.commit()
    actual_lookup = repo.get_wrong_question_by_question
    calls = 0
    def racing_lookup(*args):
        nonlocal calls
        calls += 1
        return None if calls == 1 else actual_lookup(*args)
    def conflict(*args, **kwargs):
        raise IntegrityError("insert", {}, Exception("unique conflict"))
    monkeypatch.setattr(repo, "get_wrong_question_by_question", racing_lookup)
    monkeypatch.setattr(repo, "create_wrong_question", conflict)
    monkeypatch.setattr(question_service, "_snapshot_illustrations", lambda *args: [])
    with pytest.raises(NotFoundError if cross_tenant else AlreadyExistsError):
        question_service.create_wrong_question(db, owner.id, question_id=question.id)
    db.refresh(wrong)
    assert wrong.note == "keep"


def request_from(peer, forwarded=""):
    return Request({"type": "http", "client": (peer, 1234),
                    "headers": [(b"x-forwarded-for", forwarded.encode())]})


@pytest.mark.parametrize("trusted,peer,forwarded,expected", [
    ([], "203.0.113.10", "1.2.3.4", "203.0.113.10"),
    (["10.0.0.2/32"], "203.0.113.10", "1.2.3.4", "203.0.113.10"),
    (["10.0.0.2/32"], "10.0.0.2", "1.2.3.4, 203.0.113.10", "203.0.113.10"),
    (["10.0.0.2/32", "10.0.0.1/32"], "10.0.0.2", "1.2.3.4, 203.0.113.10, 10.0.0.1", "203.0.113.10"),
    (["10.0.0.2/32"], "10.0.0.2", "malformed, 203.0.113.10", "10.0.0.2"),
    (["::1/128"], "::1", "::ffff:1.2.3.4, 2001:db8::1", "2001:db8::1"),
])
def test_forwarded_chain_stops_at_first_untrusted_peer(monkeypatch, trusted, peer, forwarded, expected):
    monkeypatch.setattr(get_settings(), "trusted_proxy_cidrs", trusted)
    assert auth._client_ip(request_from(peer, forwarded)) == expected


def test_rotating_forwarded_headers_cannot_reset_login_or_registration_limits(isolated, monkeypatch):
    db, client, _, _ = isolated
    monkeypatch.setattr(get_settings(), "trusted_proxy_cidrs", [])
    monkeypatch.setattr(auth, "_login_limiter", RateLimiter(2, 300))
    monkeypatch.setattr(auth, "_register_limiter", RateLimiter(2, 300))
    for i in range(3):
        headers = {"X-Forwarded-For": f"203.0.113.{i}"}
        login = client.post("/api/v1/auth/login", headers=headers,
                            json={"username": "missing", "password": "wrongpass"})
        register = client.post("/api/v1/auth/register", headers=headers,
                               json={"username": "", "password": "validpass"})
        assert login.status_code == (401 if i < 2 else 429)
        assert register.status_code == (422 if i < 2 else 429)
