from datetime import datetime

from pydantic import field_validator

from app.schemas.common import CamelModel


class CredentialsIn(CamelModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def _strip_username(cls, value: str) -> str:
        return value.strip()


class UserOut(CamelModel):
    id: int
    username: str
    created_at: datetime


class TokenOut(CamelModel):
    token: str
    user: UserOut
