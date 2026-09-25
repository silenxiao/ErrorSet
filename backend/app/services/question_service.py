"""题目相关业务：bbox 校验与修改、错题入库（§11/§13/§26/§36）。"""

from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError, ValidationError
from app.database import repository as repo
from app.database.models import Question, WrongQuestion


def get_question_or_404(db: Session, question_id: int) -> Question:
    question = repo.get_question(db, question_id)
    if question is None:
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


def update_bbox(db: Session, question_id: int, bbox: object) -> Question:
    question = get_question_or_404(db, question_id)
    return repo.update_question_bbox(db, question, validate_bbox(bbox))


def reset_bbox(db: Session, question_id: int) -> Question:
    question = get_question_or_404(db, question_id)
    return repo.reset_question_bbox(db, question)


def update_question_fields(db: Session, question_id: int, **fields) -> Question:
    """编辑题目字段（目前支持 text），仅传入的字段会被修改。"""
    question = get_question_or_404(db, question_id)
    return repo.update_question(db, question, **fields)


def get_illustration_or_404(db: Session, illustration_id: int):
    from app.core.exceptions import NotFoundError
    from app.database.models import Illustration

    illustration = repo.get_illustration(db, illustration_id)
    if illustration is None:
        raise NotFoundError(f"插图 {illustration_id} 不存在")
    return illustration


def update_illustration_bbox(db: Session, illustration_id: int, bbox: object):
    illustration = get_illustration_or_404(db, illustration_id)
    return repo.update_illustration_bbox(db, illustration, validate_bbox(bbox))


def reset_illustration_bbox(db: Session, illustration_id: int):
    illustration = get_illustration_or_404(db, illustration_id)
    return repo.reset_illustration_bbox(db, illustration)


def delete_wrong_question(db: Session, wrong_id: int) -> None:
    """删除错题记录，并清理题图快照文件（插图本身按 bbox 动态裁剪、无独立文件）。"""

    from app.services.recognition_service import resolve_data_file

    row = repo.get_wrong_question(db, wrong_id)
    if row is None:
        raise NotFoundError(f"错题 {wrong_id} 不存在")

    image = resolve_data_file(row.image) if row.image else None
    repo.delete_wrong_question(db, row)
    if image is not None:
        image.unlink(missing_ok=True)


def record_wrong_question_result(
    db: Session, wrong_id: int, result: str
) -> WrongQuestion:
    """做对/做错打卡：result 为 correct 时做对次数 +1，否则做错次数 +1。"""
    row = repo.get_wrong_question(db, wrong_id)
    if row is None:
        raise NotFoundError(f"错题 {wrong_id} 不存在")
    return repo.increment_wrong_question_count(db, row, correct=result == "correct")


def update_wrong_question(db: Session, wrong_id: int, **fields) -> WrongQuestion:
    """编辑错题字段（目前支持 subject），空字符串表示清除（显示为未设置）。"""
    row = repo.get_wrong_question(db, wrong_id)
    if row is None:
        raise NotFoundError(f"错题 {wrong_id} 不存在")
    return repo.update_wrong_question(db, row, **fields)


def analyze_question(db: Session, question_id: int) -> str:
    """Analyze recognized text and only illustrations associated with this question."""
    import asyncio
    import io
    import tempfile
    from pathlib import Path

    from PIL import Image

    from app.core.config import get_settings
    from app.prompts.question_answer import ANALYZE_PROMPT
    from app.providers.base import VisionRequest
    from app.services.settings_service import get_recognition_provider

    question = get_question_or_404(db, question_id)
    exam = repo.get_exam(db, question.exam_id)
    if exam is None:
        raise NotFoundError("题目所属试卷不存在")

    prompt = (
        f"{ANALYZE_PROMPT}\n\n"
        f"【年级范围】{exam.grade}（解题只用该年级及以下的知识与方法）\n"
        f"【当前题号】{question.question_no}\n"
        f"【当前题目文字；只解答这一题】\n{question.text.strip()}"
    )
    provider = get_recognition_provider()
    illustrations = list(question.illustrations)

    async def _call(image_path: str) -> str:
        response = await provider.analyze(
            VisionRequest(image_path=image_path, prompt=prompt)
        )
        return response.text.strip()

    if not illustrations:
        # Provider interface is vision-only. Give it a neutral placeholder so the
        # actual answer is derived solely from the already-recognized question text.
        settings = get_settings()
        placeholder = Path(settings.data_dir) / "analysis-blank.png"
        placeholder.parent.mkdir(parents=True, exist_ok=True)
        if not placeholder.exists():
            Image.new("RGB", (1, 1), "white").save(placeholder, format="PNG")
        return asyncio.run(_call(str(placeholder)))

    # Render the linked diagrams and combine them into one canvas. Never send the
    # full exam or the question crop: only the selected question's own figures.
    figures = [
        Image.open(io.BytesIO(render_illustration_image(db, ill.id))).convert("RGB")
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
        settings = get_settings()
        Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            suffix=".png", dir=settings.data_dir, delete=False
        ) as image_file:
            image_path = image_file.name
        try:
            canvas.save(image_path, format="PNG")
            return asyncio.run(_call(image_path))
        finally:
            Path(image_path).unlink(missing_ok=True)
    finally:
        for image in figures:
            image.close()


def create_wrong_question(db: Session, **kwargs) -> WrongQuestion:
    """加入错题库：记录文本与关联，插图由前端按需动态裁剪展示。"""
    question = get_question_or_404(db, kwargs["question_id"])
    exam = repo.get_exam(db, question.exam_id)
    if exam is None:
        raise NotFoundError("题目所属试卷不存在")

    return repo.create_wrong_question(
        db,
        question_id=question.id,
        exam_id=exam.id,
        answer=kwargs.get("answer", ""),
        correct_answer=kwargs.get("correct_answer", ""),
        subject=kwargs.get("subject", ""),
        analysis=kwargs.get("analysis", ""),
        wrong_reason=kwargs.get("wrong_reason", ""),
        knowledge_points=kwargs.get("knowledge_points") or [],
        image="",
        note=kwargs.get("note", ""),
    )


def render_illustration_image(db: Session, illustration_id: int) -> bytes:
    """按插图当前 bbox（含 padding）从原图裁剪 PNG 字节，供前端展示。"""
    import io

    from PIL import Image

    illustration = get_illustration_or_404(db, illustration_id)
    question = get_question_or_404(db, illustration.question_id)
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
