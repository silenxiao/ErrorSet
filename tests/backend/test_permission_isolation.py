"""P0: tenant ownership, admin model boundaries and media capabilities."""
from urllib.parse import parse_qs, urlsplit

import jwt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ProviderAuthError
from app.core.media_access import signed_media_url, signed_illustration_url, _media_key
from app.core.security import create_token
from app.database.database import Base, get_db
from app.database.models import Exam, Illustration, ModelProfile, Question, User, WrongQuestion
from app.main import create_app
from app.providers.factory import ProviderFactory
from app.services import settings_service


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "data_dir", str(tmp_path))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with sessionmaker(engine, expire_on_commit=False)() as db:
        owner = User(username="owner", password_hash="hash")
        other = User(username="other", password_hash="hash")
        admin = User(username="admin", password_hash="hash", is_admin=True)
        db.add_all([owner, other, admin])
        db.flush()
        image = tmp_path / "originals" / "owned.png"
        image.parent.mkdir()
        image.write_bytes(b"test image")
        exam = Exam(user_id=owner.id, name="private", original_image=str(image))
        own = ModelProfile(user_id=owner.id, origin="user", provider="openai", api_key="private")
        assigned = ModelProfile(user_id=owner.id, origin="admin", provider="openai", api_key="assigned")
        shared = ModelProfile(is_system=True, origin="admin", enabled=True, provider="openai", api_key="shared")
        db.add_all([exam, own, assigned, shared])
        db.commit()
        app = create_app()
        app.dependency_overrides[get_db] = lambda: db
        # No lifespan: tests never touch production DB or recognition worker.
        client = TestClient(app)
        yield db, client, owner, other, admin, image, exam, own, assigned, shared
    engine.dispose()


def headers(user):
    return {"Authorization": f"Bearer {create_token(user)}"}


def test_api_auth_and_cross_tenant_access(isolated):
    db, client, owner, other, admin, image, exam, own, assigned, shared = isolated
    assert client.get("/api/v1/auth/me", params={"token": create_token(owner)}).status_code == 401
    assert client.get("/api/v1/admin/stats", headers=headers(owner)).status_code == 403
    assert client.get(f"/api/v1/exams/{exam.id}", headers=headers(other)).status_code == 404
    assert client.post(f"/api/v1/settings/models/{own.id}/test", headers=headers(other)).status_code == 404
    assert client.post(f"/api/v1/admin/models/{own.id}/test", headers=headers(admin)).status_code == 404
    for profile in (own, assigned, shared):
        if profile is not own:
            with pytest.raises(NotFoundError):
                settings_service.get_model_profile(db, profile.id, owner.id)
    for action in (settings_service.admin_update_model_profile, settings_service.admin_delete_model_profile):
        with pytest.raises(NotFoundError):
            action(db, own.id)
    assert settings_service.get_admin_model_profile(db, assigned.id) is assigned
    assert settings_service._get_enableable_profile(db, shared.id, other.id) is shared
    shared.enabled = False
    db.commit()
    with pytest.raises(NotFoundError):
        settings_service._get_enableable_profile(db, shared.id, other.id)


def test_media_signatures_and_revocation(isolated):
    db, client, owner, other, admin, image, exam, *_ = isolated
    url = signed_media_url(str(image), viewer_id=owner.id)
    assert client.get(url).status_code == 200
    assert client.get(urlsplit(url).path).status_code in (404, 422)
    assert client.get(url + "x").status_code == 404
    from app.core.media_access import _media_key
    expired = jwt.encode({"sub": str(owner.id), "file": "originals/owned.png", "scope": "owner", "aud": "errorset-media", "exp": 1}, _media_key(), algorithm="HS256")
    assert client.get(f"/files/originals/owned.png?access={expired}").status_code == 404
    assert client.get(signed_media_url(str(image), viewer_id=other.id)).status_code == 404
    assert client.get(signed_media_url(str(image), viewer_id=other.id, admin=True)).status_code == 404
    admin_url = signed_media_url(str(image), viewer_id=admin.id, admin=True)
    assert client.get(admin_url).status_code == 200
    admin.is_admin = False
    db.commit()
    assert client.get(admin_url).status_code == 404
    # A valid login token cannot serve as a media capability.
    assert client.get(f"/files/originals/owned.png?access={create_token(owner)}").status_code == 404
    access = parse_qs(urlsplit(url).query)["access"][0]
    assert client.get(f"/files/wrong/owned.png?access={access}").status_code == 404
    with pytest.raises(ValueError):
        signed_media_url(str(image.parent.parent / "app.db"), viewer_id=owner.id)
    db.delete(exam)
    db.commit()
    assert client.get(url).status_code == 404


def test_custom_model_cannot_borrow_server_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "openai_api_key", "server-secret")
    with pytest.raises(ProviderAuthError):
        ProviderFactory.create("openai", "test", base_url="https://example.com")
    provider = ProviderFactory.create("openai", "test", allow_env_key=True)
    assert provider.api_key == "server-secret"


def test_dynamic_illustration_access_and_response_urls(isolated):
    from PIL import Image

    db, client, owner, other, admin, image, exam, *_ = isolated
    Image.new("RGB", (40, 40), "white").save(image)
    question = Question(exam_id=exam.id, question_no="1", text="private",
                        bbox=[0, 0, 1000, 1000], ai_bbox=[0, 0, 1000, 1000])
    db.add(question)
    db.flush()
    ill = Illustration(question_id=question.id, bbox=[0, 0, 500, 500], ai_bbox=[0, 0, 500, 500])
    db.add(ill)
    db.flush()
    wrong = WrongQuestion(user_id=owner.id, question_id=question.id)
    db.add(wrong)
    db.commit()
    responses = [
        client.get(f"/api/v1/questions/{question.id}", headers=headers(owner)).json(),
        client.get(f"/api/v1/exams/{exam.id}", headers=headers(owner)).json()["questions"][0],
        client.get(f"/api/v1/wrong-questions/{wrong.id}", headers=headers(owner)).json(),
    ]
    for response in responses:
        url = response["illustrations"][0]["imageUrl"]
        assert "?access=" in url and "token=" not in url
        result = client.get(url)
        assert result.status_code == 200
        assert result.headers["content-type"] == "image/png"
        assert result.headers["cache-control"] == "private, no-store"
    path = f"/api/v1/illustrations/{ill.id}/image"
    assert client.get(path, headers=headers(owner)).status_code == 200
    assert client.get(path, headers=headers(other)).status_code == 404
    assert client.get(path + f"?token={create_token(owner)}").status_code == 404
    assert client.get(path + f"?access={create_token(owner)}").status_code == 404
    assert client.get(signed_illustration_url(ill.id, viewer_id=other.id)).status_code == 404
    url = signed_illustration_url(ill.id, viewer_id=owner.id)
    assert client.get(url + "x").status_code == 404
    assert client.get(url.replace(f"/{ill.id}/image", f"/{ill.id + 1}/image")).status_code == 404
    file_access = parse_qs(urlsplit(signed_media_url(str(image), viewer_id=owner.id)).query)["access"][0]
    assert client.get(path + f"?access={file_access}").status_code == 404
    expired = jwt.encode({"sub": str(owner.id), "file": f"illustrations/{ill.id}",
                          "scope": "owner", "aud": "errorset-media", "exp": 1}, _media_key(), algorithm="HS256")
    assert client.get(path + f"?access={expired}").status_code == 404
    # Even an unexpired signature cannot outlive a change in resource ownership.
    exam.user_id = other.id
    db.commit()
    assert client.get(url).status_code == 404
