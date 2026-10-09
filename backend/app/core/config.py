from functools import lru_cache
from ipaddress import ip_network
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录的 .env（cwd 无论在哪都能读到；backend/.env 可作本地覆盖）
# __file__ = backend/app/core/config.py -> parents[0]=core, [1]=app, [2]=backend, [3]=项目根(ErrorSet)
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
    # JWT 登录鉴权（生产环境务必在 .env 覆盖 jwt_secret）
    jwt_secret: str = "errorset-dev-secret-change-me"
    jwt_expire_days: int = 30
    # 空列表忽略转发头；部署时只列出实际 nginx 的 IP/CIDR。
    trusted_proxy_cidrs: list[str] = []

    @field_validator("trusted_proxy_cidrs")
    @classmethod
    def _validate_proxy_networks(cls, values: list[str]) -> list[str]:
        return [str(ip_network(value)) for value in values]

    # 首次启动（用户表为空时）播种的管理员账号；生产环境务必在 .env 覆盖密码
    seed_admin_username: str = "xiaohui"
    seed_admin_password: str = "123456"

    database_url: str = "sqlite:///./data/app.db"
    data_dir: str = "./data"
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
    ]

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
