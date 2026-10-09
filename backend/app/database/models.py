from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base


def _now() -> datetime:
    return datetime.now()


class User(Base):
    __tablename__ = "user"
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    # 登录身份独立于可被数据库复用的数字主键。
    auth_identity: Mapped[str] = mapped_column(String(32), default=lambda: uuid4().hex)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    # 当前生效的模型（可为自有模型，也可为系统模型），与 model_profile.enabled 同步维护。
    # 不加 FK：与 model_profile.user_id 形成循环依赖，create_all 无法建表
    active_model_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 用户调用系统模型的累计次数（每次识别任务解析到系统模型 +1），仅后台展示
    system_model_calls: Mapped[int] = mapped_column(Integer, default=0)
    # 孩子所在年级：注册时选择，首次上传试卷的默认年级，「我的」页可修改
    grade: Mapped[str] = mapped_column(String(32), default="一年级")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Exam(Base):
    __tablename__ = "exam"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    original_image: Mapped[str] = mapped_column(String(512))
    include_illustrations: Mapped[bool] = mapped_column(Boolean, default=True)
    grade: Mapped[str] = mapped_column(String(32), default="一年级")
    extra_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded", index=True)
    # 识别失败原因（超时/网络/API 错误等），状态转为非 failed 时清除
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    questions: Mapped[list["Question"]] = relationship(
        back_populates="exam", cascade="all, delete-orphan"
    )


class Question(Base):
    __tablename__ = "question"
    __table_args__ = {"sqlite_autoincrement": True}

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
    # 最近一次 AI 分析结果（未加入错题库时也能找回，只保留最新一次）。
    # 与错题库的 analysis 相互独立：入库时复制一份，之后各改各的。
    last_analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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


class ModelProfile(Base):
    """模型管理：用户配置的模型列表。enabled 表示当前启用的模型（每用户最多一条）。

    系统模型（is_system=True）user_id 为 NULL、由管理后台统一维护，enabled 表示
    公共开关（开启后所有用户可见可用）；用户的当前选择记录在 user.active_model_id。
    """

    __tablename__ = "model_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id"), nullable=True, index=True
    )
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    origin: Mapped[str] = mapped_column(String(16), default="user")
    name: Mapped[str] = mapped_column(String(64), default="")
    provider: Mapped[str] = mapped_column(String(64))
    base_url: Mapped[str] = mapped_column(String(512), default="")
    model: Mapped[str] = mapped_column(String(128), default="")
    api_key: Mapped[str] = mapped_column(String(512), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class Feedback(Base):
    """留言板：用户提交的留言，管理后台查看/删除。"""

    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class WrongQuestion(Base):
    __tablename__ = "wrong_question"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("question.id"), index=True)
    answer: Mapped[str] = mapped_column(Text, default="")
    correct_answer: Mapped[str] = mapped_column(Text, default="")
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    subject: Mapped[str] = mapped_column(String(32), default="")
    analysis: Mapped[str] = mapped_column(Text, default="")
    knowledge_points: Mapped[list] = mapped_column(JSON, default=list)
    image: Mapped[str] = mapped_column(String(512), default="")
    # 入库时按当前 bbox（含人工校正）裁剪的插图快照，相对 data_dir 的路径列表
    illustration_images: Mapped[list] = mapped_column(JSON, default=list)
    # 入库时题目文本快照：试卷删除后错题仍可独立展示（§28）
    question_no: Mapped[str] = mapped_column(String(64), default="")
    question_text: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    # 手动排序：0 为默认；置顶取最大+1，置底取最小-1；同序号按 created_at 降序
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)
