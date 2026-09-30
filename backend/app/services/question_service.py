"""题目相关业务：bbox 校验与修改、错题入库（§11/§13/§26/§36）。"""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.database import repository as repo
from app.database.models import Question, WrongQuestion
from app.schemas.question import AnalysisOut


def get_question_or_404(db: Session, question_id: int, user_id: int) -> Question:
    """取题目并校验归属：题目不属于当前用户（或不存在）一律 404。"""
    question = repo.get_question(db, question_id)
    exam = repo.get_exam(db, question.exam_id) if question is not None else None
    if exam is None or exam.user_id != user_id:
        raise NotFoundError(f"题目 {question_id} 不存在")
    return question


def validate_bbox(bbox: object) -> list[int]:
    """§36：0 <= x1 < x2 <= 1000、0 <= y1 < y2 <= 1000，超界自动收紧。"""
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        raise ValidationError("bbox 必须是 [x1, y1, x2, y2] 四个数字")
    try:
        x1, y1, x2, y2 = (round(float(v)) for v in bbox)
    except (TypeError, ValueError) as exc:
        raise ValidationError("bbox 必须是数字") from exc
    x1, y1 = max(0, min(1000, x1)), max(0, min(1000, y1))
    x2, y2 = max(0, min(1000, x2)), max(0, min(1000, y2))
    if x1 >= x2 or y1 >= y2:
        raise ValidationError("bbox 必须满足 x1 < x2 且 y1 < y2")
    if x2 - x1 <= 1 or y2 - y1 <= 1:
        raise ValidationError("bbox 尺寸过小")
    return [x1, y1, x2, y2]


def update_bbox(db: Session, question_id: int, user_id: int, bbox: object) -> Question:
    question = get_question_or_404(db, question_id, user_id)
    return repo.update_question_bbox(db, question, validate_bbox(bbox))


def reset_bbox(db: Session, question_id: int, user_id: int) -> Question:
    question = get_question_or_404(db, question_id, user_id)
    return repo.reset_question_bbox(db, question)


def update_question_fields(
    db: Session, question_id: int, user_id: int, **fields
) -> Question:
    """编辑题目字段（目前支持 text），仅传入的字段会被修改。"""
    question = get_question_or_404(db, question_id, user_id)
    return repo.update_question(db, question, **fields)


def get_illustration_or_404(
    db: Session, illustration_id: int, user_id: int
):
    """取插图并校验归属（插图 → 题目 → 试卷 → 用户）。"""
    illustration = repo.get_illustration(db, illustration_id)
    if illustration is None:
        raise NotFoundError(f"插图 {illustration_id} 不存在")
    question = repo.get_question(db, illustration.question_id)
    exam = repo.get_exam(db, question.exam_id) if question is not None else None
    if exam is None or exam.user_id != user_id:
        raise NotFoundError(f"插图 {illustration_id} 不存在")
    return illustration


def update_illustration_bbox(
    db: Session, illustration_id: int, user_id: int, bbox: object
):
    illustration = get_illustration_or_404(db, illustration_id, user_id)
    return repo.update_illustration_bbox(db, illustration, validate_bbox(bbox))


def reset_illustration_bbox(db: Session, illustration_id: int, user_id: int):
    illustration = get_illustration_or_404(db, illustration_id, user_id)
    return repo.reset_illustration_bbox(db, illustration)


def _delete_wrong_question_files(row: WrongQuestion) -> None:
    """清理错题记录引用的图片文件：题图快照 + 插图快照。"""

    from app.services.recognition_service import resolve_data_file

    paths = [row.image] if row.image else []
    paths.extend(row.illustration_images or [])
    for path_str in paths:
        resolve_data_file(path_str).unlink(missing_ok=True)


def delete_wrong_question(db: Session, wrong_id: int, user_id: int) -> None:
    """删除错题记录，并清理题图快照与插图快照文件。"""
    row = _wrong_question_or_404(db, wrong_id, user_id)
    _delete_wrong_question_files(row)
    repo.delete_wrong_question(db, row)


def delete_user_wrong_questions(db: Session, user_id: int) -> None:
    """删除某用户的全部错题记录并清理快照文件（管理后台删除用户时级联调用）。"""
    for row in repo.list_wrong_questions(db, user_id):
        _delete_wrong_question_files(row)
        repo.delete_wrong_question(db, row)


def _wrong_question_or_404(db: Session, wrong_id: int, user_id: int) -> WrongQuestion:
    row = repo.get_wrong_question(db, wrong_id)
    if row is None or row.user_id != user_id:
        raise NotFoundError(f"错题 {wrong_id} 不存在")
    return row


def sort_wrong_question(
    db: Session, wrong_id: int, user_id: int, position: str
) -> WrongQuestion:
    """置顶/置底：置顶取当前最大排序号+1，置底取最小排序号-1（仅在本人错题内）。"""
    row = _wrong_question_or_404(db, wrong_id, user_id)
    max_order, min_order = repo.wrong_question_sort_bounds(db, user_id)
    order = max_order + 1 if position == "top" else min_order - 1
    return repo.set_wrong_question_sort_order(db, row, order)


def record_wrong_question_result(
    db: Session, wrong_id: int, user_id: int, result: str
) -> WrongQuestion:
    """做对/做错打卡：result 为 correct 时做对次数 +1，否则做错次数 +1。"""
    row = _wrong_question_or_404(db, wrong_id, user_id)
    return repo.increment_wrong_question_count(db, row, correct=result == "correct")


def update_wrong_question(
    db: Session, wrong_id: int, user_id: int, **fields
) -> WrongQuestion:
    """编辑错题字段（目前支持 subject），空字符串表示清除（显示为未设置）。"""
    row = _wrong_question_or_404(db, wrong_id, user_id)
    return repo.update_wrong_question(db, row, **fields)


def _prepare_analyze_input(
    db: Session, question_id: int, user_id: int
) -> tuple[object, "TeacherQuestion"]:
    """同步准备 AI 分析输入：校验归属、渲染插图拼图，返回 (provider, TeacherQuestion)。

    Provider 接口是视觉专用的：无插图题目给一张 1x1 占位白图，
    答案完全基于已识别的题目文本。
    """
    import io
    import os
    import tempfile

    from PIL import Image

    from app.schemas.teacher import TeacherQuestion
    from app.services.settings_service import get_recognition_provider

    question = get_question_or_404(db, question_id, user_id)
    exam = repo.get_exam(db, question.exam_id)
    if exam is None:
        raise NotFoundError("题目所属试卷不存在")

    # 二次识别不计入系统模型调用次数（只统计整卷识别）
    provider = get_recognition_provider(exam.user_id, count_usage=False)

    illustrations = list(question.illustrations)
    if not illustrations:
        image_path = _write_blank_placeholder()
    else:
        # Render the linked diagrams and combine them into one canvas. Never send the
        # full exam or the question crop: only the selected question's own figures.
        figures = [
            Image.open(io.BytesIO(render_illustration_image(db, ill.id, user_id))).convert("RGB")
            for ill in illustrations
        ]
        try:
            gap = 16
            canvas = Image.new(
                "RGB",
                (
                    max(image.width for image in figures),
                    sum(image.height for image in figures) + gap * (len(figures) - 1),
                ),
                "white",
            )
            y = 0
            for image in figures:
                canvas.paste(image, ((canvas.width - image.width) // 2, y))
                y += image.height + gap
            # 拼图临时文件放系统临时目录（/files 只暴露 data_dir 的图片子目录）
            fd, image_path = tempfile.mkstemp(suffix=".png", prefix="analyze-")
            with os.fdopen(fd, "wb") as image_file:
                canvas.save(image_file, format="PNG")
        finally:
            for image in figures:
                image.close()

    question_input = TeacherQuestion(
        text=question.text,
        grade=exam.grade,
        subject=question.subject or None,
        image_path=image_path,
    )
    return provider, question_input


def _write_blank_placeholder() -> str:
    """无插图题目给一张 1x1 白图占位，用后即删。"""
    import os
    import tempfile

    from PIL import Image

    fd, path = tempfile.mkstemp(suffix=".png", prefix="analyze-blank-")
    with os.fdopen(fd, "wb") as image_file:
        Image.new("RGB", (1, 1), "white").save(image_file, format="PNG")
    return path


async def analyze_question(db: Session, question_id: int, user_id: int) -> AnalysisOut:
    """AI 分析题目答案，返回结构化 TeacherAnswer 字段。

    DB/PIL 准备工作放线程池，Provider 调用直接 await：视觉请求可长达数分钟，
    不能长期占用线程池线程，也不能阻塞事件循环。
    """
    import asyncio
    from pathlib import Path

    from app.agents.teacher_agent import TeacherAgent, TeacherAgentError
    from app.core.exceptions import ProviderError

    provider, question_input = await asyncio.to_thread(
        _prepare_analyze_input, db, question_id, user_id
    )
    try:
        agent = TeacherAgent(provider)
        try:
            answer = await agent.answer(question_input)
        except TeacherAgentError as exc:
            raise ProviderError(f"AI 分析失败：{exc}") from exc
    finally:
        if question_input.image_path:
            Path(question_input.image_path).unlink(missing_ok=True)
    return AnalysisOut(
        subject=answer.subject,
        answer=answer.answer,
        analysis=answer.analysis,
        knowledge_points=answer.knowledge_points,
        out_of_scope=answer.out_of_scope,
        confidence=answer.confidence,
    )


def _snapshot_illustrations(
    db: Session, question: Question, user_id: int
) -> list[str]:
    """把题目的插图按当前 bbox（含人工校正与 padding）裁剪成 PNG 快照。

    存入 data/wrong-illustrations/，返回相对 data_dir 的路径列表（存 DB）。
    """
    import uuid
    from pathlib import Path

    from app.core.config import get_settings

    settings = get_settings()
    target = Path(settings.data_dir) / "wrong-illustrations"
    target.mkdir(parents=True, exist_ok=True)
    paths = []
    for ill in question.illustrations:
        data = render_illustration_image(db, ill.id, user_id)
        name = f"{uuid.uuid4().hex}.png"
        (target / name).write_bytes(data)
        paths.append(
            f"{Path(settings.data_dir).as_posix()}/wrong-illustrations/{name}"
        )
    return paths


def create_wrong_question(db: Session, user_id: int, **kwargs) -> WrongQuestion:
    """加入错题库：插图按当前 bbox 裁剪为快照保留（§28）。

    同一题目重复加入时，先删除上次的插图快照文件，再就地更新记录
    （保留打卡计数与手动排序），不产生重复行。
    """
    question = get_question_or_404(db, kwargs["question_id"], user_id)

    fields = dict(
        answer=kwargs.get("answer", ""),
        correct_answer=kwargs.get("correct_answer", ""),
        subject=kwargs.get("subject", ""),
        analysis=kwargs.get("analysis", ""),
        knowledge_points=kwargs.get("knowledge_points") or [],
        note=kwargs.get("note", ""),
        # 题目文本快照：试卷/题目删除后错题列表仍可展示（§28）
        question_no=question.question_no,
        question_text=question.text,
    )
    illustration_images = _snapshot_illustrations(db, question, user_id)

    existing = repo.get_wrong_question_by_question(db, question.id)
    if existing is not None:
        _delete_wrong_question_files(existing)
        return repo.update_wrong_question(
            db,
            existing,
            illustration_images=illustration_images,
            image="",
            **fields,
        )
    try:
        return repo.create_wrong_question(
            db,
            user_id=question.exam.user_id,
            question_id=question.id,
            illustration_images=illustration_images,
            image="",
            **fields,
        )
    except IntegrityError:
        # 并发加入同一题目撞了 question_id 唯一索引：回滚后就地更新已有记录
        db.rollback()
        existing = repo.get_wrong_question_by_question(db, question.id)
        if existing is None:
            raise
        _delete_wrong_question_files(existing)
        return repo.update_wrong_question(
            db,
            existing,
            illustration_images=illustration_images,
            image="",
            **fields,
        )


def render_illustration_image(
    db: Session, illustration_id: int, user_id: int
) -> bytes:
    """按插图当前 bbox（含 padding）从原图裁剪 PNG 字节，供前端展示。"""
    import io

    from PIL import Image

    illustration = get_illustration_or_404(db, illustration_id, user_id)
    question = get_question_or_404(db, illustration.question_id, user_id)
    exam = repo.get_exam(db, question.exam_id)
    if exam is None:
        raise NotFoundError("插图所属试卷不存在")

    x1, y1, x2, y2 = illustration.bbox
    if x1 >= x2 or y1 >= y2:
        raise ValidationError(f"插图 bbox 无效: {illustration.bbox}")

    with Image.open(exam.original_image) as im:
        width, height = im.size
        pad_x = (x2 - x1) / 1000 * width * 0.02
        pad_y = (y2 - y1) / 1000 * height * 0.02
        box = (
            max(0, int(x1 / 1000 * width - pad_x)),
            max(0, int(y1 / 1000 * height - pad_y)),
            min(width, int(x2 / 1000 * width + pad_x)),
            min(height, int(y2 / 1000 * height + pad_y)),
        )
        crop = im.convert("RGB").crop(box)
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        return buf.getvalue()
