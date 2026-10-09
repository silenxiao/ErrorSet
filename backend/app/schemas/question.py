from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CamelModel


class IllustrationOut(CamelModel):
    id: int
    image_url: str = ""
    bbox: list[int]
    ai_bbox: list[int]
    bbox_source: str = "ai"
    type: str


class AnalysisOut(CamelModel):
    """GET /api/v1/questions/{id}/analyze 的结构化 AI 分析结果。

    取代旧的自由文本（科目：… 正确答案：… AI分析：…），
    前端不再需要正则拆分。
    """

    subject: str = ""
    answer: str = ""
    analysis: str = ""
    knowledge_points: list[str] = []
    out_of_scope: bool = False
    confidence: Literal["high", "medium", "low"] = "medium"


class QuestionUpdate(CamelModel):
    """PATCH /api/v1/questions/{id} 可编辑字段，None 表示不修改。"""

    text: str | None = None


class WrongQuestionCreate(CamelModel):
    question_id: int
    answer: str = ""
    correct_answer: str = ""
    subject: str = ""
    analysis: str = ""
    knowledge_points: list[str] = []
    note: str = ""
    # 题目已在错题库时须由用户确认覆盖；不带 overwrite 重复加入返回 409
    overwrite: bool = False


class QuestionOut(CamelModel):
    id: int
    exam_id: int
    parent_id: int | None = None
    question_no: str
    text: str
    subject: str = ""
    bbox: list[int]
    ai_bbox: list[int]
    bbox_source: str
    confidence: float | None = None
    status: str
    # 最近一次 AI 分析（未加入错题库也可找回；与错题库的 analysis 相互独立）
    last_analysis: AnalysisOut | None = None
    illustrations: list[IllustrationOut] = []


class BBoxUpdate(BaseModel):
    bbox: list[int]

    @field_validator("bbox")
    @classmethod
    def four_numbers(cls, v: list) -> list:
        if len(v) != 4:
            raise ValueError("bbox 必须是四个数字")
        return v


class WrongQuestionOut(CamelModel):
    id: int
    question_id: int
    answer: str
    correct_answer: str
    correct_count: int = 0
    wrong_count: int = 0
    subject: str = ""
    analysis: str = ""
    knowledge_points: list[str]
    image: str
    # 入库时裁剪的插图快照（/files 静态 URL，无需鉴权）；迁移前的旧行可能为 NULL
    illustration_images: list[str] = []
    note: str

    @field_validator("illustration_images", mode="before")
    @classmethod
    def _none_to_empty_list(cls, v: object) -> object:
        return [] if v is None else v
    created_at: datetime
    # 关联题目的识别内容（§28：保留文本与插图，而非上传图片）
    question_no: str = ""
    question_text: str = ""
    illustrations: list[IllustrationOut] = []


class WrongQuestionResult(CamelModel):
    """做对/做错打卡：result 只能是 correct 或 wrong。"""

    result: Literal["correct", "wrong"]


class WrongQuestionSort(CamelModel):
    """置顶/置底：position 为 top（置顶）或 bottom（置底）。"""

    position: Literal["top", "bottom"]


class WrongQuestionUpdate(CamelModel):
    """PATCH /api/v1/wrong-questions/{id} 可编辑字段，None 表示不修改。"""

    subject: str | None = Field(default=None, max_length=32)
