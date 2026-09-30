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
        self._loop: asyncio.AbstractEventLoop | None = None
        self._pipeline = RecognitionPipeline()
        # 同一阶段的任务在排队或执行期间只保留一份，避免重复确认/重试
        # 导致同一试卷被并发或连续覆盖处理结果。
        self._pending: set[tuple[int, str]] = set()

    def start(self) -> None:
        if self._task is None:
            # asyncio.Queue 会绑定首次消费它的事件循环。开发环境和测试中
            # lifespan 可能反复创建不同 loop，因此每轮启动都重建队列。
            self.queue = asyncio.Queue()
            self._pending.clear()
            self._loop = asyncio.get_running_loop()
            self._task = asyncio.create_task(self._run(), name="recognition-worker")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
            self._loop = None

    def enqueue(self, job: RecognitionJob) -> None:
        key = (job.exam_id, job.stage)
        if key in self._pending:
            logger.info("跳过重复任务: exam=%s stage=%s", job.exam_id, job.stage)
            return
        self._pending.add(key)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is not None and running is self._loop:
            self.queue.put_nowait(job)
        elif self._loop is not None and self._loop.is_running():
            # 同步路由在线程池里执行，asyncio.Queue 非线程安全，必须跨线程投递
            self._loop.call_soon_threadsafe(self.queue.put_nowait, job)
        else:
            # worker 未启动（如纯单元测试）：直接入队，等 start() 后消费
            self.queue.put_nowait(job)
        logger.info("任务入队: exam=%s stage=%s", job.exam_id, job.stage)

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
                self._pending.discard((job.exam_id, job.stage))
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
