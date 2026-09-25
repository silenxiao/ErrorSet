from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base


def _now() -> datetime:
    return datetime.now()


class Exam(Base):
    __tablename__ = "exam"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    original_image: Mapped[str] = mapped_column(String(512))
    include_illustrations: Mapped[bool] = mapped_column(Boolean, default=True)
    grade: Mapped[str] = mapped_column(String(32), default="一年级")
    extra_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "question"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exam.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("question.id"), nullable=True, index=True
    )
    question_no: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text, default="")
    subject: Mapped[str] = mapped_column(String(32), default="")
    bbox: Mapped[list] = mapped_column(JSON)
    ai_bbox: Mapped[list] = mapped_column(JSON)
    bbox_source: Mapped[str] = mapped_column(String(16), default="ai")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending_review", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    exam: Mapped["Exam"] = relationship(back_populates="questions")
    illustrations: Mapped[list["Illustration"]] = relationship(
        back_populates="question", cascade="all, delete-orphan"
    )


class Illustration(Base):
    __tablename__ = "illustration"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question.id"), index=True)
    bbox: Mapped[list] = mapped_column(JSON)
    ai_bbox: Mapped[list] = mapped_column(JSON)
    bbox_source: Mapped[str] = mapped_column(String(16), default="ai")
    type: Mapped[str] = mapped_column(String(64), default="image")

    question: Mapped["Question"] = relationship(back_populates="illustrations")


class RecognitionTask(Base):
    __tablename__ = "recognition_task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exam.id"), index=True)
    question_id: Mapped[int | None] = mapped_column(
        ForeignKey("question.id"), nullable=True
    )
    stage: Mapped[str] = mapped_column(String(16))  # global / local
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    prompt_version: Mapped[str] = mapped_column(String(64))
    input_image: Mapped[str] = mapped_column(String(512))
    output_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ProviderSetting(Base):
    """识别服务商运行时配置（单行，id=1）。设置后覆盖 .env 默认值。"""

    __tablename__ = "provider_setting"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(String(512), default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    api_key: Mapped[str] = mapped_column(String(512), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class ModelProfile(Base):
    """模型管理：用户配置的模型列表。enabled 表示当前启用的模型（最多一条）。"""

    __tablename__ = "model_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), default="")
    provider: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(String(512), default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    api_key: Mapped[str] = mapped_column(String(512), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class WrongQuestion(Base):
    __tablename__ = "wrong_question"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question.id"), index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exam.id"), index=True)
    answer: Mapped[str] = mapped_column(Text, default="")
    correct_answer: Mapped[str] = mapped_column(Text, default="")
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    subject: Mapped[str] = mapped_column(String(32), default="")
    analysis: Mapped[str] = mapped_column(Text, default="")
    wrong_reason: Mapped[str] = mapped_column(Text, default="")
    knowledge_points: Mapped[list] = mapped_column(JSON, default=list)
    image: Mapped[str] = mapped_column(String(512), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    # 手动排序：0 为默认；置顶取最大+1，置底取最小-1；同序号按 created_at 降序
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
