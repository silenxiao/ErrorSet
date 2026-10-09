from typing import Literal, Annotated

from pydantic import BaseModel, Field, ConfigDict, StringConstraints


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
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid", strict=True)

    subject: Literal["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"]

    answer: str = Field(
        min_length=1,
    )

    analysis: str = Field(
        min_length=1,
    )

    knowledge_points: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]]

    grade_level: str | None = None

    out_of_scope: bool

    confidence: Literal[
        "high",
        "medium",
        "low",
    ]
