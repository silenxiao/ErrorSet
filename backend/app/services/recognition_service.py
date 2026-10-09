"""试卷相关业务：上传、确认、重新识别、删除（§5/§6/§26）。"""

import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import InvalidStateError, NotFoundError, UploadError
from app.core.logging import get_logger
from app.database import repository as repo
from app.database.models import Exam
from app.pipeline.preprocess import processed_path_for
from app.prompts.global_question import EXTRA_PROMPT_MAX_CHARS

logger = get_logger(__name__)


def resolve_data_file(path_str: str) -> Path:
    """DB 里的图片路径可能是相对路径（相对后端工作目录），统一解析成绝对 Path。"""
    path = Path(path_str)
    return path if path.is_absolute() else Path.cwd() / path


def _sniff_image_format(file_bytes: bytes) -> str | None:
    """按文件头识别真实图片格式，返回归一化扩展名（jpg/jpeg 同义）；识别不出返回 None。"""
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if file_bytes[:4] == b"RIFF" and file_bytes[8:12] == b"WEBP":
        return "webp"
    return None


def get_exam_or_404(db: Session, exam_id: int, user_id: int) -> Exam:
    exam = repo.get_exam(db, exam_id)
    if exam is None or exam.user_id != user_id:
        raise NotFoundError(f"试卷 {exam_id} 不存在")
    return exam


def create_exam_from_upload(
    db: Session,
    *,
    user_id: int,
    file_bytes: bytes,
    filename: str,
    name: str,
    include_illustrations: bool = True,
    grade: str = "一年级",
) -> Exam:
    """保存原始图片并创建 Exam（§5.1 约束在这里校验）。"""
    settings = get_settings()
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext not in settings.allowed_extensions:
        raise UploadError(f"不支持的图片格式: {ext}，仅支持 {'/'.join(settings.allowed_extensions)}")
    if not file_bytes:
        raise UploadError("文件为空")
    if len(file_bytes) > settings.max_upload_bytes:
        raise UploadError("文件超过 10MB 限制")
    # 内容与扩展名双重校验：改后缀伪装的文件在这里被拒
    normalized_ext = "jpg" if ext == "jpeg" else ext
    sniffed = _sniff_image_format(file_bytes)
    if sniffed != normalized_ext:
        raise UploadError("文件内容与扩展名不符，请上传真实图片")

    originals_dir = Path(settings.data_dir) / "originals"
    originals_dir.mkdir(parents=True, exist_ok=True)
    saved_path = originals_dir / f"{uuid.uuid4().hex}.{ext}"
    saved_path.write_bytes(file_bytes)

    exam = repo.create_exam(
        db,
        user_id=user_id,
        name=name.strip() or Path(filename).stem,
        original_image=str(saved_path),
        include_illustrations=include_illustrations,
        grade=grade,
    )
    logger.info("试卷已创建: id=%s file=%s 含插图=%s", exam.id, saved_path.name, include_illustrations)
    return exam


def data_file_url(path: str, viewer_id: int, *, admin: bool = False) -> str:
    """只为已经完成归属验证的资源签发短时效图片链接。"""
    from app.core.media_access import signed_media_url
    return signed_media_url(path, viewer_id=viewer_id, admin=admin)


def exam_image_url(exam: Exam, viewer_id: int) -> str:
    return data_file_url(exam.original_image, viewer_id)


def confirm_exam(db: Session, exam_id: int, user_id: int) -> Exam:
    """确认触发二次识别，仅 awaiting_review 状态有效（§6.2）。"""
    exam = get_exam_or_404(db, exam_id, user_id)
    if exam.status != "awaiting_review":
        raise InvalidStateError(
            f"当前状态为 {exam.status}，只有 awaiting_review 可以确认"
        )
    return exam


def rerecognize_exam(
    db: Session,
    exam_id: int,
    user_id: int,
    include_illustrations: bool | None = None,
    extra_prompt: str | None = None,
) -> Exam:
    """清除识别结果并重新执行两段识别。

    include_illustrations 不为 None 时先更新试卷的插图识别设置。
    extra_prompt 不为 None 时更新用户补充提示词（空白视为清除），
    超过 EXTRA_PROMPT_MAX_CHARS 的提交直接弃用（保留试卷已有设置），
    供本次及后续识别的 Global/Local 两段共同使用。
    """
    exam = get_exam_or_404(db, exam_id, user_id)
    if exam.status in ("global_processing", "local_processing"):
        raise InvalidStateError("识别进行中，无法重新识别")
    dirty = False
    if include_illustrations is not None:
        exam.include_illustrations = include_illustrations
        dirty = True
    if extra_prompt is not None:
        if len(extra_prompt) > EXTRA_PROMPT_MAX_CHARS:
            # 超过上限直接弃用本次提交的补充提示词，沿用试卷已有设置
            logger.warning(
                "试卷 %s 的补充提示词超过 %s 字（%s），已弃用",
                exam_id,
                EXTRA_PROMPT_MAX_CHARS,
                len(extra_prompt),
            )
        else:
            exam.extra_prompt = extra_prompt.strip() or None
            dirty = True
    if dirty:
        db.commit()
        db.refresh(exam)
    # 先收集上一轮识别产生的文件（crops 等），随识别结果一起清掉，
    # 否则这些文件与任何记录脱钩后会永远残留在 data/ 下。
    stale_files = repo.list_exam_image_files(db, exam.id)
    repo.delete_recognition_results(db, exam.id)
    for path_str in stale_files:
        resolve_data_file(path_str).unlink(missing_ok=True)
    return repo.set_exam_status(db, exam, "uploaded")


def delete_exam_and_files(db: Session, exam_id: int, user_id: int) -> None:
    """删除试卷及其识别图片文件（原图、预处理图、题目裁剪图）；错题库记录保留。"""
    settings = get_settings()
    exam = get_exam_or_404(db, exam_id, user_id)
    paths = [
        resolve_data_file(exam.original_image),
        processed_path_for(exam.original_image, settings.data_dir),
        *(resolve_data_file(p) for p in repo.list_exam_image_files(db, exam.id)),
    ]
    repo.delete_exam(db, exam)
    for path in paths:
        path.unlink(missing_ok=True)
    logger.info("试卷 %s 已删除，清理图片 %d 个", exam_id, len(paths))
