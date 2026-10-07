from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
_connect_args = (
    {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
)
engine = create_engine(_settings.database_url, connect_args=_connect_args)

if _settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _connection_record):
        """识别 worker 写入与 API 读取并发，WAL 避免读写互相阻塞。"""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


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
        "ALTER TABLE question ADD COLUMN last_analysis JSON",
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
        # 同一题目在错题库只允许一条记录（并发双击加入时靠唯一索引兜底）；
        # 存量已有重复时建索引失败，静默跳过（下次启动不再重试失败）
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_wrong_question_question_id "
        "ON wrong_question(question_id)",
        # 管理后台删除模型时按 active_model_id 反查引用用户
        "CREATE INDEX IF NOT EXISTS ix_user_active_model_id ON user(active_model_id)",
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
    _drop_wrong_question_legacy_columns()


def _drop_wrong_question_legacy_columns() -> None:
    """移除错题表已废弃的 wrong_reason / exam_id 两列。

    错题不再记录「错因」与「来源试卷」：exam_id 原先只用于在管理后台展示
    来源卷名，不参与删除级联或归属校验，因此可安全移除。

    必须用「重建表」而不是 ALTER TABLE DROP COLUMN：exam_id 带
    FOREIGN KEY(exam_id) REFERENCES exam(id)，SQLite 会直接拒绝
    （error in table ... after drop column: unknown column in foreign key
    definition），而 SQLite 不支持 DROP CONSTRAINT。
    """
    with engine.begin() as conn:
        cols = {
            row[1] for row in conn.exec_driver_sql("PRAGMA table_info(wrong_question)")
        }
        # 全新库由 create_all 直接按当前模型建表，无需迁移
        if not cols or "exam_id" not in cols:
            return

        conn.exec_driver_sql(
            """
            CREATE TABLE wrong_question_new (
                id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                question_id INTEGER NOT NULL,
                answer TEXT NOT NULL,
                correct_answer TEXT NOT NULL,
                correct_count INTEGER NOT NULL,
                wrong_count INTEGER NOT NULL,
                subject VARCHAR(32) NOT NULL,
                analysis TEXT NOT NULL,
                knowledge_points JSON NOT NULL,
                image VARCHAR(512) NOT NULL,
                illustration_images JSON NOT NULL,
                question_no VARCHAR(64) NOT NULL,
                question_text TEXT NOT NULL,
                note TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                PRIMARY KEY (id),
                FOREIGN KEY(user_id) REFERENCES user (id),
                FOREIGN KEY(question_id) REFERENCES question (id)
            )
            """
        )
        conn.exec_driver_sql(
            "INSERT INTO wrong_question_new (id, user_id, question_id, answer, "
            "correct_answer, correct_count, wrong_count, subject, analysis, "
            "knowledge_points, image, illustration_images, question_no, "
            "question_text, note, sort_order, created_at, updated_at) "
            "SELECT id, user_id, question_id, answer, correct_answer, "
            "correct_count, wrong_count, subject, analysis, knowledge_points, "
            "image, illustration_images, question_no, question_text, note, "
            "sort_order, created_at, updated_at FROM wrong_question"
        )
        conn.exec_driver_sql("DROP TABLE wrong_question")
        conn.exec_driver_sql("ALTER TABLE wrong_question_new RENAME TO wrong_question")
        # 重建模型声明的索引（index=True）与错题唯一约束
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_wrong_question_user_id "
            "ON wrong_question (user_id)"
        )
        conn.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_wrong_question_question_id "
            "ON wrong_question (question_id)"
        )
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_wrong_question_question_id "
            "ON wrong_question(question_id)"
        )


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
    """首启播种管理员并把存量无归属数据划归给它。

    仅在用户表为空时创建种子账号（账号密码见 Settings.seed_admin_*）；
    已有数据不再自动重建/提权，避免被删除或降级的管理员在重启后复活。
    """
    from sqlalchemy import select

    from app.core.config import get_settings
    from app.core.security import hash_password
    from app.database.models import Exam, ModelProfile, User, WrongQuestion

    with SessionLocal() as db:
        users = list(db.scalars(select(User).order_by(User.id.asc())))
        owner = next((u for u in users if u.is_admin), None)
        if owner is None:
            if users:
                # 无管理员的存量库：把最早的普通用户提为管理员，保证后台可达
                owner = users[0]
                owner.is_admin = True
            else:
                settings = get_settings()
                owner = User(
                    username=settings.seed_admin_username,
                    password_hash=hash_password(settings.seed_admin_password),
                    is_admin=True,
                )
                db.add(owner)
            db.commit()
            db.refresh(owner)

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
