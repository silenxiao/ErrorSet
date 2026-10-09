"""SQLite 安全迁移：账号独立身份、用户/题目主键不复用。"""

import re
from uuid import uuid4

from sqlalchemy import Connection, Engine


def migrate_security_identities(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        foreign_keys = conn.exec_driver_sql("PRAGMA foreign_keys").scalar()
        conn.commit()
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        conn.commit()
        try:
            # 显式事务保证 SQLite 的建表/删表也可整体回滚。
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            columns = {row[1] for row in conn.exec_driver_sql('PRAGMA table_info("user")')}
            if "auth_identity" not in columns:
                conn.exec_driver_sql('ALTER TABLE "user" ADD COLUMN auth_identity VARCHAR(32)')
            for (user_id,) in conn.exec_driver_sql(
                "SELECT id FROM \"user\" WHERE auth_identity IS NULL OR auth_identity = ''"
            ).all():
                conn.exec_driver_sql(
                    'UPDATE "user" SET auth_identity=? WHERE id=?', (uuid4().hex, user_id)
                )

            for table, history in (
                ("user", "SELECT MAX(user_id) FROM exam UNION ALL SELECT MAX(user_id) FROM wrong_question "
                 "UNION ALL SELECT MAX(user_id) FROM model_profile UNION ALL SELECT MAX(user_id) FROM feedback"),
                ("question", "SELECT MAX(question_id) FROM wrong_question "
                 "UNION ALL SELECT MAX(question_id) FROM recognition_task"),
            ):
                _make_ids_monotonic(conn, table, history)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.exec_driver_sql(f"PRAGMA foreign_keys={int(foreign_keys)}")
            conn.commit()


def _make_ids_monotonic(conn: Connection, table: str, history: str) -> None:
    # table/history 均为模块内的固定值，不接受用户输入。
    sql = conn.exec_driver_sql(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).scalar_one()
    if "AUTOINCREMENT" not in sql.upper():
        objects = conn.exec_driver_sql(
            "SELECT sql FROM sqlite_master WHERE tbl_name=? "
            "AND type IN ('index', 'trigger') AND sql IS NOT NULL", (table,)
        ).scalars().all()
        # 使用旧表 DDL，保留迁移前可能存在的额外列及约束。
        ddl, count = re.subn(
            r'(?<!\w)(?:id|"id"|`id`|\[id\])\s+INTEGER\s*(?:NOT NULL\s*)?'
            r'(?:PRIMARY KEY\s*)?',
            'id INTEGER PRIMARY KEY AUTOINCREMENT ', sql, count=1,
            flags=re.IGNORECASE,
        )
        if count != 1:
            raise RuntimeError(f"无法迁移 {table} 主键定义")
        ddl = re.sub(
            r',\s*PRIMARY KEY\s*\(\s*["`\[]?id["`\]]?\s*\)', '', ddl,
            flags=re.IGNORECASE,
        )
        temporary = f"{table}_security_new"
        ddl, count = re.subn(
            rf'^(CREATE TABLE\s+)(?:"{table}"|`{table}`|\[{table}\]|{table})',
            rf'\1"{temporary}"', ddl, count=1, flags=re.IGNORECASE,
        )
        if count != 1:
            raise RuntimeError(f"无法迁移 {table} 表定义")
        conn.exec_driver_sql(ddl)
        conn.exec_driver_sql(f'INSERT INTO "{temporary}" SELECT * FROM "{table}"')
        conn.exec_driver_sql(f'DROP TABLE "{table}"')
        conn.exec_driver_sql(f'ALTER TABLE "{temporary}" RENAME TO "{table}"')
        for statement in objects:
            conn.exec_driver_sql(statement)

    # 序列必须跨过仍被历史数据引用的已删除 ID，且不能在重启时缩小。
    high_water = conn.exec_driver_sql(
        f'SELECT MAX(value) FROM (SELECT MAX(id) AS value FROM "{table}" '
        f'UNION ALL {history} '
        'UNION ALL SELECT seq FROM sqlite_sequence WHERE name=?)', (table,)
    ).scalar() or 0
    conn.exec_driver_sql("DELETE FROM sqlite_sequence WHERE name=?", (table,))
    conn.exec_driver_sql(
        "INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)", (table, high_water)
    )
