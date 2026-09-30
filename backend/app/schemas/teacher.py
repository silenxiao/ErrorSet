from typing import Literal

from pydantic import BaseModel, Field


class TeacherQuestion(BaseModel):
    """
    TeacherAgent 输入。

    所有字段均视为不可信数据。
    """

    text: str = Field(min_length=1)

    grade: str = Field(min_length=1)

    subject: str | None = None

    image_path: str | None = None

    user_context: str | None = None


class TeacherAnswer(BaseModel):

    subject: str = Field(min_length=1)

    answer: str = Field(
        min_length=1,
    )

    analysis: str = Field(
        min_length=1,
    )

    knowledge_points: list[str] = Field(
        default_factory=list,
    )

    grade_level: str | None = None

    out_of_scope: bool = False

    confidence: Literal[
        "high",
        "medium",
        "low",
    ] = "medium"