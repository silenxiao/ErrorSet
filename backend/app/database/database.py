from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_connect_args = (
    {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(_settings.database_url, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from app.database import models  # noqa: F401 确保模型已注册

    Base.metadata.create_all(bind=engine)
    _sqlite_lightweight_migrations()


def _sqlite_lightweight_migrations() -> None:
    """开发阶段轻量迁移：create_all 不会给已存在的表补列，这里手工补。"""
    if not engine.url.get_backend_name().startswith("sqlite"):
        return
    from sqlalchemy.exc import OperationalError

    statements = [
        "ALTER TABLE exam ADD COLUMN include_illustrations BOOLEAN DEFAULT 1",
        "ALTER TABLE exam ADD COLUMN grade VARCHAR(32) NOT NULL DEFAULT '一年级'",
        "ALTER TABLE exam ADD COLUMN extra_prompt TEXT",
        "ALTER TABLE exam ADD COLUMN error_message TEXT",
        "ALTER TABLE question ADD COLUMN subject VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN subject VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN analysis TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE wrong_question ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE wrong_question ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE illustration ADD COLUMN ai_bbox JSON",
        "ALTER TABLE illustration ADD COLUMN bbox_source VARCHAR(16) DEFAULT 'ai'",
        "ALTER TABLE exam ADD COLUMN user_id INTEGER",
        "ALTER TABLE wrong_question ADD COLUMN user_id INTEGER",
        "ALTER TABLE wrong_question ADD COLUMN illustration_images JSON",
        "ALTER TABLE wrong_question ADD COLUMN question_no VARCHAR(64) NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN question_text TEXT NOT NULL DEFAULT ''",
        # 补列后存量行的值是 NULL，回填为空列表，避免序列化报错
        "UPDATE wrong_question SET illustration_images = '[]' "
        "WHERE illustration_images IS NULL",
        "ALTER TABLE model_profile ADD COLUMN user_id INTEGER",
        "ALTER TABLE user ADD COLUMN is_admin BOOLEAN DEFAULT 0",
        "ALTER TABLE user ADD COLUMN grade VARCHAR(32) NOT NULL DEFAULT '一年级'",
        "ALTER TABLE model_profile ADD COLUMN is_system BOOLEAN DEFAULT 0",
        "ALTER TABLE model_profile ADD COLUMN origin VARCHAR(16) DEFAULT 'user'",
        "ALTER TABLE user ADD COLUMN active_model_id INTEGER",
        "ALTER TABLE user ADD COLUMN system_model_calls INTEGER NOT NULL DEFAULT 0",
        # 存量用户的当前启用模型回填到 active_model_id（之后由应用层同步维护）
        "UPDATE user SET active_model_id = "
        "(SELECT id FROM model_profile WHERE model_profile.user_id = user.id "
        "AND enabled = 1 ORDER BY id DESC LIMIT 1) WHERE active_model_id IS NULL",
    ]
    with engine.begin() as conn:
        for sql in statements:
            try:
                conn.exec_driver_sql(sql)
            except OperationalError:
                pass  # 列已存在

    _migrate_provider_setting_to_model_profile()
    _seed_default_user()
    _backfill_wrong_question_text()


def _backfill_wrong_question_text() -> None:
    """存量错题回填题目文本快照（题目仍存在时），保证删卷后列表仍可展示。"""
    from sqlalchemy import select

    from app.database.models import Question, WrongQuestion

    with SessionLocal() as db:
        rows = list(
            db.scalars(select(WrongQuestion).where(WrongQuestion.question_no == ""))
        )
        if not rows:
            return
        for row in rows:
            question = db.get(Question, row.question_id)
            if question is not None:
                row.question_no = question.question_no
                row.question_text = question.text
        db.commit()


def _seed_default_user() -> None:
    """存量数据划归默认用户 xiaohui（密码 123456）：无归属的行全部更新给它。"""
    from sqlalchemy import select

    from app.core.security import hash_password
    from app.database.models import Exam, ModelProfile, User, WrongQuestion

    with SessionLocal() as db:
        owner = db.scalars(select(User).where(User.username == "xiaohui")).first()
        if owner is None:
            owner = User(
                username="xiaohui", password_hash=hash_password("123456"), is_admin=True
            )
            db.add(owner)
            db.commit()
            db.refresh(owner)
        elif not owner.is_admin:
            owner.is_admin = True
            db.commit()

        changed = False
        for model in (Exam, WrongQuestion, ModelProfile):
            query = select(model).where(model.user_id.is_(None))
            # 系统模型 user_id 恒为 NULL，不属于任何用户，不能被划归
            if model is ModelProfile:
                query = query.where(ModelProfile.is_system.is_(False))
            rows = list(db.scalars(query))
            for row in rows:
                row.user_id = owner.id
            changed = changed or bool(rows)
        if changed:
            db.commit()


def _migrate_provider_setting_to_model_profile() -> None:
    """旧的 provider_setting 单行配置迁入 model_profile 列表（作为启用项）。"""
    from sqlalchemy import text

    with engine.begin() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM model_profile")
        ).scalar_one()
        if count > 0:
            return
        row = conn.execute(
            text(
                "SELECT provider, base_url, model, api_key FROM provider_setting "
                "WHERE provider != '' LIMIT 1"
            )
        ).first()
        if row is None:
            return
        conn.execute(
            text(
                "INSERT INTO model_profile "
                "(name, provider, base_url, model, api_key, enabled, created_at, updated_at) "
                "VALUES (:name, :provider, :base_url, :model, :api_key, 1, "
                "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ),
            {"name": "", "provider": row.provider, "base_url": row.base_url,
             "model": row.model, "api_key": row.api_key},
        )


def get_db() -> "Generator[Session, None, None]":
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
