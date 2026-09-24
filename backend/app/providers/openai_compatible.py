"""OpenAI 兼容接口的通用 Provider：DeepSeek / 自定义服务商等。"""

from app.providers.openai import OpenAIProvider


class OpenAICompatibleProvider(OpenAIProvider):
    """任意 OpenAI Chat Completions 兼容端点（base_url + /chat/completions）。"""

    def __init__(self, model: str, api_key: str, base_url: str, name: str = "custom"):
        super().__init__(model, api_key)
        self.endpoint = base_url.rstrip("/") + "/chat/completions"
        self.name = name
