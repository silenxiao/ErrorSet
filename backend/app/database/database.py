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
        "ALTER TABLE question ADD COLUMN subject VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN subject VARCHAR(32) NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN analysis TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE wrong_question ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE wrong_question ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE illustration ADD COLUMN ai_bbox JSON",
        "ALTER TABLE illustration ADD COLUMN bbox_source VARCHAR(16) DEFAULT 'ai'",
    ]
    with engine.begin() as conn:
        for sql in statements:
            try:
                conn.exec_driver_sql(sql)
            except OperationalError:
                pass  # 列已存在


def get_db() -> "Generator[Session, None, None]":
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
