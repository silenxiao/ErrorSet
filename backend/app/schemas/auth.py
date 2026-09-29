from datetime import datetime

from pydantic import field_validator

from app.schemas.common import CamelModel

# 可选年级（与前端三端的上传页选项保持一致）
GRADE_OPTIONS = [
    "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
    "初一", "初二", "初三",
]


def _validate_grade(value: str) -> str:
    if value not in GRADE_OPTIONS:
        raise ValueError(f"年级必须是 {GRADE_OPTIONS} 之一")
    return value


class CredentialsIn(CamelModel):
    username: str
    password: str
    # 仅注册时使用；登录请求可忽略
    grade: str = "一年级"

    @field_validator("username")
    @classmethod
    def _strip_username(cls, value: str) -> str:
        return value.strip()

    @field_validator("grade")
    @classmethod
    def _check_grade(cls, value: str) -> str:
        return _validate_grade(value)


class UserOut(CamelModel):
    id: int
    username: str
    is_admin: bool = False
    grade: str = "一年级"
    created_at: datetime


class GradeUpdate(CamelModel):
    grade: str

    @field_validator("grade")
    @classmethod
    def _check_grade(cls, value: str) -> str:
        return _validate_grade(value)


class TokenOut(CamelModel):
    token: str
    user: UserOut
