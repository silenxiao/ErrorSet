"""允许旧模型表保存无用户归属的系统模型，保留旧数据和表对象。"""

import re

from sqlalchemy import Engine


def migrate_model_profile_owner(engine: Engine) -> None:
    if engine.dialect.name != "sqlite":
        return
    with engine.connect() as conn:
        foreign_keys = conn.exec_driver_sql("PRAGMA foreign_keys").scalar()
        conn.commit()
        conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        conn.commit()
        try:
            conn.exec_driver_sql("BEGIN IMMEDIATE")
            columns = conn.exec_driver_sql("PRAGMA table_info(model_profile)").all()
            if not any(row[1] == "user_id" and row[3] for row in columns):
                conn.commit()
                return
            ddl = conn.exec_driver_sql(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='model_profile'"
            ).scalar_one()
            objects = conn.exec_driver_sql(
                "SELECT sql FROM sqlite_master WHERE tbl_name='model_profile' "
                "AND type IN ('index', 'trigger') AND sql IS NOT NULL"
            ).scalars().all()
            sequence = None
            if "AUTOINCREMENT" in ddl.upper():
                sequence = conn.exec_driver_sql(
                    "SELECT seq FROM sqlite_sequence WHERE name='model_profile'"
                ).scalar()
            ddl, count = re.subn(
                r'((?<!\w)(?:user_id|"user_id"|`user_id`|\[user_id\])\s+INTEGER\s+)NOT\s+NULL\b',
                r'\1', ddl, count=1, flags=re.IGNORECASE,
            )
            if count != 1:
                raise RuntimeError("无法迁移 model_profile.user_id 非空约束")
            ddl, count = re.subn(
                r'^(CREATE TABLE\s+)(?:"model_profile"|`model_profile`|\[model_profile\]|model_profile)',
                r'\1"model_profile_owner_new"', ddl, count=1, flags=re.IGNORECASE,
            )
            if count != 1:
                raise RuntimeError("无法迁移 model_profile 表定义")
            conn.exec_driver_sql(ddl)
            conn.exec_driver_sql('INSERT INTO model_profile_owner_new SELECT * FROM model_profile')
            conn.exec_driver_sql('DROP TABLE model_profile')
            conn.exec_driver_sql('ALTER TABLE model_profile_owner_new RENAME TO model_profile')
            for statement in objects:
                conn.exec_driver_sql(statement)
            if sequence is not None:
                conn.exec_driver_sql(
                    "UPDATE sqlite_sequence SET seq=MAX(seq, ?) WHERE name='model_profile'",
                    (sequence,),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.exec_driver_sql(f"PRAGMA foreign_keys={int(foreign_keys)}")
            conn.commit()
