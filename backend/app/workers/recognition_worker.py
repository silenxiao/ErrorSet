"""单进程顺序执行的识别任务队列（§6.4）。

MVP 不引入 Celery/Redis：任务在 asyncio 队列中排队，
同一时刻只运行一个 Exam 的识别任务。
"""

import asyncio
from dataclasses import dataclass

from app.core.logging import get_logger
from app.pipeline.orchestrator import RecognitionPipeline

logger = get_logger(__name__)


@dataclass
class RecognitionJob:
    exam_id: int
    stage: str  # "global" | "local"


class RecognitionWorker:

    def __init__(self) -> None:
        self.queue: asyncio.Queue[RecognitionJob] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._pipeline = RecognitionPipeline()

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="recognition-worker")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def enqueue(self, job: RecognitionJob) -> None:
        self.queue.put_nowait(job)
        logger.info("任务入队: exam=%s stage=%s queue=%s", job.exam_id, job.stage, self.queue.qsize())

    async def _run(self) -> None:
        while True:
            job = await self.queue.get()
            try:
                if job.stage == "global":
                    await self._pipeline.run_global(job.exam_id)
                elif job.stage == "local":
                    await self._pipeline.run_local(job.exam_id)
                else:
                    logger.error("未知任务阶段: %s", job.stage)
            except Exception as exc:
                logger.exception(
                    "任务执行异常 exam=%s stage=%s", job.exam_id, job.stage
                )
                self._mark_failed(job.exam_id, str(exc))
            finally:
                self.queue.task_done()

    def _mark_failed(self, exam_id: int, error_message: str = "") -> None:
        """兜底：pipeline 内部未能置为 failed 时（如 Session 已损坏），用新 Session 补救。"""
        from app.database import repository as repo
        from app.database.database import SessionLocal
        from app.database.models import Exam

        db = SessionLocal()
        try:
            exam = db.get(Exam, exam_id)
            if exam is not None and exam.status in (
                "global_processing",
                "local_processing",
            ):
                repo.set_exam_failed(
                    db,
                    exam,
                    error_message or "识别任务异常中断，请重新识别",
                )
        except Exception:
            logger.exception("兜底置失败也失败 exam=%s", exam_id)
        finally:
            db.close()


worker = RecognitionWorker()
