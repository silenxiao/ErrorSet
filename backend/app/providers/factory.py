from app.core.config import get_settings
from app.core.exceptions import ProviderAuthError
from app.providers.amd import AMDProvider
from app.providers.base import VisionProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai import OpenAIProvider
from app.providers.openai_compatible import OpenAICompatibleProvider
from app.providers.qwen import QwenProvider
from app.providers.zhipu import ZhipuProvider

# 已知服务商的 OpenAI 兼容默认地址（仅当未显式提供 base_url 时使用）
DEFAULT_BASE_URLS: dict[str, str] = {
    "deepseek": "https://api.deepseek.com",
}


class ProviderFactory:
    """按名称创建 Provider，业务层不关心具体供应商（§22）。

    api_key / base_url 可由运行时设置覆盖；缺省回落到 .env。
    """

    @staticmethod
    def create(
        provider_name: str,
        model: str,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> VisionProvider:
        settings = get_settings()
        name = provider_name.lower()

        env_key = {
            "openai": settings.openai_api_key,
            "qwen": settings.qwen_api_key,
            "gemini": settings.gemini_api_key,
            "zhipu": settings.zhipu_api_key,
            "glm": settings.zhipu_api_key,
            "amd": settings.amd_api_key,
        }.get(name, "")

        resolved_key = api_key if api_key else env_key
        resolved_base = base_url or DEFAULT_BASE_URLS.get(name)

        if resolved_base:
            provider: VisionProvider = OpenAICompatibleProvider(
                model, resolved_key, resolved_base, name=name
            )
        elif name == "openai":
            provider = OpenAIProvider(model, resolved_key)
        elif name == "qwen":
            provider = QwenProvider(model, resolved_key)
        elif name == "gemini":
            provider = GeminiProvider(model, resolved_key)
        elif name in ("zhipu", "glm"):
            provider = ZhipuProvider(model, resolved_key)
        elif name == "amd":
            provider = AMDProvider(model, resolved_key)
        else:
            raise ValueError(f"未知 provider: {provider_name}")

        if not getattr(provider, "api_key", None):
            raise ProviderAuthError(
                f"Provider '{name}' 的 API Key 未配置，请在设置中填写"
            )
        return provider