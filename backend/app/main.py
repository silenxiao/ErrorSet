from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from app.workers.recognition_worker import RecognitionJob, worker

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    setup_logging()
    init_db()
    # 进程重启后，恢复卡在处理中状态的试卷（§6.3 failed 可重跑）
    db = SessionLocal()
    try:
        stale = repo.fail_stale_processing_exams(db)
        if stale:
            logger.warning("启动恢复：%s 张试卷因进程中断置为 failed", stale)
        # 排队中（uploaded）的任务随进程丢失，重新入队
        for exam in repo.list_exams_by_status(db, "uploaded"):
            if exam.status == "uploaded":
                worker.enqueue(RecognitionJob(exam_id=exam.id, stage="global"))
                logger.info("启动恢复：试卷 %s 重新入队整页识别", exam.id)
    finally:
        db.close()
    worker.start()
    logger.info("应用启动，识别 worker 已就绪")
    yield
    await worker.stop()
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
    # 试卷/裁剪/错题图片静态服务（§33：数据库只存路径）
    app.mount(
        "/files",
        StaticFiles(directory=settings.data_dir, check_dir=False),
        name="files",
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return app


app = create_app()
