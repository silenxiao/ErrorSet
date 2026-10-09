"""验证旧 SQLite 库升级、幂等重启、历史 ID 和失败回滚。"""

import re

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.schema import CreateTable

from app.database.database import Base
from app.database.models import Exam, Question, User, WrongQuestion
from app.database.security_migrations import migrate_security_identities


@pytest.fixture
def legacy_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    Base.metadata.create_all(engine)
    with sessionmaker(engine)() as db:
        user = User(id=5, username="existing", password_hash="preserve-hash", is_admin=True)
        db.add(user)
        db.flush()
        exam = Exam(user_id=5, name="preserve exam", original_image="old.jpg")
        db.add(exam)
        db.flush()
        question = Question(id=10, exam_id=exam.id, question_no="1", text="preserve text",
                            bbox=[0, 0, 500, 500], ai_bbox=[0, 0, 500, 500])
        db.add(question)
        db.add(WrongQuestion(user_id=5, question_id=500, question_text="snapshot", note="keep"))
        db.commit()
    with engine.begin() as conn:
        # 按升级前的模型建表：没有 AUTOINCREMENT，也没有账号独立身份列。
        for table in (User.__table__, Question.__table__):
            ddl = str(CreateTable(table).compile(dialect=engine.dialect)).replace(" AUTOINCREMENT", "")
            if table.name == "user":
                ddl = re.sub(r'\s*auth_identity VARCHAR\(32\) NOT NULL,', '', ddl)
            temporary = f"{table.name}_legacy"
            ddl = ddl.replace(f"CREATE TABLE {table.name}", f"CREATE TABLE {temporary}", 1)
            conn.exec_driver_sql(ddl)
            columns = [c.name for c in table.columns if c.name != "auth_identity"]
            quoted = ", ".join(f'"{name}"' for name in columns)
            conn.exec_driver_sql(f'INSERT INTO "{temporary}" ({quoted}) SELECT {quoted} FROM "{table.name}"')
            conn.exec_driver_sql(f'DROP TABLE "{table.name}"')
            conn.exec_driver_sql(f'ALTER TABLE "{temporary}" RENAME TO "{table.name}"')
        conn.exec_driver_sql('CREATE UNIQUE INDEX ix_user_username ON "user" (username)')
        conn.exec_driver_sql('CREATE INDEX ix_question_exam_id ON question (exam_id)')
        conn.exec_driver_sql("ALTER TABLE question ADD COLUMN legacy_extra TEXT DEFAULT 'keep-extra'")
        conn.exec_driver_sql("CREATE TABLE audit (question_id INTEGER)")
        conn.exec_driver_sql("CREATE TRIGGER audit_question AFTER INSERT ON question "
                             "BEGIN INSERT INTO audit VALUES (NEW.id); END")
    yield engine
    engine.dispose()


def test_upgrade_preserves_data_indexes_triggers_and_historical_ids(legacy_engine):
    migrate_security_identities(legacy_engine)
    with sessionmaker(legacy_engine, expire_on_commit=False)() as db:
        user = db.get(User, 5)
        identity = user.auth_identity
        assert len(identity) == 32
        assert user.password_hash == "preserve-hash"
        assert user.is_admin
        assert db.get(Question, 10).text == "preserve text"
        assert db.get(WrongQuestion, 1).note == "keep"
        exam_id = db.get(Question, 10).exam_id
        db.delete(db.get(Question, 10))
        db.commit()
        new = Question(exam_id=exam_id, question_no="2", text="new", bbox=[0, 0, 20, 20], ai_bbox=[0, 0, 20, 20])
        db.add(new)
        db.commit()
        assert new.id > 500
        high_id = new.id
        db.delete(new)
        db.commit()
    # 重启幂等，不重新分配用户身份，也不缩小 sqlite_sequence。
    migrate_security_identities(legacy_engine)
    with legacy_engine.connect() as conn:
        assert conn.exec_driver_sql('SELECT auth_identity FROM "user" WHERE id=5').scalar() == identity
        assert conn.exec_driver_sql("SELECT seq FROM sqlite_sequence WHERE name='question'").scalar() == high_id
        assert conn.exec_driver_sql("SELECT question_id FROM audit").scalar() == high_id
        assert {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(question)")} >= {"legacy_extra"}
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM sqlite_master WHERE name='ix_question_exam_id'").scalar() == 1
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM sqlite_master WHERE name='ix_user_username'").scalar() == 1
    with sessionmaker(legacy_engine)() as db:
        db.delete(db.get(User, 5))
        db.commit()
        new_user = User(username="replacement", password_hash="hash")
        db.add(new_user)
        db.commit()
        assert new_user.id > 5


def test_migration_rolls_back_table_rebuild_on_failure(legacy_engine):
    def interrupt(conn, cursor, statement, parameters, context, executemany):
        if statement == 'DROP TABLE "question"':
            raise RuntimeError("simulated interruption")
    event.listen(legacy_engine, "after_cursor_execute", interrupt)
    try:
        with pytest.raises(RuntimeError, match="simulated interruption"):
            migrate_security_identities(legacy_engine)
    finally:
        event.remove(legacy_engine, "after_cursor_execute", interrupt)
    with legacy_engine.connect() as conn:
        assert conn.exec_driver_sql("SELECT text FROM question WHERE id=10").scalar() == "preserve text"
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM sqlite_master WHERE name='ix_question_exam_id'").scalar() == 1
        assert "auth_identity" not in {row[1] for row in conn.exec_driver_sql('PRAGMA table_info("user")')}
        assert conn.exec_driver_sql("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%security_new'").scalar() == 0
    migrate_security_identities(legacy_engine)


@pytest.mark.parametrize("legacy", [False, True])
def test_startup_runs_security_migration_and_preserves_identity(tmp_path, legacy_engine, monkeypatch, legacy):
    from app.database import database

    engine = legacy_engine if legacy else create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(engine, expire_on_commit=False))
    database.init_db()
    with sessionmaker(engine)() as db:
        users = db.query(User).all()
        assert users and all(len(user.auth_identity) == 32 for user in users)
        identities = {user.id: user.auth_identity for user in users}
    database.init_db()
    with sessionmaker(engine)() as db:
        assert {user.id: user.auth_identity for user in db.query(User)} == identities
    if not legacy:
        engine.dispose()
