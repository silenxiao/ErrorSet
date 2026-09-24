from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录的 .env（cwd 无论在哪都能读到；backend/.env 可作本地覆盖）
_PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """应用配置，来源：环境变量 / 项目根目录 .env（PROJECT_SPEC.md §23）。"""

    model_config = SettingsConfigDict(
        env_file=(_PROJECT_ROOT / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Vision Provider
    global_provider: str = "qwen"
    global_model: str = "qwen-vl-max"
    local_provider: str = "openai"
    local_model: str = "gpt-4o-mini"
    qwen_api_key: str = ""
    openai_api_key: str = ""
    gemini_api_key: str = ""
    zhipu_api_key: str = ""
    amd_api_key: str = ""

    # 应用
    database_url: str = "sqlite:///./data/app.db"
    data_dir: str = "./data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # 上传约束（§5.1）
    allowed_extensions: list[str] = ["jpg", "jpeg", "png", "webp"]
    max_upload_bytes: int = 10 * 1024 * 1024

    # 预处理（§5.2）
    max_image_side_px: int = 2000

    # Suspicious 默认阈值（§16.5）
    low_confidence: float = 0.7
    min_text_chars: int = 10
    min_bbox_area_ratio: float = 0.005
    max_bbox_area_ratio: float = 0.9
    bbox_iou_threshold: float = 0.6

    # 重试（§32）
    json_max_retries: int = 2
    network_max_retries: int = 3
    retry_base_delay_seconds: float = 2.0

    # Vision API 单次请求超时（整页长输出需要较长时间）
    provider_timeout_seconds: int = 300

    # 轮询
    poll_hint_seconds: float = 1.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
