"""Recognition Pipeline（§29）：整页识别成功后直接完成。"""

import asyncio

from app.core.config import get_settings
from app.core.logging import get_logger
from app.database import repository as repo
from app.database.database import SessionLocal
from app.database.models import Exam
from app.pipeline.global_recognition import recognize_global
from app.pipeline.preprocess import preprocess_image
from app.pipeline.validator import normalize_global
from app.prompts.global_question import PROMPT_VERSION as GLOBAL_PROMPT_VERSION
from app.prompts.local_question import PROMPT_VERSION as LOCAL_PROMPT_VERSION
from app.providers.base import usage_from_raw, VisionProvider, VisionResponse
from app.services.settings_service import get_recognition_provider

logger = get_logger(__name__)


class RecognitionPipeline:

    def __init__(self) -> None:
        self.settings = get_settings()

    # ------------------------------------------------------------------
    # 上传后自动执行，识别成功后直接完成
    # ------------------------------------------------------------------

    async def run_global(self, exam_id: int) -> None:
        db = SessionLocal()
        try:
            exam = repo.get_exam(db, exam_id)
            if exam is None:
                logger.error("run_global: Exam %s 不存在", exam_id)
                return
            if not repo.transition_exam_status(
                db, exam, expected_status="uploaded", target_status="global_processing"
            ):
                logger.warning(
                    "run_global: Exam %s 状态为 %s，跳过", exam_id, exam.status
                )
                return
            try:
                # PIL 解码/缩放在线程池执行，避免阻塞事件循环上的 HTTP 请求
                processed = await asyncio.to_thread(
                    preprocess_image, exam.original_image, self.settings.data_dir
                )
                repo.set_exam_size(
                    db, exam, width=processed.width, height=processed.height
                )

                provider = get_recognition_provider(exam.user_id)

                def on_call(response: VisionResponse) -> None:
                    self._record_task(
                        db,
                        exam=exam,
                        stage="global",
                        provider=provider,
                        prompt_version=GLOBAL_PROMPT_VERSION,
                        input_image=processed.path,
                        response=response,
                        status="completed",
                    )

                parsed = await recognize_global(
                    provider,
                    processed.path,
                    on_call=on_call,
                    include_illustrations=exam.include_illustrations,
                    extra_prompt=exam.extra_prompt,
                )
                normalized = normalize_global(parsed)
                if not exam.include_illustrations:
                    # 上传时声明无插图：丢弃模型可能误报的插图
                    for n in normalized:
                        n.illustrations = []
                repo.save_questions(
                    db,
                    exam,
                    [
                        {
                            "question_no": n.question_no,
                            "text": n.text,
                            "subject": n.subject,
                            "bbox": n.bbox,
                            "ai_bbox": n.ai_bbox,
                            "confidence": n.confidence,
                            "illustrations": n.illustrations,
                            "parent_no": n.parent_no,
                            "parent_index": n.parent_index,
                        }
                        for n in normalized
                    ],
                )
                logger.info(
                    "Exam %s Global 完成：%s 道题目，直接完成",
                    exam_id,
                    len(normalized),
                )
                repo.set_exam_status(db, exam, "completed")
            except Exception as exc:
                logger.exception("Exam %s Global 失败: %s", exam_id, exc)
                db.rollback()  # 清理坏状态的 Session，否则后续写入全部失败
                self._record_failed_task(db, exam_id, "global", str(exc))
                repo.set_exam_failed(db, exam, str(exc))
        finally:
            db.close()

    # ------------------------------------------------------------------
    # 兼容旧队列：直接完成已有结果，不再调用局部识别
    # ------------------------------------------------------------------

    async def run_local(self, exam_id: int) -> None:
        db = SessionLocal()
        try:
            exam = repo.get_exam(db, exam_id)
            if exam is None:
                logger.warning("run_local: Exam %s 不存在", exam_id)
                return
            # 原子认领旧队列任务，避免重复处理
            if not repo.transition_exam_status(
                db, exam, expected_status="local_queued",
                target_status="local_processing",
            ):
                logger.warning(
                    "run_local: Exam %s 状态为 %s，不允许确认", exam_id, exam.status
                )
                return

            for question in repo.list_questions(db, exam.id):
                repo.set_question_status(db, question, "completed")

            repo.set_exam_status(db, exam, "completed")
            logger.info("Exam %s 旧识别任务已完成", exam_id)
        finally:
            db.close()

    # ------------------------------------------------------------------
    # RecognitionTask 记录（§24）
    # ------------------------------------------------------------------

    def _record_task(
        self,
        db,
        *,
        exam: Exam,
        stage: str,
        provider: VisionProvider,
        prompt_version: str,
        input_image: str,
        response: VisionResponse,
        status: str,
        question_id: int | None = None,
    ) -> None:
        input_tokens, output_tokens = usage_from_raw(provider.name, response.raw)
        repo.create_task(
            db,
            exam_id=exam.id,
            question_id=question_id,
            stage=stage,
            provider=provider.name,
            model=response.model,
            prompt_version=prompt_version,
            input_image=input_image,
            output_json=response.text[:20000],
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=(
                input_tokens + output_tokens
                if input_tokens is not None and output_tokens is not None
                else None
            ),
            cost=provider.estimate_cost(input_tokens, output_tokens),
            latency_ms=response.latency_ms,
            status=status,
        )

    def _record_failed_task(
        self,
        db,
        exam_id: int,
        stage: str,
        error: str,
        question_id: int | None = None,
    ) -> None:
        settings = self.settings
        if stage == "global":
            provider_name, model = settings.global_provider, settings.global_model
            prompt_version = GLOBAL_PROMPT_VERSION
        else:
            provider_name, model = settings.local_provider, settings.local_model
            prompt_version = LOCAL_PROMPT_VERSION
        repo.create_task(
            db,
            exam_id=exam_id,
            question_id=question_id,
            stage=stage,
            provider=provider_name,
            model=model,
            prompt_version=prompt_version,
            input_image="",
            status="failed",
            error=error[:5000],
        )
