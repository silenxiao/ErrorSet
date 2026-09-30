from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.api import questions, recognition, upload
from app.api import admin as admin_api
from app.api import feedback as feedback_api
from app.api import settings as settings_api
from app.api import auth
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.core.logging import get_logger, setup_logging
from app.database import repository as repo
from app.database.database import SessionLocal, init_db
from app.providers.base import close_http_client
from app.workers.recognition_worker import RecognitionJob, worker

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging()
    init_db()
    worker.start()
    # 进程重启后，恢复卡在处理中状态的试卷（§6.3 failed 可重跑）
    db = SessionLocal()
    try:
        stale = repo.fail_stale_processing_exams(db)
        if stale:
            logger.warning("启动恢复：%s 张试卷因进程中断置为 failed", stale)
        # 排队中（uploaded）的任务随进程丢失，重新入队。
        # 必须在 worker.start() 之后：start() 会重建队列，先入队的任务会丢失。
        for exam in repo.list_exams_by_status(db, "uploaded"):
            if exam.status == "uploaded":
                worker.enqueue(RecognitionJob(exam_id=exam.id, stage="global"))
                logger.info("启动恢复：试卷 %s 重新入队整页识别", exam.id)
    finally:
        db.close()
    logger.info("应用启动，识别 worker 已就绪")
    yield
    await worker.stop()
    await close_http_client()
    logger.info("应用关闭")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="AI 试卷识别与错题库系统",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router)
    app.include_router(upload.router)
    app.include_router(recognition.router)
    app.include_router(questions.router)
    app.include_router(feedback_api.router)
    app.include_router(settings_api.router)
    app.include_router(admin_api.router)
    # 试卷/裁剪/错题图片静态服务（§33：数据库只存路径）。
    # data_dir 根下还有 SQLite 数据库（含密码哈希与 API key），
    # 因此只暴露图片子目录，其余一律 404。
    app.mount(
        "/files",
        RestrictedStaticFiles(directory=settings.data_dir, check_dir=False),
        name="files",
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return app


# 允许通过 /files 访问的 data_dir 子目录；新增图片类型时同步补充
FILE_PUBLIC_SUBDIRS = frozenset({"originals", "working", "crops", "wrong-illustrations"})


class RestrictedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        # Starlette 在 Windows 上会给出反斜杠路径，先统一成 / 再取首段
        top = path.replace("\\", "/").split("/", 1)[0] if path else ""
        if top not in FILE_PUBLIC_SUBDIRS:
            return PlainTextResponse("Not Found", status_code=404)
        return await super().get_response(path, scope)


app = create_app()
