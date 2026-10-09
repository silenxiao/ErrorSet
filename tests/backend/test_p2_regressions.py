"""EXIF 裁图、bcrypt 字节上限及父子题持久化回归测试。"""

import io
from dataclasses import asdict
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import auth
from app.core.config import get_settings
from app.core.security import RateLimiter, create_token, hash_password, verify_password
from app.database import repository as repo
from app.database.database import Base, get_db
from app.database.models import Exam, Illustration, Question, User
from app.main import create_app
from app.pipeline.crop import crop_question
from app.pipeline.preprocess import preprocess_image
from app.pipeline.validator import normalize_global
from app.services import question_service


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "data_dir", str(tmp_path))
    monkeypatch.setattr(auth, "_register_limiter", RateLimiter(100, 300))
    monkeypatch.setattr(auth, "_login_limiter", RateLimiter(100, 300))
    monkeypatch.setattr(auth, "_change_password_limiter", RateLimiter(100, 300))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False, autoflush=False)
    with factory() as db:
        admin = User(username="admin", password_hash=hash_password("oldpass123"), is_admin=True)
        db.add(admin)
        db.commit()
        app = create_app()
        app.dependency_overrides[get_db] = lambda: db
        yield db, TestClient(app, raise_server_exceptions=False), admin, tmp_path, factory
    engine.dispose()


@pytest.mark.parametrize("password", ["a" * 73, "a" * 128, "中" * 25, "😀" * 19])
def test_long_passwords_return_validation_error_without_mutating_account(isolated, password):
    db, client, user, _, _ = isolated
    headers = {"Authorization": f"Bearer {create_token(user)}"}
    before = user.password_hash
    registration = client.post("/api/v1/auth/register", json={"username": "new", "password": password})
    assert registration.status_code == 422
    assert repo.get_user_by_username(db, "new") is None
    assert client.post("/api/v1/auth/login", json={"username": user.username, "password": password}).status_code == 401
    change = client.put("/api/v1/auth/me/password", headers=headers,
                        json={"oldPassword": "oldpass123", "newPassword": password, "confirmPassword": password})
    assert change.status_code == 422
    reset = client.patch(f"/api/v1/admin/users/{user.id}", headers=headers, json={"password": password})
    assert reset.status_code == 422
    db.refresh(user)
    assert user.password_hash == before
    assert verify_password("oldpass123", user.password_hash)


@pytest.mark.parametrize("password", ["a" * 72, "中" * 24, "😀" * 18])
def test_exact_72_byte_passwords_can_register_login_change_and_reset(isolated, password):
    db, client, admin, _, _ = isolated
    registered = client.post("/api/v1/auth/register", json={"username": "new", "password": password})
    assert registered.status_code == 201
    assert client.post("/api/v1/auth/login", json={"username": "new", "password": password}).status_code == 200
    headers = {"Authorization": f"Bearer {create_token(admin)}"}
    assert client.put("/api/v1/auth/me/password", headers=headers,
                      json={"oldPassword": "oldpass123", "newPassword": password, "confirmPassword": password}).status_code == 200
    logged_in = client.post("/api/v1/auth/login", json={"username": "admin", "password": password})
    assert logged_in.status_code == 200
    headers = {"Authorization": f"Bearer {logged_in.json()['token']}"}
    new_user = repo.get_user_by_username(db, "new")
    assert client.patch(f"/api/v1/admin/users/{new_user.id}", headers=headers,
                        json={"password": password}).status_code == 200


@pytest.mark.parametrize("orientation,color", [
    (1, (255, 0, 0)), (2, (0, 255, 0)), (3, (255, 255, 0)), (4, (0, 0, 255)),
    (5, (255, 0, 0)), (6, (0, 0, 255)), (7, (255, 255, 0)), (8, (0, 255, 0)),
])
def test_question_dynamic_illustration_and_snapshot_share_exif_coordinates(isolated, monkeypatch, orientation, color):
    db, client, user, tmp_path, _ = isolated
    original = tmp_path / "originals" / "photo.jpg"
    original.parent.mkdir()
    image = Image.new("RGB", (96, 64))
    for box, fill in [((0, 0, 48, 32), (255, 0, 0)), ((48, 0, 96, 32), (0, 255, 0)),
                      ((0, 32, 48, 64), (0, 0, 255)), ((48, 32, 96, 64), (255, 255, 0))]:
        image.paste(fill, box)
    exif = Image.Exif()
    exif[274] = orientation
    image.save(original, exif=exif, quality=100, subsampling=0)
    before = original.read_bytes()
    # 全局图片会缩小，局部裁剪仍保留原始分辨率；坐标方向必须一致。
    monkeypatch.setattr(get_settings(), "max_image_side_px", 48)
    processed = preprocess_image(str(original), str(tmp_path))
    expected_size = (32, 48) if orientation >= 5 else (48, 32)
    assert (processed.width, processed.height) == expected_size
    bbox = [0, 0, 500, 500]
    crop_path = crop_question(str(original), bbox, str(tmp_path / "crops"), padding_ratio=0)
    with Image.open(crop_path) as crop:
        assert crop.size == expected_size
        assert all(abs(actual - expected) < 10 for actual, expected in zip(crop.getpixel((10, 10)), color))

    exam = repo.create_exam(db, user_id=user.id, name="photo", original_image=str(original))
    question = Question(exam_id=exam.id, question_no="1", text="diagram", bbox=bbox, ai_bbox=bbox)
    db.add(question)
    db.flush()
    illustration = Illustration(question_id=question.id, bbox=bbox, ai_bbox=bbox)
    db.add(illustration)
    db.commit()
    response = client.get(f"/api/v1/illustrations/{illustration.id}/image",
                          headers={"Authorization": f"Bearer {create_token(user)}"})
    assert response.status_code == 200
    with Image.open(io.BytesIO(response.content)) as crop:
        assert crop.size == expected_size  # 2% padding 在这个尺寸上不增加整数像素
        assert all(abs(actual - expected) < 10 for actual, expected in zip(crop.getpixel((10, 10)), color))
    wrong = question_service.create_wrong_question(db, user.id, question_id=question.id)
    assert len(wrong.illustration_images) == 1
    with Image.open(Path(wrong.illustration_images[0])) as snapshot:
        assert all(abs(actual - expected) < 10 for actual, expected in zip(snapshot.getpixel((10, 10)), color))
    assert original.read_bytes() == before


def test_nested_questions_keep_parent_links_in_database_and_api(isolated):
    db, client, user, tmp_path, factory = isolated
    original = tmp_path / "originals" / "nested.png"
    original.parent.mkdir()
    Image.new("RGB", (20, 20), "white").save(original)
    exam = repo.create_exam(db, user_id=user.id, name="nested", original_image=str(original))
    def node(number, children=None, illustrations=None):
        return {"question_no": number, "text": number, "bbox": [0, 0, 500, 500],
                "sub_questions": children or [], "illustrations": illustrations or []}
    raw = {"questions": [
        node("1", [node("1.1", [node("1.1.1")], [{"bbox": [0, 0, 100, 100]}]), node("1.2")]),
        node("2", [node("2.1")]),
    ]}
    normalized = normalize_global(raw)
    rows = repo.save_questions(db, exam, [asdict(q) for q in normalized])
    ids = {q.question_no: q.id for q in rows}
    parents = {"1": None, "1.1": ids["1"], "1.1.1": ids["1.1"], "1.2": ids["1"], "2": None, "2.1": ids["2"]}
    # 新会话重新加载，避免只验证内存对象。
    with factory() as persisted:
        saved = repo.list_questions(persisted, exam.id)
        assert {q.question_no: q.parent_id for q in saved} == parents
        assert len(next(q for q in saved if q.question_no == "1.1").illustrations) == 1
    response = client.get(f"/api/v1/exams/{exam.id}", headers={"Authorization": f"Bearer {create_token(user)}"})
    assert response.status_code == 200
    assert {q["questionNo"]: q["parentId"] for q in response.json()["questions"]} == parents
